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

// ── Build WHERE clause (dùng cho cả SELECT và COUNT) ──────────
function buildWhereClause(params) {
  const { topicId, difficulty, questionType, isAIGenerated, search } = params;
  let where = 'WHERE q.is_deleted = 0';
  const p = [];
  if (topicId)                       { where += ' AND q.topic_id = ?';       p.push(topicId); }
  if (difficulty)                    { where += ' AND q.difficulty = ?';      p.push(difficulty); }
  if (questionType)                  { where += ' AND q.question_type = ?';   p.push(questionType); }
  if (isAIGenerated !== undefined)   { where += ' AND q.is_ai_generated = ?'; p.push(isAIGenerated ? 1 : 0); }
  if (search && search.trim())       { where += ' AND q.question_text LIKE ?'; p.push(`%${search.trim()}%`); }
  return { where, p };
}

function normalizeOptionInput(opt, i = 0) {
  return {
    label: String(opt?.label || opt?.optionLabel || opt?.option_label || String.fromCharCode(65 + i)).trim(),
    text: String(opt?.text || opt?.optionText || opt?.option_text || '').trim(),
    isCorrect: !!(opt?.isCorrect || opt?.is_correct),
    sortOrder: Number.isFinite(Number(opt?.sortOrder ?? opt?.sort_order)) ? Number(opt?.sortOrder ?? opt?.sort_order) : i,
  };
}

function normalizeFillAnswerInput(ans, i = 0) {
  const rawMode = String(ans?.matchMode || ans?.match_mode || 'exact').toLowerCase();
  const matchMode = rawMode === 'ignore_case' ? 'exact' : (['exact', 'contains', 'regex'].includes(rawMode) ? rawMode : 'exact');
  return {
    answer: String(ans?.answer || ans?.acceptedAnswer || ans?.accepted_answer || '').trim(),
    isPrimary: ans?.isPrimary !== undefined ? !!ans.isPrimary : i === 0,
    matchMode,
  };
}

// ════════════════════════════════════════════════════════════════
module.exports = function (ipcMain) {

  // ── Tạo câu hỏi ─────────────────────────────────────────────
  ipcMain.handle('question:create', async (event, data, requestUser = null) => {
    try {
      const denied = await ensureManager(requestUser);
      if (denied) return denied;

      // FIX BUG#10 – Validate required fields ở backend
      const questionText = (data?.questionText || '').trim();
      if (!questionText)      return { success: false, message: 'Nội dung câu hỏi không được để trống' };
      if (!data?.topicId)     return { success: false, message: 'Vui lòng chọn chủ đề' };
      if (!data?.questionType) return { success: false, message: 'Vui lòng chọn loại câu hỏi' };

      const { topicId, createdBy, questionType, difficulty, explanation,
              options, fillAnswers, bloomLevel, estimatedTime,
              isAIGenerated, isAiGenerated, aiModel } = data;

      // FIX BUG#9 – dùng aiGenFlag (gộp cả 2 naming convention)
      const aiGenFlag = !!(isAIGenerated || isAiGenerated);

      // Validate options / answers
      if (questionType !== 'fill_in') {
        const normalizedOptions = (options || []).map((o, i) => normalizeOptionInput(o, i));
        if (normalizedOptions.length < 2) {
          return { success: false, message: 'Câu hỏi trắc nghiệm phải có ít nhất 2 đáp án' };
        }
        if (normalizedOptions.some(o => !o.text)) {
          return { success: false, message: 'Tất cả đáp án phải có nội dung (không được để trống)' };
        }

        const correctCount = normalizedOptions.filter(o => o.isCorrect).length;
        if (questionType === 'single_choice') {
          if (correctCount === 0) return { success: false, message: 'Câu hỏi một đáp án phải có ít nhất 1 đáp án đúng' };
          if (correctCount > 1) return { success: false, message: 'Câu hỏi một đáp án chỉ được có 1 đáp án đúng' };
        }
        if (questionType === 'multiple_choice' && correctCount === 0) {
          return { success: false, message: 'Câu hỏi nhiều đáp án phải có ít nhất 1 đáp án đúng' };
        }
      }

      if (questionType === 'fill_in' && (!fillAnswers || fillAnswers.length === 0)) {
        return { success: false, message: 'Câu hỏi điền đáp án phải có ít nhất 1 đáp án chấp nhận' };
      }

      const result = await transaction(async (trans) => {
        const qResult = await transInsert(trans,
          `INSERT INTO questions
           (topic_id, created_by, question_text, question_type, difficulty,
            explanation, bloom_level, estimated_time, is_ai_generated, ai_model)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [topicId, createdBy || requestUser?.id, questionText, questionType,
           difficulty || 'medium', explanation?.trim() || null,
           bloomLevel || null, estimatedTime || 30, aiGenFlag ? 1 : 0, aiModel || null]
        );
        const questionId = qResult.insertId;

        // Insert options
        if (options && options.length > 0 && questionType !== 'fill_in') {
          for (let i = 0; i < options.length; i++) {
            const opt = normalizeOptionInput(options[i], i);
            await transInsert(trans,
              `INSERT INTO question_options (question_id, option_label, option_text, is_correct, sort_order)
               VALUES (?, ?, ?, ?, ?)`,
              [questionId, opt.label, opt.text, opt.isCorrect ? 1 : 0, opt.sortOrder]
            );
          }
        }

        // Insert fill answers
        if (fillAnswers && fillAnswers.length > 0 && questionType === 'fill_in') {
          for (let i = 0; i < fillAnswers.length; i++) {
            const ans = normalizeFillAnswerInput(fillAnswers[i], i);
            await transInsert(trans,
              `INSERT INTO question_fill_answers (question_id, accepted_answer, is_primary, match_mode)
               VALUES (?, ?, ?, ?)`,
              [questionId, ans.answer, ans.isPrimary ? 1 : 0, ans.matchMode]
            );
          }
        }

        return questionId;
      });

      return { success: true, id: result };
    } catch (err) {
      console.error('[question:create]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Danh sách câu hỏi ────────────────────────────────────────
  ipcMain.handle('question:getAll', async (event, params = {}) => {
    try {
      const { page = 1, limit = 20 } = params;
      const safePage  = Math.max(1, parseInt(page)  || 1);
      const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
      const offset    = (safePage - 1) * safeLimit;

      // FIX BUG#8 – Tách COUNT query riêng, không dùng regex
      const { where, p } = buildWhereClause(params);

      // COUNT (separate, clean query)
      const countSql = `SELECT COUNT(*) AS total FROM questions q ${where}`;
      const countRows = await query(countSql, [...p]);
      const total = countRows[0]?.total ?? 0;  // FIX BUG#8: safe access

      // Main SELECT
      const mainSql = `
        SELECT
          q.id, q.topic_id, q.created_by, q.question_text, q.question_type,
          q.difficulty, q.bloom_level, q.estimated_time, q.explanation,
          q.is_ai_generated, q.ai_model, q.quality_score, q.correct_rate,
          q.is_deleted, q.created_at, q.updated_at,
          t.name AS topic_name,
          u.full_name AS creator_name
        FROM questions q
        LEFT JOIN topics t ON t.id = q.topic_id
        LEFT JOIN users  u ON u.id = q.created_by
        ${where}
        ORDER BY q.created_at DESC
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
      `;
      const questions = await query(mainSql, [...p, offset, safeLimit]);

      // FIX BUG#14 – Batch load options thay vì N+1 queries
      if (questions.length > 0) {
        const ids = questions.map(q => q.id);
        const placeholders = ids.map(() => '?').join(',');

        const allOptions = await query(
          `SELECT * FROM question_options WHERE question_id IN (${placeholders}) ORDER BY sort_order`,
          ids
        );
        const allFillAnswers = await query(
          `SELECT * FROM question_fill_answers WHERE question_id IN (${placeholders})`,
          ids
        );

        // Group by question_id
        const optsByQ    = {};
        const fillByQ    = {};
        for (const o of allOptions)      { (optsByQ[o.question_id]  ||= []).push(o); }
        for (const f of allFillAnswers)  { (fillByQ[f.question_id]  ||= []).push(f); }

        for (const q of questions) {
          q.options     = q.question_type !== 'fill_in' ? (optsByQ[q.id]  || []) : [];
          q.fillAnswers = q.question_type === 'fill_in'  ? (fillByQ[q.id] || []) : [];
        }
      }

      return {
        success: true,
        questions,
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      };
    } catch (err) {
      console.error('[question:getAll]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Chi tiết câu hỏi ─────────────────────────────────────────
  ipcMain.handle('question:getById', async (event, id) => {
    try {
      if (!id) return { success: false, message: 'Thiếu question ID' };
      const rows = await query(
        `SELECT q.*, t.name AS topic_name, u.full_name AS creator_name
         FROM questions q
         LEFT JOIN topics t ON t.id = q.topic_id
         LEFT JOIN users  u ON u.id = q.created_by
         WHERE q.id = ? AND q.is_deleted = 0`, [id]
      );
      if (!rows.length) return { success: false, message: 'Không tìm thấy câu hỏi' };

      const q = rows[0];
      q.options     = await query('SELECT * FROM question_options WHERE question_id = ? ORDER BY sort_order', [id]);
      q.fillAnswers = await query('SELECT * FROM question_fill_answers WHERE question_id = ?', [id]);
      return { success: true, question: q };
    } catch (err) {
      console.error('[question:getById]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Cập nhật câu hỏi ─────────────────────────────────────────
  ipcMain.handle('question:update', async (event, id, data, requestUser = null) => {
    try {
      const denied = await ensureManager(requestUser);
      if (denied) return denied;
      if (!id) return { success: false, message: 'Thiếu question ID' };

      // Validate
      const questionText = (data?.questionText || '').trim();
      if (!questionText) return { success: false, message: 'Nội dung câu hỏi không được để trống' };

      const { difficulty, explanation, bloomLevel, estimatedTime, options, fillAnswers, questionType } = data;

      // Validate options
      if (questionType === 'single_choice' && options) {
        const correctCount = options.filter(o => o.isCorrect).length;
        if (correctCount !== 1) return { success: false, message: 'Câu hỏi một đáp án phải có đúng 1 đáp án đúng' };
      }

      await transaction(async (trans) => {
        await transQuery(trans,
          `UPDATE questions
           SET question_text = ?, difficulty = ?, explanation = ?,
               bloom_level = ?, estimated_time = ?, updated_at = GETDATE()
           WHERE id = ? AND is_deleted = 0`,
          [questionText, difficulty || 'medium', explanation?.trim() || null,
           bloomLevel || null, estimatedTime || 30, id]
        );

        if (options !== undefined) {
          await transQuery(trans, 'DELETE FROM question_options WHERE question_id = ?', [id]);
          for (let i = 0; i < (options || []).length; i++) {
            const opt = normalizeOptionInput(options[i], i);
            await transInsert(trans,
              `INSERT INTO question_options (question_id, option_label, option_text, is_correct, sort_order)
               VALUES (?, ?, ?, ?, ?)`,
              [id, opt.label, opt.text, opt.isCorrect ? 1 : 0, opt.sortOrder]
            );
          }
        }

        if (fillAnswers !== undefined) {
          await transQuery(trans, 'DELETE FROM question_fill_answers WHERE question_id = ?', [id]);
          const normalizedFillAnswers = (fillAnswers || []).map((ans, i) => normalizeFillAnswerInput(ans, i));
          for (const ans of normalizedFillAnswers) {
            await transInsert(trans,
              `INSERT INTO question_fill_answers (question_id, accepted_answer, is_primary, match_mode)
               VALUES (?, ?, ?, ?)`,
              [id, ans.answer, ans.isPrimary ? 1 : 0, ans.matchMode]
            );
          }
        }
      });

      return { success: true };
    } catch (err) {
      console.error('[question:update]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Xóa câu hỏi (soft delete) ────────────────────────────────
  ipcMain.handle('question:delete', async (event, id, requestUser = null) => {
    try {
      const denied = await ensureManager(requestUser);
      if (denied) return denied;
      if (!id) return { success: false, message: 'Thiếu question ID' };

      // Kiểm tra tồn tại
      const existing = await query(
        'SELECT id, question_text FROM questions WHERE id = ? AND is_deleted = 0', [id]
      );
      if (!existing.length) return { success: false, message: 'Không tìm thấy câu hỏi' };

      // FIX BUG#13 – Kiểm tra câu hỏi có trong exam đang active không
      const activeExams = await query(
        `SELECT COUNT(*) AS cnt
         FROM exam_questions eq
         JOIN exams e ON e.id = eq.exam_id
         WHERE eq.question_id = ? AND e.is_deleted = 0 AND e.status = 'active'`, [id]
      );
      const activeCount = activeExams[0]?.cnt ?? 0;
      if (activeCount > 0) {
        return {
          success: false,
          message: `Câu hỏi đang được dùng trong ${activeCount} đề thi đang hoạt động. Hãy xóa khỏi đề thi trước.`,
          activeExamCount: activeCount,
        };
      }

      await query(
        'UPDATE questions SET is_deleted = 1, updated_at = GETDATE() WHERE id = ?', [id]
      );
      return { success: true };
    } catch (err) {
      console.error('[question:delete]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Tìm kiếm nhanh ───────────────────────────────────────────
  ipcMain.handle('question:search', async (event, params) => {
    try {
      const { query: searchQuery, topicId, difficulty, limit = 20 } = params;
      if (!searchQuery?.trim()) return { success: true, questions: [] };

      const safeLimit = Math.min(50, Math.max(1, parseInt(limit) || 20));
      let sql = `
        SELECT TOP (${safeLimit}) q.id, q.question_text, q.question_type, q.difficulty,
               t.name AS topic_name
        FROM questions q
        LEFT JOIN topics t ON t.id = q.topic_id
        WHERE q.is_deleted = 0 AND q.question_text LIKE ?`;
      const p = [`%${searchQuery.trim()}%`];

      if (topicId)   { sql += ' AND q.topic_id = ?';   p.push(topicId); }
      if (difficulty) { sql += ' AND q.difficulty = ?'; p.push(difficulty); }
      sql += ' ORDER BY q.created_at DESC';

      const questions = await query(sql, p);
      return { success: true, questions };
    } catch (err) {
      console.error('[question:search]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Import hàng loạt (FIX BUG#12 – dùng transaction) ────────
  ipcMain.handle('question:bulkImport', async (event, questionsData, requestUser = null) => {
    try {
      const denied = await ensureManager(requestUser);
      if (denied) return denied;
      if (!Array.isArray(questionsData) || questionsData.length === 0)
        return { success: false, message: 'Không có câu hỏi để import' };

      let imported = 0;
      const errors  = [];

      // FIX BUG#12 – Wrap toàn bộ trong 1 transaction
      await transaction(async (trans) => {
        for (let idx = 0; idx < questionsData.length; idx++) {
          const q = questionsData[idx];
          const questionText = (q.questionText || '').trim();
          if (!questionText || !q.topicId || !q.questionType) {
            errors.push(`Câu ${idx + 1}: thiếu nội dung, topicId, hoặc loại câu hỏi`);
            continue;
          }

          const aiGenFlag = !!(q.isAIGenerated || q.isAiGenerated);

          const qResult = await transInsert(trans,
            `INSERT INTO questions (topic_id, created_by, question_text, question_type, difficulty,
             explanation, bloom_level, estimated_time, is_ai_generated, ai_model)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [q.topicId, q.createdBy || requestUser?.id, questionText,
             q.questionType, q.difficulty || 'medium', q.explanation?.trim() || null,
             q.bloomLevel || null, q.estimatedTime || 30, aiGenFlag ? 1 : 0, q.aiModel || null]
          );
          const qId = qResult.insertId;

          if (q.options && q.options.length > 0 && q.questionType !== 'fill_in') {
            for (let i = 0; i < q.options.length; i++) {
              const opt = normalizeOptionInput(q.options[i], i);
              await transInsert(trans,
                `INSERT INTO question_options (question_id, option_label, option_text, is_correct, sort_order)
                 VALUES (?, ?, ?, ?, ?)`,
                [qId, opt.label, opt.text, opt.isCorrect ? 1 : 0, opt.sortOrder]
              );
            }
          }

          if (q.fillAnswers && q.fillAnswers.length > 0 && q.questionType === 'fill_in') {
            for (let i = 0; i < q.fillAnswers.length; i++) {
              const ans = normalizeFillAnswerInput(q.fillAnswers[i], i);
              await transInsert(trans,
                `INSERT INTO question_fill_answers (question_id, accepted_answer, is_primary, match_mode)
                 VALUES (?, ?, ?, ?)`,
                [qId, ans.answer, ans.isPrimary ? 1 : 0, ans.matchMode]
              );
            }
          }

          imported++;
        }
      });

      return { success: true, imported, errors };
    } catch (err) {
      console.error('[question:bulkImport]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Báo cáo câu hỏi ──────────────────────────────────────────
  ipcMain.handle('question:report', async (event, questionId, data) => {
    try {
      if (!questionId) return { success: false, message: 'Thiếu question ID' };
      const { reportedBy, reason, detail } = data || {};
      if (!reason?.trim()) return { success: false, message: 'Vui lòng nhập lý do báo cáo' };

      await insert(
        `INSERT INTO question_reports (question_id, reported_by, reason, detail)
         VALUES (?, ?, ?, ?)`,
        [questionId, reportedBy, reason.trim(), detail?.trim() || null]
      );
      return { success: true };
    } catch (err) {
      console.error('[question:report]', err);
      return { success: false, message: err.message };
    }
  });
};
