const { query, insert, transaction, transQuery, transInsert } = require('../config/db');

// ── Helpers ───────────────────────────────────────────────────
async function getUserRoleById(userId) {
  if (!userId) return null;
  const rows = await query('SELECT role FROM users WHERE id = ? AND is_active = 1', [userId]);
  return rows[0]?.role || null;
}
async function ensureManager(requestUser) {
  const role = await getUserRoleById(requestUser?.id);
  if (!['admin', 'teacher'].includes(role))
    return { success: false, message: 'Bạn không có quyền thực hiện thao tác này' };
  return null;
}

// ════════════════════════════════════════════════════════════════
module.exports = function (ipcMain) {

  // ── Tạo bài thi ─────────────────────────────────────────────
  ipcMain.handle('exam:create', async (event, data, requestUser = null) => {
    try {
      const denied = await ensureManager(requestUser);
      if (denied) return denied;

      // FIX BUG#8 – Validate required fields
      const title = (data?.title || '').trim();
      if (!title)           return { success: false, message: 'Tên bài thi không được để trống' };
      if (!data?.topicId)   return { success: false, message: 'Vui lòng chọn chủ đề' };
      const duration = parseInt(data?.durationMinutes) || 0;
      if (duration < 1)     return { success: false, message: 'Thời gian thi phải lớn hơn 0 phút' };

      const {
        description, topicId, createdBy, passingScore,
        shuffleQuestions, shuffleOptions, showResult, showExplanation,
        allowAiExplain, isAdaptive, enableAntiCheat, requireFullscreen,
        maxAttempts, accessCode, questionIds, status,
      } = data;

      // FIX BUG#8 – Dùng transaction để đảm bảo atomicity
      const examId = await transaction(async (trans) => {
        const result = await transInsert(trans,
          `INSERT INTO exams (title, description, topic_id, created_by, duration_minutes,
           total_questions, passing_score, shuffle_questions, shuffle_options, show_result, show_explanation,
           allow_ai_explain, is_adaptive, enable_anti_cheat, require_fullscreen,
           max_attempts, access_code, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            title,
            description?.trim() || null,
            topicId,
            createdBy || requestUser?.id,
            duration,
            Array.isArray(questionIds) ? questionIds.length : 0,
            parseFloat(passingScore) || 5,
            shuffleQuestions  ? 1 : 0,
            shuffleOptions    ? 1 : 0,
            showResult     !== false ? 1 : 0,
            showExplanation !== false ? 1 : 0,
            allowAiExplain  !== false ? 1 : 0,
            isAdaptive        ? 1 : 0,
            enableAntiCheat !== false ? 1 : 0,
            requireFullscreen ? 1 : 0,
            maxAttempts ? parseInt(maxAttempts) : null,
            accessCode?.trim() || null,
            status || 'draft',
          ]
        );

        const newExamId = result.insertId;

        // Insert exam_questions theo transaction
        if (questionIds?.length > 0) {
          for (let i = 0; i < questionIds.length; i++) {
            await transInsert(trans,
              'INSERT INTO exam_questions (exam_id, question_id, sort_order) VALUES (?,?,?)',
              [newExamId, questionIds[i], i + 1]
            );
          }
        }

        return newExamId;
      });

      return { success: true, id: examId };
    } catch (err) {
      console.error('[exam:create]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Danh sách bài thi ────────────────────────────────────────
  ipcMain.handle('exam:getAll', async (event, params = {}, requestUser = null) => {
    try {
      const { topicId, status, createdBy, search, page = 1, limit = 20 } = params;
      const safePage  = Math.max(1, parseInt(page) || 1);
      const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
      const offset    = (safePage - 1) * safeLimit;

      const role = await getUserRoleById(requestUser?.id);

      // Build WHERE
      let where = 'WHERE e.is_deleted = 0';
      const p = [];
      if (topicId)   { where += ' AND e.topic_id = ?';    p.push(topicId); }
      if (status)    { where += ' AND e.status = ?';      p.push(status); }
      if (createdBy) { where += ' AND e.created_by = ?';  p.push(createdBy); }
      if (search?.trim()) {
        where += ' AND (e.title LIKE ? OR e.description LIKE ?)';
        p.push(`%${search.trim()}%`, `%${search.trim()}%`);
      }
      // Student chỉ thấy active exams
      if (role === 'student') where += " AND e.status = 'active'";

      // FIX BUG#9 – Count query riêng
      const countRows = await query(`SELECT COUNT(*) AS total FROM exams e ${where}`, [...p]);
      const total = countRows[0]?.total ?? 0;

      // Main query với attempt_count
      const mainSql = `
        SELECT
          e.*,
          t.name  AS topic_name,
          u.full_name AS creator_name,
          (SELECT COUNT(*) FROM exam_questions eq2 WHERE eq2.exam_id = e.id) AS computed_total_questions,
          (SELECT COUNT(*) FROM exam_attempts ea WHERE ea.exam_id = e.id)    AS attempt_count
        FROM exams e
        LEFT JOIN topics t ON t.id = e.topic_id
        LEFT JOIN users  u ON u.id = e.created_by
        ${where}
        ORDER BY e.created_at DESC
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`;

      const rawExams = await query(mainSql, [...p, offset, safeLimit]);

      // FIX BUG#1 – Ẩn access_code với student, chỉ trả về flag boolean
      const exams = rawExams.map(e => {
        const normalizedTotalQuestions = Number.isFinite(Number(e.computed_total_questions))
          ? Number(e.computed_total_questions)
          : (Number.isFinite(Number(e.total_questions)) ? Number(e.total_questions) : 0);

        if (role === 'student') {
          const { access_code, computed_total_questions, ...rest } = e;
          return { ...rest, total_questions: normalizedTotalQuestions, has_access_code: !!access_code };
        }

        const { computed_total_questions, ...rest } = e;
        return { ...rest, total_questions: normalizedTotalQuestions, has_access_code: !!e.access_code };
      });

      return {
        success: true,
        exams,
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      };
    } catch (err) {
      console.error('[exam:getAll]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Chi tiết bài thi ─────────────────────────────────────────
  ipcMain.handle('exam:getById', async (event, id) => {
    try {
      if (!id) return { success: false, message: 'Thiếu exam ID' };
      const rows = await query(
        `SELECT e.*, t.name AS topic_name, u.full_name AS creator_name
         FROM exams e
         LEFT JOIN topics t ON t.id = e.topic_id
         LEFT JOIN users  u ON u.id = e.created_by
         WHERE e.id = ? AND e.is_deleted = 0`, [id]
      );
      if (!rows.length) return { success: false, message: 'Không tìm thấy bài thi' };

      const exam = rows[0];

      // FIX BUG#12 – Batch load options thay vì N+1
      exam.questions = await query(
        `SELECT eq.sort_order, eq.points, q.*
         FROM exam_questions eq
         JOIN questions q ON q.id = eq.question_id
         WHERE eq.exam_id = ? AND q.is_deleted = 0
         ORDER BY eq.sort_order`, [id]
      );

      if (exam.questions.length > 0) {
        const qIds = exam.questions.map(q => q.id);
        const placeholders = qIds.map(() => '?').join(',');
        const allOpts = await query(
          `SELECT * FROM question_options WHERE question_id IN (${placeholders}) ORDER BY sort_order`,
          qIds
        );
        const optsByQ = {};
        for (const o of allOpts) (optsByQ[o.question_id] ||= []).push(o);
        for (const q of exam.questions) {
          q.options = q.question_type !== 'fill_in' ? (optsByQ[q.id] || []) : [];
        }
      }

      return { success: true, exam };
    } catch (err) {
      console.error('[exam:getById]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Cập nhật bài thi ─────────────────────────────────────────
  ipcMain.handle('exam:update', async (event, id, data, requestUser = null) => {
    try {
      const denied = await ensureManager(requestUser);
      if (denied) return denied;
      if (!id) return { success: false, message: 'Thiếu exam ID' };

      // Validate title nếu được cung cấp
      if (data?.title !== undefined) {
        const title = (data.title || '').trim();
        if (!title) return { success: false, message: 'Tên bài thi không được để trống' };
      }

      const BOOL_FIELDS = ['shuffleQuestions','shuffleOptions','isAdaptive',
        'enableAntiCheat','requireFullscreen','showResult','showExplanation','allowAiExplain'];
      const COL_MAP = {
        title: 'title', description: 'description',
        durationMinutes: 'duration_minutes', passingScore: 'passing_score',
        status: 'status', shuffleQuestions: 'shuffle_questions',
        shuffleOptions: 'shuffle_options', isAdaptive: 'is_adaptive',
        enableAntiCheat: 'enable_anti_cheat', requireFullscreen: 'require_fullscreen',
        maxAttempts: 'max_attempts', accessCode: 'access_code',
        showResult: 'show_result', showExplanation: 'show_explanation',
        allowAiExplain: 'allow_ai_explain',
      };

      const setClauses = [], values = [];
      for (const [k, col] of Object.entries(COL_MAP)) {
        if (data[k] === undefined) continue;
        setClauses.push(`${col} = ?`);
        values.push(BOOL_FIELDS.includes(k) ? (data[k] ? 1 : 0) : data[k]);
      }

      if (setClauses.length > 0) {
        setClauses.push('updated_at = GETDATE()');
        values.push(id);
        await query(`UPDATE exams SET ${setClauses.join(', ')} WHERE id = ? AND is_deleted = 0`, values);
      }

      // Cập nhật câu hỏi nếu có
      if (data.questionIds !== undefined) {
        await transaction(async (trans) => {
          const incomingQuestionIds = Array.isArray(data.questionIds) ? data.questionIds : [];

          await transQuery(trans, 'DELETE FROM exam_questions WHERE exam_id = ?', [id]);
          for (let i = 0; i < incomingQuestionIds.length; i++) {
            await transInsert(trans,
              'INSERT INTO exam_questions (exam_id, question_id, sort_order) VALUES (?,?,?)',
              [id, incomingQuestionIds[i], i + 1]
            );
          }

          await transQuery(trans,
            'UPDATE exams SET total_questions = ?, updated_at = GETDATE() WHERE id = ? AND is_deleted = 0',
            [incomingQuestionIds.length, id]
          );
        });
      }

      return { success: true };
    } catch (err) {
      console.error('[exam:update]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Xóa bài thi (soft delete) ────────────────────────────────
  ipcMain.handle('exam:delete', async (event, id, requestUser = null) => {
    try {
      const denied = await ensureManager(requestUser);
      if (denied) return denied;
      if (!id) return { success: false, message: 'Thiếu exam ID' };

      const existing = await query(
        'SELECT id, title FROM exams WHERE id = ? AND is_deleted = 0', [id]
      );
      if (!existing.length) return { success: false, message: 'Không tìm thấy bài thi' };

      // FIX BUG#10 – Kiểm tra attempt đang in_progress
      const inProgress = await query(
        "SELECT COUNT(*) AS cnt FROM exam_attempts WHERE exam_id = ? AND status = 'in_progress'", [id]
      );
      if ((inProgress[0]?.cnt ?? 0) > 0) {
        return {
          success: false,
          message: `Bài thi "${existing[0].title}" đang có học sinh làm bài. Hãy đợi họ hoàn thành hoặc đóng bài thi trước.`,
        };
      }

      // FIX BUG#11 – Đổi status → closed trước khi xóa để ngăn người mới vào
      await query(
        "UPDATE exams SET status = 'closed', is_deleted = 1, updated_at = GETDATE() WHERE id = ?", [id]
      );

      return { success: true };
    } catch (err) {
      console.error('[exam:delete]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Lấy danh sách lượt thi của 1 bài thi (Admin) ───────────────
  ipcMain.handle('exam:getAttempts', async (event, examId, requestUser = null) => {
    try {
      const denied = await ensureManager(requestUser);
      if (denied) return denied;
      if (!examId) return { success: false, message: 'Thiếu exam ID' };

      const attempts = await query(
        `SELECT ea.*, u.full_name, u.username, u.email,
                CASE
                  WHEN ea.time_taken_seconds IS NULL OR ea.time_taken_seconds < 0 THEN
                    DATEDIFF(SECOND, ea.started_at, ISNULL(ea.completed_at, GETDATE()))
                  ELSE ea.time_taken_seconds
                END AS computed_time
         FROM exam_attempts ea
         JOIN users u ON u.id = ea.user_id
         WHERE ea.exam_id = ?
         ORDER BY ea.started_at DESC`,
        [examId]
      );
      
      for(const a of attempts) {
         a.time_taken_seconds = Math.max(0, Number(a.computed_time || a.time_taken_seconds || 0));
      }

      return { success: true, attempts };
    } catch (err) {
      console.error('[exam:getAttempts]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Bắt đầu thi (delegate sang attemptHandlers) ──────────────
  // Được xử lý bởi attemptHandlers.js
};
