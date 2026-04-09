const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, insert } = require('../config/db');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'quiz_generator_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

async function getUserRoleById(userId) {
  if (!userId) return null;
  const rows = await query('SELECT role FROM users WHERE id = ? AND is_active = 1', [userId]);
  return rows[0]?.role || null;
}

async function ensureAdmin(requestUser) {
  const role = await getUserRoleById(requestUser?.id);
  if (role !== 'admin') {
    return { success: false, message: 'Bạn không có quyền thực hiện thao tác này' };
  }
  return null;
}

module.exports = function (ipcMain) {
  // ── Đăng ký ──
  ipcMain.handle('auth:register', async (event, data) => {
    try {
      const { username, email, password, fullName } = data;
      // role luôn là 'student' khi tự đăng ký – admin cấp quyền sau

      if (!username?.trim())  return { success: false, message: 'Tên đăng nhập không được để trống' };
      if (!email?.trim())     return { success: false, message: 'Email không được để trống' };
      if (!password || password.length < 6)
        return { success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự' };

      const existing = await query(
        'SELECT id FROM users WHERE email = ? OR username = ?',
        [email.trim(), username.trim()]
      );
      if (existing.length > 0)
        return { success: false, message: 'Email hoặc username đã tồn tại' };

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // BUG-01 FIX: luôn dùng 'student', không để client tự đặt role
      const result = await insert(
        `INSERT INTO users (username, email, password_hash, full_name, role)
         VALUES (?, ?, ?, ?, ?)`,
        [username.trim(), email.trim(), passwordHash, (fullName || '').trim(), 'student']
      );

      const token = jwt.sign(
        { userId: result.insertId, role: 'student' },  // BUG-01 FIX: hardcode 'student'
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      return {
        success: true,
        token,
        user: {
          id: result.insertId,
          username: username.trim(),
          email: email.trim(),
          fullName: (fullName || '').trim(),
          role: 'student',  // BUG-01 FIX: hardcode 'student'
        },
      };
    } catch (err) {
      console.error('auth:register error:', err);
      return { success: false, message: err.message };
    }
  });

  // ── Đăng nhập ──
  ipcMain.handle('auth:login', async (event, data) => {
    try {
      const { email, password } = data;

      const users = await query(
        'SELECT * FROM users WHERE email = ? AND is_active = 1',
        [email]
      );
      if (users.length === 0) {
        return { success: false, message: 'Email không tồn tại hoặc tài khoản bị khóa' };
      }

      const user = users[0];
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        // Log failed login
        await insert(
          'INSERT INTO login_history (user_id, login_method, is_success) VALUES (?, ?, ?)',
          [user.id, 'password', 0]
        );
        return { success: false, message: 'Mật khẩu không đúng' };
      }

      // Log success login
      await insert(
        'INSERT INTO login_history (user_id, login_method, is_success) VALUES (?, ?, ?)',
        [user.id, 'password', 1]
      );

      // Update streak qua stored procedure
      try {
        const { execProc } = require('../config/db');
        await execProc('sp_update_streak', { user_id: user.id });
      } catch (e) {
        console.warn('sp_update_streak warning:', e.message);
      }

      // Lấy lại user mới nhất (sau khi sp_update_streak cập nhật)
      const updatedUsers = await query(
        `SELECT id, username, email, full_name, avatar_url, role,
                xp_points, level, streak_days, longest_streak, total_exams_taken
         FROM users WHERE id = ?`, [user.id]
      );
      const u = updatedUsers[0];

      // Generate token
      const token = jwt.sign(
        { userId: u.id, role: u.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      return {
        success: true,
        token,
        user: {
          id: u.id,
          username: u.username,
          email: u.email,
          fullName: u.full_name,
          avatarUrl: u.avatar_url,
          role: u.role,
          xpPoints: u.xp_points,
          level: u.level,
          streakDays: u.streak_days,
          longestStreak: u.longest_streak,
          totalExamsTaken: u.total_exams_taken,
        },
      };
    } catch (err) {
      console.error('auth:login error:', err);
      return { success: false, message: err.message };
    }
  });

  // ── Verify Token ──
  ipcMain.handle('auth:verify', async (event, token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const users = await query(
        `SELECT id, username, email, full_name, avatar_url, role,
                xp_points, level, streak_days, longest_streak, total_exams_taken
         FROM users WHERE id = ? AND is_active = 1`,
        [decoded.userId]
      );

      if (users.length === 0) {
        return { success: false, message: 'User không tồn tại' };
      }

      const user = users[0];
      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          role: user.role,
          xpPoints: user.xp_points,
          level: user.level,
          streakDays: user.streak_days,
          longestStreak: user.longest_streak,
          totalExamsTaken: user.total_exams_taken,
        },
      };
    } catch (err) {
      return { success: false, message: 'Token không hợp lệ hoặc hết hạn' };
    }
  });

  // ── Đổi mật khẩu ──
  ipcMain.handle('user:changePassword', async (event, data) => {
    try {
      const { userId, currentPassword, newPassword } = data;
      // FIX BUG#4 – Validate mật khẩu mới
      if (!newPassword || newPassword.length < 6)
        return { success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự' };

      const users = await query('SELECT password_hash FROM users WHERE id = ?', [userId]);
      if (users.length === 0) return { success: false, message: 'User không tồn tại' };

      const isMatch = await bcrypt.compare(currentPassword, users[0].password_hash);
      if (!isMatch) return { success: false, message: 'Mật khẩu hiện tại không đúng' };

      const salt = await bcrypt.genSalt(10);
      const newHash = await bcrypt.hash(newPassword, salt);
      await query('UPDATE users SET password_hash = ?, updated_at = GETDATE() WHERE id = ?', [newHash, userId]);

      return { success: true, message: 'Đổi mật khẩu thành công' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // ── Profile ──
  ipcMain.handle('user:getProfile', async (event, userId) => {
    try {
      const users = await query(
        `SELECT id, username, email, full_name, phone, avatar_url, role,
                xp_points, level, streak_days, longest_streak, total_exams_taken,
                total_ai_usage, created_at
         FROM users WHERE id = ? AND is_active = 1`, [userId]);
      if (users.length === 0) return { success: false, message: 'User không tồn tại' };
      return { success: true, user: users[0] };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('user:updateProfile', async (event, userId, data) => {
    try {
      const { fullName, phone, avatarUrl } = data;
      await query(
        'UPDATE users SET full_name = ?, phone = ?, avatar_url = ?, updated_at = GETDATE() WHERE id = ?',
        [fullName, phone || null, avatarUrl || null, userId]);
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // ── Admin: Quản lý users ──
  ipcMain.handle('user:getAll', async (event, params = {}, requestUser = null) => {
    try {
      const denied = await ensureAdmin(requestUser);
      if (denied) return denied;

      const { role, search, page = 1, limit = 20 } = params;
      const safePage  = Math.max(1, parseInt(page)  || 1);
      const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
      const offset    = (safePage - 1) * safeLimit;

      let where = 'WHERE 1=1';
      const p = [];
      if (role)   { where += ' AND role = ?'; p.push(role); }
      if (search?.trim()) {
        where += ' AND (full_name LIKE ? OR email LIKE ? OR username LIKE ?)';
        p.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
      }

      // Count
      const countRows = await query(`SELECT COUNT(*) AS total FROM users ${where}`, [...p]);
      const total = countRows[0]?.total ?? 0;

      // Data
      const sql = `SELECT id, username, email, full_name, role, xp_points, level,
                          streak_days, is_active, created_at
                   FROM users ${where}
                   ORDER BY created_at DESC
                   OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`;
      const users = await query(sql, [...p, offset, safeLimit]);

      return {
        success: true,
        users,
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('user:updateRole', async (event, userId, role, requestUser = null) => {
    try {
      const denied = await ensureAdmin(requestUser);
      if (denied) return denied;

      if (!['admin', 'teacher', 'student'].includes(role)) {
        return { success: false, message: 'Role không hợp lệ' };
      }

      await query('UPDATE users SET role = ?, updated_at = GETDATE() WHERE id = ?', [role, userId]);
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('user:delete', async (event, userId, requestUser = null) => {
    try {
      const denied = await ensureAdmin(requestUser);
      if (denied) return denied;

      if (Number(requestUser?.id) === Number(userId)) {
        return { success: false, message: 'Không thể tự khóa tài khoản admin hiện tại' };
      }

      await query('UPDATE users SET is_active = 0, updated_at = GETDATE() WHERE id = ?', [userId]);
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // ── User Settings ──
  ipcMain.handle('user:getSettings', async (event, userId) => {
    try {
      const settings = await query('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
      return { success: true, settings: settings[0] || null };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('user:updateSettings', async (event, userId, data) => {
    try {
      const { theme, fontSize, language, enableTts, enableNotifications, enableSound, highContrast, aiTutorEnabled } = data;

      // UPSERT: ensure row exists before updating
      const existing = await query('SELECT id FROM user_settings WHERE user_id = ?', [userId]);
      if (existing.length === 0) {
        await insert(
          `INSERT INTO user_settings (user_id, theme, font_size, language, enable_tts,
           enable_notifications, enable_sound, high_contrast, ai_tutor_enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [userId, theme || 'system', fontSize || 'medium', language || 'vi',
           enableTts?1:0, enableNotifications!==false?1:0, enableSound!==false?1:0,
           highContrast?1:0, aiTutorEnabled!==false?1:0]
        );
      } else {
        await query(
          `UPDATE user_settings SET theme=?, font_size=?, language=?,
           enable_tts=?, enable_notifications=?, enable_sound=?,
           high_contrast=?, ai_tutor_enabled=?, updated_at=GETDATE() WHERE user_id=?`,
          [theme, fontSize, language, enableTts?1:0, enableNotifications?1:0,
           enableSound?1:0, highContrast?1:0, aiTutorEnabled?1:0, userId]);
      }
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // ── Logout ──
  ipcMain.handle('auth:logout', async () => {
    return { success: true };
  });

  // ── BUG-02 FIX: auth:resetPassword handler (thiếu trong bản cũ) ──
  // Chức năng: user đặt lại mật khẩu với email + mật khẩu mới
  // Không cần email verification trong Electron desktop app
  ipcMain.handle('auth:resetPassword', async (event, data) => {
    try {
      const { email, newPassword } = data || {};
      if (!email?.trim())        return { success: false, message: 'Email không được để trống' };
      if (!newPassword || newPassword.length < 6)
        return { success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự' };

      const users = await query(
        'SELECT id FROM users WHERE email = ? AND is_active = 1',
        [email.trim()]
      );
      if (!users.length)
        return { success: false, message: 'Email không tồn tại trong hệ thống' };

      const salt = await bcrypt.genSalt(10);
      const newHash = await bcrypt.hash(newPassword, salt);
      await query(
        'UPDATE users SET password_hash = ?, updated_at = GETDATE() WHERE email = ?',
        [newHash, email.trim()]
      );

      return { success: true, message: 'Đặt lại mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới.' };
    } catch (err) {
      console.error('auth:resetPassword error:', err);
      return { success: false, message: err.message };
    }
  });
};
