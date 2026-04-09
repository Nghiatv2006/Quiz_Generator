const { query, execProc } = require('../config/db');

module.exports = function (ipcMain) {
  // ── Dashboard overview (stored procedure) ──
  ipcMain.handle('stats:overview', async () => {
    try {
      const results = await execProc('sp_get_dashboard_stats');
      return { success: true, stats: results[0]?.[0] || {} };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── Thống kê bài thi ──
  ipcMain.handle('stats:byExam', async (event, examId) => {
    try {
      const rows = await query('SELECT * FROM vw_exam_stats WHERE exam_id=?', [examId]);
      return { success: true, stats: rows[0] || null };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── Thống kê chủ đề ──
  ipcMain.handle('stats:byTopic', async (event, topicId) => {
    try {
      const rows = await query('SELECT * FROM vw_topic_stats WHERE topic_id=?', [topicId]);
      return { success: true, stats: rows[0] || null };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── Bảng xếp hạng ──
  ipcMain.handle('stats:leaderboard', async (event, params = {}) => {
    try {
      // BUG-06 FIX: SQL Server không hỗ trợ TOP (?) với parameterized query
      // Phải sanitize và inject trực tiếp vào string
      const safeLimit = Math.min(200, Math.max(1, parseInt(params?.limit) || 50));
      const rows = await query(
        `SELECT TOP (${safeLimit}) * FROM vw_leaderboard ORDER BY xp_rank`
      );
      return { success: true, leaderboard: rows };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── Hiệu suất user ──
  ipcMain.handle('stats:userPerformance', async (event, userId) => {
    try {
      const rows = await query('SELECT * FROM vw_user_performance WHERE user_id=?', [userId]);
      return { success: true, performance: rows };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── AI usage stats ──
  ipcMain.handle('stats:aiUsage', async () => {
    try {
      const rows = await query(
        'SELECT TOP (30) * FROM vw_ai_usage_stats ORDER BY usage_date DESC');
      return { success: true, usage: rows };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── Exam full stats (stored procedure) ──
  ipcMain.handle('stats:examFull', async (event, examId) => {
    try {
      const results = await execProc('sp_get_exam_full_stats', { exam_id: examId });
      return {
        success: true,
        examStats: results[0]?.[0] || null,
        questionAnalysis: results[1] || [],
        scoreDistribution: results[2] || [],
        topStudents: results[3] || [],
      };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── Attempt detail (stored procedure) ──
  ipcMain.handle('stats:attemptDetail', async (event, attemptId) => {
    try {
      const results = await execProc('sp_get_attempt_detail', { attempt_id: attemptId });
      return {
        success: true,
        attempt: results[0]?.[0] || null,
        answers: results[1] || [],
      };
    } catch (err) { return { success: false, message: err.message }; }
  });
};
