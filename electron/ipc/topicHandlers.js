const { query, insert } = require('../config/db');

// ── Helpers ───────────────────────────────────────────────────
async function getUserRoleById(userId) {
  if (!userId) return null;
  const rows = await query('SELECT role FROM users WHERE id = ? AND is_active = 1', [userId]);
  return rows[0]?.role || null;
}

async function ensureManager(requestUser) {
  const role = await getUserRoleById(requestUser?.id);
  if (!['admin', 'teacher'].includes(role)) {
    return { success: false, message: 'Bạn không có quyền thực hiện thao tác này' };
  }
  return null;
}

/**
 * Tạo slug từ tên tiếng Việt.
 * FIX: xử lý đ/Đ TRƯỚC khi normalize để tránh mất ký tự.
 */
function makeSlug(name) {
  return name
    .replace(/đ/gi, 'd')                          // FIX BUG#8 – xử lý đ/Đ trước
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')              // xóa dấu
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'topic';
}

/**
 * Đảm bảo slug không trùng trong DB.
 * Nếu trùng thì thêm đuôi số: my-topic-2, my-topic-3 ...
 */
async function uniqueSlug(baseSlug, excludeId = null) {
  let slug = baseSlug;
  let attempt = 1;
  while (true) {
    const sql = excludeId
      ? 'SELECT id FROM topics WHERE slug = ? AND id <> ? AND is_deleted = 0'
      : 'SELECT id FROM topics WHERE slug = ? AND is_deleted = 0';
    const params = excludeId ? [slug, excludeId] : [slug];
    const rows = await query(sql, params);
    if (rows.length === 0) return slug;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }
}

// ═══════════════════════════════════════════════════════════════
module.exports = function (ipcMain) {

  // ── Tạo chủ đề ─────────────────────────────────────────────
  ipcMain.handle('topic:create', async (event, data, requestUser = null) => {
    try {
      const denied = await ensureManager(requestUser);
      if (denied) return denied;

      // FIX BUG#10 – Validate ở backend
      const name = (data?.name || '').trim();
      if (!name) return { success: false, message: 'Tên chủ đề không được để trống' };
      if (name.length > 100) return { success: false, message: 'Tên chủ đề không được quá 100 ký tự' };

      const { description, icon, color, parentId, createdBy } = data;

      // FIX BUG#8 – Slug generation chuẩn
      const baseSlug = makeSlug(name);
      const slug = await uniqueSlug(baseSlug);

      const result = await insert(
        `INSERT INTO topics (name, slug, description, icon, color, parent_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          slug,
          description?.trim() || null,
          icon || '📚',
          color || '#6366F1',
          parentId || null,
          createdBy || requestUser?.id,
        ]
      );

      return { success: true, id: result.insertId, slug };
    } catch (err) {
      console.error('[topic:create]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Danh sách chủ đề (có phân trang) ───────────────────────
  ipcMain.handle('topic:getAll', async (event, params = {}) => {
    try {
      const { search, page = 1, limit = 20 } = params;
      const safePage  = Math.max(1, parseInt(page)  || 1);
      const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
      const offset    = (safePage - 1) * safeLimit;

      let sql = `
        SELECT
          t.*,
          u.full_name AS creator_name,
          (SELECT COUNT(*) FROM questions q WHERE q.topic_id = t.id AND q.is_deleted = 0) AS question_count,
          (SELECT COUNT(*) FROM exams     e WHERE e.topic_id = t.id AND e.is_deleted = 0) AS exam_count
        FROM topics t
        LEFT JOIN users u ON u.id = t.created_by
        WHERE t.is_deleted = 0`;
      const p = [];

      if (search && search.trim()) {
        sql += ' AND (t.name LIKE ? OR t.description LIKE ?)';
        p.push(`%${search.trim()}%`, `%${search.trim()}%`);
      }

      sql += ' ORDER BY t.created_at DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY';
      p.push(offset, safeLimit);

      const topics = await query(sql, p);

      // FIX BUG#9 – safe COUNT query
      let countSql = 'SELECT COUNT(*) AS total FROM topics WHERE is_deleted = 0';
      const cp = [];
      if (search && search.trim()) {
        countSql += ' AND (name LIKE ? OR description LIKE ?)';
        cp.push(`%${search.trim()}%`, `%${search.trim()}%`);
      }
      const countRows = await query(countSql, cp);
      const total = countRows[0]?.total ?? 0;  // FIX BUG#9 – safe destructuring

      return {
        success: true,
        topics,
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      };
    } catch (err) {
      console.error('[topic:getAll]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Chi tiết chủ đề ─────────────────────────────────────────
  ipcMain.handle('topic:getById', async (event, id) => {
    try {
      if (!id) return { success: false, message: 'Thiếu topic ID' };
      const topics = await query(
        `SELECT t.*, u.full_name AS creator_name FROM topics t
         LEFT JOIN users u ON u.id = t.created_by
         WHERE t.id = ? AND t.is_deleted = 0`,
        [id]
      );
      if (!topics.length) return { success: false, message: 'Không tìm thấy chủ đề' };
      return { success: true, topic: topics[0] };
    } catch (err) {
      console.error('[topic:getById]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Cập nhật chủ đề ─────────────────────────────────────────
  ipcMain.handle('topic:update', async (event, id, data, requestUser = null) => {
    try {
      const denied = await ensureManager(requestUser);
      if (denied) return denied;

      if (!id) return { success: false, message: 'Thiếu topic ID' };

      // FIX BUG#10 – Validate ở backend
      const name = (data?.name || '').trim();
      if (!name) return { success: false, message: 'Tên chủ đề không được để trống' };
      if (name.length > 100) return { success: false, message: 'Tên chủ đề không được quá 100 ký tự' };

      // Lấy topic hiện tại để so sánh tên
      const existing = await query('SELECT name, slug FROM topics WHERE id = ? AND is_deleted = 0', [id]);
      if (!existing.length) return { success: false, message: 'Không tìm thấy chủ đề' };

      const { description, icon, color } = data;

      // FIX BUG#8 – Cập nhật slug khi tên thay đổi
      let newSlug = existing[0].slug;
      if (name !== existing[0].name) {
        const baseSlug = makeSlug(name);
        newSlug = await uniqueSlug(baseSlug, id);   // exclude current id để không tự conflict
      }

      await query(
        `UPDATE topics
         SET name = ?, slug = ?, description = ?, icon = ?, color = ?, updated_at = GETDATE()
         WHERE id = ? AND is_deleted = 0`,
        [
          name,
          newSlug,
          description?.trim() || null,
          icon || '📚',
          color || '#6366F1',
          id,
        ]
      );

      return { success: true, slug: newSlug };
    } catch (err) {
      console.error('[topic:update]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Xóa chủ đề (soft delete) ────────────────────────────────
  ipcMain.handle('topic:delete', async (event, id, requestUser = null) => {
    try {
      const denied = await ensureManager(requestUser);
      if (denied) return denied;

      if (!id) return { success: false, message: 'Thiếu topic ID' };

      // Kiểm tra topic tồn tại
      const existing = await query('SELECT id, name FROM topics WHERE id = ? AND is_deleted = 0', [id]);
      if (!existing.length) return { success: false, message: 'Không tìm thấy chủ đề' };

      // FIX BUG#11 – Kiểm tra câu hỏi và đề thi active liên quan
      const qCount = await query(
        'SELECT COUNT(*) AS cnt FROM questions WHERE topic_id = ? AND is_deleted = 0', [id]
      );
      const eCount = await query(
        'SELECT COUNT(*) AS cnt FROM exams WHERE topic_id = ? AND is_deleted = 0', [id]
      );

      const questionCount = qCount[0]?.cnt ?? 0;
      const examCount     = eCount[0]?.cnt ?? 0;

      if (questionCount > 0 || examCount > 0) {
        return {
          success: false,
          message: `Không thể xóa chủ đề "${existing[0].name}" vì đang có ${questionCount} câu hỏi và ${examCount} đề thi liên quan. Hãy xóa hoặc chuyển chúng trước.`,
          questionCount,
          examCount,
          hasChildren: true,
        };
      }

      await query('UPDATE topics SET is_deleted = 1, updated_at = GETDATE() WHERE id = ?', [id]);

      return { success: true };
    } catch (err) {
      console.error('[topic:delete]', err);
      return { success: false, message: err.message };
    }
  });
};
