const { query, insert, execProc, transaction, transQuery } = require('../config/db');

function toSafeInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function ensureDailyQuests(userId) {
  return await transaction(async (trans) => {
    await transQuery(
      trans,
      `EXEC sp_getapplock
         @Resource = ?,
         @LockMode = 'Exclusive',
         @LockOwner = 'Transaction',
         @LockTimeout = 10000`,
      [`daily_quests_${userId}`],
    );

    await transQuery(
      trans,
      `WITH dq_ranked AS (
         SELECT id,
                ROW_NUMBER() OVER (
                  PARTITION BY user_id, quest_date, quest_type, ISNULL(target_topic_id, -1)
                  ORDER BY id
                ) AS rn
         FROM daily_quests
         WHERE user_id = ? AND quest_date = CAST(GETDATE() AS DATE)
       )
       DELETE FROM daily_quests WHERE id IN (SELECT id FROM dq_ranked WHERE rn > 1)`,
      [userId],
    );

    const todayQuests = await transQuery(
      trans,
      `SELECT * FROM daily_quests
       WHERE user_id = ? AND quest_date = CAST(GETDATE() AS DATE)
       ORDER BY id`,
      [userId],
    );
    if (todayQuests.length > 0) return todayQuests;

    const weakTopics = await transQuery(
      trans,
      `SELECT TOP (1) e.topic_id, t.name AS topic_name, AVG(CAST(ea.score AS FLOAT)) AS avg_score
       FROM exam_attempts ea
       JOIN exams e ON e.id = ea.exam_id
       LEFT JOIN topics t ON t.id = e.topic_id
       WHERE ea.user_id = ? AND ea.status = 'completed'
       GROUP BY e.topic_id, t.name
       ORDER BY AVG(CAST(ea.score AS FLOAT)) ASC`,
      [userId],
    );
    const weakTopicId = weakTopics[0]?.topic_id || null;
    const weakTopicName = weakTopics[0]?.topic_name || 'chủ đề bạn đang học';

    const templates = [
      {
        title: '🎯 Hoàn thành 1 bài thi hôm nay',
        description: 'Duy trì nhịp học bằng cách hoàn thành ít nhất 1 bài thi.',
        questType: 'exam', targetCount: 1, xpReward: 40, targetTopicId: null,
      },
      {
        title: `📚 Luyện 5 câu về ${weakTopicName}`,
        description: 'AI cá nhân hoá: tập trung củng cố mảng yếu nhất của bạn.',
        questType: 'practice', targetCount: 5, xpReward: 35, targetTopicId: weakTopicId,
      },
      {
        title: '🤖 Hỏi AI Tutor ít nhất 1 lần',
        description: 'Khám phá trợ giảng AI để nhận thêm điểm thưởng.',
        questType: 'explore_ai', targetCount: 1, xpReward: 25, targetTopicId: null,
      },
    ];

    for (const q of templates) {
      await transQuery(
        trans,
        `INSERT INTO daily_quests (quest_date, user_id, title, description, quest_type, target_topic_id, target_count, xp_reward, is_ai_generated)
         SELECT CAST(GETDATE() AS DATE), ?, ?, ?, ?, ?, ?, ?, 1
         WHERE NOT EXISTS (
           SELECT 1 FROM daily_quests WITH (UPDLOCK, HOLDLOCK)
           WHERE user_id = ?
             AND quest_date = CAST(GETDATE() AS DATE)
             AND quest_type = ?
             AND ISNULL(target_topic_id, -1) = ISNULL(?, -1)
         )`,
        [userId, q.title, q.description, q.questType, q.targetTopicId, q.targetCount, q.xpReward, userId, q.questType, q.targetTopicId],
      );
    }

    return await transQuery(
      trans,
      `SELECT * FROM daily_quests
       WHERE user_id = ? AND quest_date = CAST(GETDATE() AS DATE)
       ORDER BY id`,
      [userId],
    );
  });
}

module.exports = function (ipcMain) {
  // ── User gamification stats ──
  ipcMain.handle('game:getUserStats', async (event, userId) => {
    try {
      if (!userId) return { success: false, message: 'Thiếu userId' };
      const safeUserId = toSafeInt(userId, 0);
      if (!safeUserId) return { success: false, message: 'userId không hợp lệ' };

      const users = await query(
        'SELECT role, xp_points, level, streak_days, longest_streak, total_exams_taken, total_ai_usage FROM users WHERE id=?',
        [safeUserId]);
      if (!users.length) return { success: false, message: 'User không tồn tại' };

      const badges = await query(
        `SELECT b.*, ub.earned_at FROM user_badges ub
         JOIN badges b ON b.id=ub.badge_id WHERE ub.user_id=?
         ORDER BY ub.earned_at DESC`, [safeUserId]);

      let xpRank = null;
      if (users[0].role === 'student') {
        const rankRows = await query(
          `SELECT COUNT(*)+1 AS xpRank FROM users
           WHERE xp_points > (SELECT xp_points FROM users WHERE id=?) AND role='student' AND is_active=1`,
          [safeUserId]);
        xpRank = rankRows[0]?.xpRank || null;
      }

      // BUG-LB-12 FIX: không fetch recentXP (chưa dùng ở LeaderboardPage, tốn query)

      const LEVELS = [
        { level:1, name:'Tân binh', xp:0 }, { level:2, name:'Học viên', xp:200 },
        { level:3, name:'Sinh viên', xp:500 }, { level:4, name:'Cử nhân', xp:1000 },
        { level:5, name:'Thạc sĩ', xp:2000 }, { level:6, name:'Tiến sĩ', xp:5000 },
        { level:7, name:'Giáo sư', xp:10000 }, { level:8, name:'Huyền thoại', xp:20000 },
      ];
      const u = users[0];
      const currentLevel = LEVELS.find(l => l.level === u.level) || LEVELS[0];
      const nextLevel    = LEVELS.find(l => l.level === u.level + 1);

      // BUG-LB-09 FIX: clamp [0, 100] – tránh âm hoặc > 100 khi dữ liệu lệch
      const rawProgress = nextLevel
        ? ((u.xp_points - currentLevel.xp) / (nextLevel.xp - currentLevel.xp)) * 100
        : 100;
      const xpProgress = Math.max(0, Math.min(100, Math.round(rawProgress)));

      return {
        success: true,
        stats: { ...u, badges, xpRank, currentLevel, nextLevel, xpProgress }
      };
    } catch (err) {
      console.error('[game:getUserStats]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Toàn bộ huy hiệu (đã đạt + chưa đạt) ──
  ipcMain.handle('game:getBadges', async (event, userId) => {
    try {
      const safeUserId = toSafeInt(userId, 0);
      if (!safeUserId) return { success: false, message: 'userId không hợp lệ' };

      const allBadges = await query('SELECT * FROM badges WHERE is_active=1 ORDER BY sort_order');
      const earned = await query('SELECT badge_id, earned_at FROM user_badges WHERE user_id=?', [safeUserId]);
      const earnedMap = new Map(earned.map(e => [e.badge_id, e.earned_at]));
      const result = allBadges.map(b => ({
        ...b,
        earned: earnedMap.has(b.id),
        earnedAt: earnedMap.get(b.id) || null
      }));
      return { success: true, badges: result };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── Bảng xếp hạng ──
  ipcMain.handle('game:getLeaderboard', async (event, params = {}) => {
    try {
      // BUG-LB-08 FIX: SQL Server không hỗ trợ TOP (?), phải sanitize và inject vào string
      const safeLimit = Math.min(200, Math.max(1, parseInt(params?.limit) || 50));
      const rows = await query(
        `SELECT TOP (${safeLimit}) * FROM vw_leaderboard ORDER BY xp_rank`);
      return { success: true, leaderboard: rows };
    } catch (err) {
      console.error('[game:getLeaderboard]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Lịch sử XP ──
  ipcMain.handle('game:getXPHistory', async (event, userId) => {
    try {
      const safeUserId = toSafeInt(userId, 0);
      if (!safeUserId) return { success: false, message: 'userId không hợp lệ' };

      const rows = await query(
        'SELECT TOP (50) * FROM xp_transactions_tbl WHERE user_id=? ORDER BY created_at DESC', [safeUserId]);
      return { success: true, history: rows };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── Nhiệm vụ hàng ngày ──
  ipcMain.handle('game:getDailyQuests', async (event, userId) => {
    try {
      if (!userId) return { success: false, message: 'Thiếu userId' };
      const safeUserId = toSafeInt(userId, 0);
      if (!safeUserId) return { success: false, message: 'userId không hợp lệ' };

      const quests = await ensureDailyQuests(safeUserId);
      return { success: true, quests };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── Cộng XP (stored procedure) ──
  ipcMain.handle('game:addXP', async (event, data) => {
    try {
      const { userId, amount, reason, relatedId, relatedType, description } = data || {};
      const safeUserId = toSafeInt(userId, 0);
      const safeAmount = Math.max(0, toSafeInt(amount, 0));
      if (!safeUserId) return { success: false, message: 'userId không hợp lệ' };
      if (!safeAmount) return { success: false, message: 'amount phải > 0' };
      if (!reason) return { success: false, message: 'Thiếu lý do cộng XP' };

      await execProc('sp_add_xp', {
        user_id: safeUserId, amount: safeAmount, reason,
        related_id: relatedId || null,
        related_type: relatedType || null,
        desc: description || null
      });
      return { success: true };
    } catch (err) { return { success: false, message: err.message }; }
  });
};
