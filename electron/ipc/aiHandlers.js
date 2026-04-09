const { query, insert, execProc } = require('../config/db');
const { generateContent, parseAIJson, getAIProvider, setAIProvider,
        getOllamaStatus, getGeminiStatus, getGroqStatus, VALID_PROVIDERS } = require('../config/gemini');
const fs = require('fs');
const path = require('path');
const PROMPTS = require('../utils/prompts');

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
  // ── AI Sinh câu hỏi từ nội dung ──
  ipcMain.handle('ai:generateQuestions', async (event, data) => {
    try {
      const { topic, content, count, difficulty, userId, bloomLevel, questionType } = data;
      // FIX BUG#12 – Validate đầu vào
      if (!content?.trim()) return { success: false, message: 'Nội dung không được để trống' };
      const safeCount = Math.max(1, Math.min(50, parseInt(count) || 10));

      const prompt = PROMPTS.GENERATE_QUESTIONS(
        topic || 'General',
        content.substring(0, 15000),
        safeCount,
        difficulty || 'mixed',
        { bloomLevel, questionType } // FIX BUG#13: truyền options
      );
      const result = await generateContent(prompt, 'text', { userId });
      const parsed = parseAIJson(result.text);

      // FIX BUG#9 – Validate kết quả là Array
      const questions = Array.isArray(parsed) ? parsed : (parsed?.questions || []);
      if (!questions.length) {
        return { success: false, message: 'AI không sinh được câu hỏi nào. Hãy thử lại.' };
      }

      await insert(
        `INSERT INTO ai_logs (user_id, action_type, input_summary, output_summary, total_tokens, response_time_ms)
         VALUES (?,?,?,?,?,?)`,
        [userId, 'generate_questions', `Topic: ${topic}, Count: ${safeCount}`,
         `Generated ${questions.length} questions`, result.tokens, result.responseTimeMs]);

      return { success: true, questions, tokensUsed: result.tokens };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── AI Sinh câu hỏi từ ảnh (Gemini Vision) ──
  ipcMain.handle('ai:generateFromImage', async (event, data) => {
    try {
      const { imagePath, topic, count, userId } = data;

      // BUG-04 FIX: validate imagePath trước khi đọc
      if (!imagePath?.trim()) return { success: false, message: 'Thiếu đường dẫn file ảnh' };
      if (!fs.existsSync(imagePath))
        return { success: false, message: `File không tồn tại: ${path.basename(imagePath)}` };

      const imageData = fs.readFileSync(imagePath);
      const base64 = imageData.toString('base64');
      const ext = path.extname(imagePath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

      // Kiểm tra kích thước file (tối đa 10MB)
      const statInfo = fs.statSync(imagePath);
      if (statInfo.size > 10 * 1024 * 1024)
        return { success: false, message: 'File ảnh quá lớn (tối đa 10MB)' };

      const prompt = [
        { inlineData: { mimeType, data: base64 } },
        { text: PROMPTS.GENERATE_FROM_IMAGE(topic, count || 5) }
      ];
      const result = await generateContent(prompt, 'vision', { userId });
      const questions = parseAIJson(result.text);

      // BUG-08 FIX: wrap ai_logs trong try/catch riêng
      try {
        await insert(
          `INSERT INTO ai_logs (user_id, action_type, input_summary, total_tokens, response_time_ms)
           VALUES (?,?,?,?,?)`,
          [userId, 'generate_from_image', `Image: ${path.basename(imagePath)}`,
           result.tokens, result.responseTimeMs]);
      } catch (logErr) {
        console.warn('[ai:generateFromImage] log error:', logErr.message);
      }

      return { success: true, questions };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── AI Giải thích đáp án ──
  ipcMain.handle('ai:explainAnswer', async (event, data) => {
    try {
      const { questionText, selectedAnswer, correctAnswer, userId } = data;
      const prompt = PROMPTS.EXPLAIN_ANSWER(questionText, selectedAnswer, correctAnswer);
      const result = await generateContent(prompt, 'text', { userId });

      await insert(
        'INSERT INTO ai_logs (user_id, action_type, total_tokens, response_time_ms) VALUES (?,?,?,?)',
        [userId, 'explain_answer', result.tokens, result.responseTimeMs]);

      return { success: true, explanation: result.text };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── AI Đánh giá kỳ thi ──
  ipcMain.handle('ai:evaluateExam', async (event, data) => {
    try {
      const { examId, userId } = data;
      const examStats = await query('SELECT * FROM vw_exam_stats WHERE exam_id=?', [examId]);
      if (!examStats.length) return { success: false, message: 'Chưa có dữ liệu thi' };

      const qAnalysis = await query(
        `SELECT qa.* FROM vw_question_analysis qa
         JOIN exam_questions eq ON eq.question_id=qa.question_id WHERE eq.exam_id=?`, [examId]);

      const prompt = PROMPTS.EVALUATE_EXAM({ examStats: examStats[0], questionAnalysis: qAnalysis });
      const result = await generateContent(prompt, 'text', { userId });
      const evaluation = parseAIJson(result.text);

      await insert(
        `INSERT INTO ai_evaluations (exam_id, requested_by, evaluation_type, overall_assessment,
         pass_rate, fail_rate, avg_score, weak_areas, strong_areas, recommendations,
         top_students, raw_ai_response)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [examId, userId, 'exam_evaluation', evaluation.overallAssessment || '',
         evaluation.passRate, evaluation.failRate, evaluation.avgScore,
         JSON.stringify(evaluation.weakAreas), JSON.stringify(evaluation.strongAreas),
         JSON.stringify(evaluation.recommendations), JSON.stringify(evaluation.topStudents),
         result.text]);

      await insert(
        `INSERT INTO ai_logs (user_id, action_type, related_id, related_type, total_tokens, response_time_ms)
         VALUES (?,?,?,?,?,?)`,
        [userId, 'evaluate_exam', examId, 'exam', result.tokens, result.responseTimeMs]);

      return { success: true, evaluation };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── AI Đề xuất lộ trình học ──
  ipcMain.handle('ai:learningPath', async (event, data) => {
    try {
      const { attemptId, userId } = data;
      const attempts = await query(
        `SELECT ea.*, e.title, t.name AS topic_name, t.id AS topic_id FROM exam_attempts ea
         JOIN exams e ON e.id=ea.exam_id JOIN topics t ON t.id=e.topic_id WHERE ea.id=?`, [attemptId]);
      if (!attempts.length) return { success: false, message: 'Không tìm thấy lượt thi' };
      const attempt = attempts[0];

      const wrongAnswers = await query(
        `SELECT TOP (10) q.question_text, q.difficulty, q.bloom_level
         FROM attempt_answers aa JOIN questions q ON q.id=aa.question_id
         WHERE aa.attempt_id=? AND aa.is_correct=0`, [attemptId]);

      const prompt = PROMPTS.LEARNING_PATH({
        score: attempt.score, totalQuestions: attempt.total_questions,
        correctCount: attempt.correct_count, topicName: attempt.topic_name, wrongAnswers
      });
      const result = await generateContent(prompt, 'text', { userId });
      const pathData = parseAIJson(result.text);

      // Lưu vào DB
      const lpResult = await insert(
        `INSERT INTO learning_paths (user_id, attempt_id, topic_id, overall_assessment,
         weak_areas, strong_areas, estimated_time, motivational_note, total_steps)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [userId, attemptId, attempt.topic_id, pathData.overallAssessment,
         JSON.stringify(pathData.weakAreas), JSON.stringify(pathData.strongAreas),
         pathData.estimatedTime, pathData.motivationalNote, pathData.steps?.length || 0]);

      if (pathData.steps) {
        for (let i = 0; i < pathData.steps.length; i++) {
          const s = pathData.steps[i];
          await insert(
            `INSERT INTO learning_path_steps (learning_path_id, step_order, title, description,
             duration, resources, weak_area, priority, step_type) VALUES (?,?,?,?,?,?,?,?,?)`,
            [lpResult.insertId, i+1, s.title, s.description, s.duration,
             JSON.stringify(s.resources), s.weakArea, s.priority||'medium', s.type||'learn']);
        }
      }

      await insert(
        `INSERT INTO ai_logs (user_id, action_type, related_id, related_type, total_tokens, response_time_ms)
         VALUES (?,?,?,?,?,?)`,
        [userId, 'learning_path', attemptId, 'attempt', result.tokens, result.responseTimeMs]);

      return { success: true, learningPath: pathData };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── AI Chatbot ──
  ipcMain.handle('ai:chatSend', async (event, data) => {
    try {
      const { sessionId, message, userId, topicId } = data;

      // BUG-CHAT-07 FIX: validate userId
      if (!userId) return { success: false, message: 'Bạn cần đăng nhập để dùng AI Tutor' };

      const normalizedMessage = (message || '').trim();
      if (!normalizedMessage) return { success: false, message: 'Tin nhắn không được để trống' };

      // Giới hạn chiều dài tin nhắn (tránh prompt injection và token overflow)
      if (normalizedMessage.length > 2000)
        return { success: false, message: 'Tin nhắn quá dài (tối đa 2000 ký tự)' };

      let sid = sessionId;
      let activeTopicId = topicId || null;

      if (!sid) {
        const res = await insert(
          'INSERT INTO chat_sessions (user_id, topic_id) VALUES (?,?)', [userId, activeTopicId]);
        sid = res.insertId;
      }

      // Insert user message trước – trigger T4 sẽ tự update message_count + updated_at
      await insert(
        'INSERT INTO chat_messages (session_id, sender_role, content) VALUES (?,?,?)',
        [sid, 'user', normalizedMessage]);

      const topicRows = await query(
        `SELECT cs.topic_id, t.name AS topic_name
         FROM chat_sessions cs LEFT JOIN topics t ON t.id=cs.topic_id WHERE cs.id=?`,
        [sid],
      );
      const topicName = topicRows[0]?.topic_name || null;

      // BUG-CHAT-01 FIX: lấy 20 tin nhắn MỚI NHẤT (không phải 20 đầu tiên!)
      // SQL Server: dùng subquery ORDER BY DESC + lấy TOP, rồi sort lại ASC để AI thấy đúng thứ tự
      const history = await query(
        `SELECT sender_role, content FROM (
           SELECT TOP (20) sender_role, content, created_at
           FROM chat_messages
           WHERE session_id = ?
           ORDER BY created_at DESC
         ) t ORDER BY t.created_at ASC`,
        [sid]);

      const prompt = PROMPTS.CHAT_TUTOR(normalizedMessage, history, { topicName });
      const result = await generateContent(prompt, 'chat', { userId });

      // Insert AI reply – trigger T4 sẽ tự update
      await insert(
        'INSERT INTO chat_messages (session_id, sender_role, content, tokens_used) VALUES (?,?,?,?)',
        [sid, 'assistant', result.text, result.tokens || 0]);

      // BUG-CHAT-03 FIX: Bỏ manual UPDATE chat_sessions – trigger T4 đã xử lý
      // message_count + total_tokens + updated_at được cập nhật tự động bởi trg_chat_msg_insert
      // Chỉ cần set title lần đầu tiên (khi session mới)
      if (!sessionId) {
        // Session mới: set title theo nội dung tin nhắn đầu
        await query(
          `UPDATE chat_sessions SET title = LEFT(?, 60) WHERE id = ? AND title = N'Phiên chat mới'`,
          [normalizedMessage, sid]
        );
      }

      const suggestions = [
        'Bạn có thể cho ví dụ cụ thể hơn không?',
        'Tóm tắt ý chính giúp mình trong 3 gạch đầu dòng nhé.',
        'Cho mình 2 câu hỏi luyện tập nhanh về phần này.',
      ];

      // BUG-CHAT-04 FIX: wrap ai_logs trong try/catch riêng
      try {
        await insert(
          'INSERT INTO ai_logs (user_id, action_type, related_id, related_type, total_tokens, response_time_ms) VALUES (?,?,?,?,?,?)',
          [userId, 'chat', sid, 'chat_session', result.tokens || 0, result.responseTimeMs || 0]);
      } catch (logErr) {
        console.warn('[ai:chatSend] log error:', logErr.message);
      }

      // Gamification: cập nhật tiến độ daily quest dạng explore_ai
      try {
        const openQuestRows = await query(
          `SELECT TOP (1) * FROM daily_quests
           WHERE user_id=? AND quest_date=CAST(GETDATE() AS DATE)
             AND quest_type='explore_ai' AND is_completed=0
           ORDER BY id`,
          [userId],
        );
        if (openQuestRows.length > 0) {
          const q = openQuestRows[0];
          const nextCount = Math.max(0, Number(q.current_count || 0)) + 1;
          const completed = nextCount >= Math.max(1, Number(q.target_count || 1)) ? 1 : 0;
          await query(
            `UPDATE daily_quests
             SET current_count=?, is_completed=?,
                 completed_at=CASE WHEN ?=1 THEN GETDATE() ELSE completed_at END
             WHERE id=?`,
            [nextCount, completed, completed, q.id],
          );
          if (completed) {
            await execProc('sp_add_xp', {
              user_id: userId,
              amount: Math.max(0, Number(q.xp_reward || 0)),
              reason: 'quest_complete',
              related_id: q.id,
              related_type: 'daily_quest',
              desc: q.title || 'Hoàn thành quest AI Tutor',
            });
          }
        }
      } catch (qErr) {
        console.warn('[ai:chatSend] daily quest update error:', qErr.message);
      }

      return { success: true, sessionId: sid, reply: result.text, topicName, suggestions };
    } catch (err) {
      console.error('[ai:chatSend]', err);
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('ai:chatSessions', async (event, userId) => {
    try {
      const sessions = await query(
        'SELECT TOP (50) * FROM chat_sessions WHERE user_id=? ORDER BY updated_at DESC', [userId]);
      return { success: true, sessions };
    } catch (err) { return { success: false, message: err.message }; }
  });

  ipcMain.handle('ai:chatHistory', async (event, sessionId) => {
    try {
      const messages = await query(
        'SELECT * FROM chat_messages WHERE session_id=? ORDER BY created_at', [sessionId]);
      return { success: true, messages };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── AI Quality Check ──
  ipcMain.handle('ai:qualityCheck', async (event, data) => {
    try {
      const { questionId, userId } = data;
      const qs = await query('SELECT * FROM questions WHERE id=?', [questionId]);
      if (!qs.length) return { success: false, message: 'Câu hỏi không tồn tại' };
      const opts = await query('SELECT * FROM question_options WHERE question_id=?', [questionId]);
      const prompt = PROMPTS.QUALITY_CHECK(qs[0], opts);
      const result = await generateContent(prompt, 'text', { userId });
      const quality = parseAIJson(result.text);

      await query('UPDATE questions SET quality_score=?, quality_feedback=? WHERE id=?',
        [quality.score, quality.feedback, questionId]);

      await insert(
        'INSERT INTO ai_logs (user_id, action_type, related_id, related_type, total_tokens, response_time_ms) VALUES (?,?,?,?,?,?)',
        [userId, 'quality_check', questionId, 'question', result.tokens, result.responseTimeMs]);

      return { success: true, quality };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── AI Predict Score ──
  ipcMain.handle('ai:predictScore', async (event, data) => {
    try {
      const { userId, examId } = data;
      const history = await query(
        `SELECT TOP (10) ea.score, ea.correct_count, ea.total_questions FROM exam_attempts ea
         JOIN exams e ON e.id=ea.exam_id WHERE ea.user_id=? AND ea.status='completed'
         ORDER BY ea.completed_at DESC`, [userId]);
      const prompt = PROMPTS.PREDICT_SCORE(history);
      const result = await generateContent(prompt, 'text', { userId });
      const prediction = parseAIJson(result.text);

      await insert(
        'INSERT INTO prediction_logs (user_id, exam_id, predicted_score, confidence, suggestions) VALUES (?,?,?,?,?)',
        [userId, examId, prediction.predictedScore, prediction.confidence,
         JSON.stringify(prediction.suggestions)]);

      return { success: true, prediction };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── AI Semantic Search ──
  ipcMain.handle('ai:semanticSearch', async (event, payload, topicIdFallback) => {
    try {
      const searchQuery = typeof payload === 'string' ? payload : payload?.query;
      const topicId = typeof payload === 'string' ? topicIdFallback : payload?.topicId;
      const requestUser = typeof payload === 'string' ? null : payload?.requestUser;

      const role = await getUserRoleById(requestUser?.id);
      if (!['admin', 'teacher'].includes(role)) {
        return { success: false, message: 'Bạn không có quyền thực hiện thao tác này' };
      }

      const rawQuery = String(searchQuery || '').trim();
      if (!rawQuery) return { success: false, message: 'Vui lòng nhập nội dung tìm kiếm' };

      let analysis = { keywords: [], synonyms: [], intent: 'keyword_fallback' };
      let allTerms = [];

      try {
        const prompt = PROMPTS.SEMANTIC_SEARCH(rawQuery);
        const result = await generateContent(prompt, 'text', { userId: requestUser?.id });
        analysis = parseAIJson(result.text);
        allTerms = [...(analysis.keywords || []), ...(analysis.synonyms || [])]
          .map(t => String(t || '').trim())
          .filter(Boolean);
      } catch (aiErr) {
        console.warn('[semanticSearch] AI error, fallback to keyword:', aiErr.message);
        allTerms = [];
      }

      // FIX BUG#11 – Fallback khi allTerms rỗng
      if (!allTerms.length) {
        allTerms = rawQuery.split(/\s+/).filter(t => t.length >= 2);
      }
      // Vẫn rỗng sau split? Return empty
      if (!allTerms.length) {
        return { success: true, questions: [], analysis };
      }

      const db = require('../config/db').getPool();
      const sql = require('mssql');
      const request = db.request();
      allTerms.forEach((t, i) => request.input(`s${i}`, sql.NVarChar(500), `%${t}%`));
      if (topicId) request.input('tid', sql.Int, topicId);

      const conditions = allTerms.map((_, i) => `q.question_text LIKE @s${i}`).join(' OR ');
      const sqlStr = `SELECT TOP (20) q.*, t.name AS topic_name FROM questions q
                      LEFT JOIN topics t ON t.id=q.topic_id
                      WHERE q.is_deleted=0 AND (${conditions})${topicId ? ' AND q.topic_id=@tid' : ''}`;
      const res = await request.query(sqlStr);

      return { success: true, questions: res.recordset, analysis };
    } catch (err) { return { success: false, message: err.message }; }
  });


  // ── AI Auto Tag ──
  ipcMain.handle('ai:autoTag', async (event, data) => {
    try {
      const { questionId, userId } = data;
      const qs = await query('SELECT * FROM questions WHERE id=?', [questionId]);
      if (!qs.length) return { success: false, message: 'Câu hỏi không tồn tại' };
      const prompt = PROMPTS.AUTO_TAG(qs[0].question_text);
      const result = await generateContent(prompt, 'text', { userId });
      const tags = parseAIJson(result.text);

      if (tags.difficulty) await query('UPDATE questions SET difficulty=? WHERE id=?', [tags.difficulty, questionId]);
      if (tags.bloomLevel) await query('UPDATE questions SET bloom_level=? WHERE id=?', [tags.bloomLevel, questionId]);
      if (tags.estimatedTime) await query('UPDATE questions SET estimated_time=? WHERE id=?', [tags.estimatedTime, questionId]);

      await insert(
        'INSERT INTO ai_logs (user_id, action_type, related_id, related_type, total_tokens, response_time_ms) VALUES (?,?,?,?,?,?)',
        [userId, 'auto_tag', questionId, 'question', result.tokens, result.responseTimeMs]);

      return { success: true, tags };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── AI Summarize Document ──
  ipcMain.handle('ai:summarizeDocument', async (event, data) => {
    try {
      const { filePath, userId, topicId } = data;
      let text = '';
      const ext = (filePath || '').toLowerCase();

      if (ext.endsWith('.pdf')) {
        try {
          const pdfParse = require('pdf-parse');
          const buffer = fs.readFileSync(filePath);
          const pdfData = await pdfParse(buffer);
          text = pdfData.text;
        } catch (pdfErr) {
          return { success: false, message: 'Không thể đọc file PDF: ' + pdfErr.message };
        }
      } else if (ext.endsWith('.docx')) {
        // FIX BUG#10 – DOCX không thể đọc bằng UTF-8 thông thưỜng
        try {
          const mammoth = require('mammoth');
          const result = await mammoth.extractRawText({ path: filePath });
          text = result.value;
        } catch {
          return {
            success: false,
            message: 'Không thể đọc file DOCX. Hãy chuyển sang PDF hoặc TXT rồi thử lại.'
          };
        }
      } else if (ext.endsWith('.txt') || ext.endsWith('.md')) {
        text = fs.readFileSync(filePath, 'utf-8');
      } else {
        return { success: false, message: 'Chỉ hỗ trợ file PDF, TXT, DOCX' };
      }

      if (!text?.trim()) {
        return { success: false, message: 'File không có nội dung văn bản đọc được' };
      }

      const prompt = PROMPTS.SUMMARIZE_DOCUMENT(text.substring(0, 30000));
      const result = await generateContent(prompt, 'text', { userId });
      const summary = parseAIJson(result.text);

      // BUG-05 FIX: không dùng `const path` lại – dùng `path` từ module scope
      // BUG-08 FIX: wrap DB log trong try/catch riêng
      try {
        await insert(
          `INSERT INTO document_uploads (user_id, topic_id, original_name, stored_name, file_path,
           file_type, file_size, extracted_text, ai_summary, ai_chapters, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [userId, topicId || null, path.basename(filePath), path.basename(filePath), filePath,
           ext.endsWith('.pdf') ? 'pdf' : ext.endsWith('.docx') ? 'docx' : 'txt',
           fs.statSync(filePath).size, text.substring(0, 50000),
           summary.overallSummary, JSON.stringify(summary.chapters), 'ready']);
      } catch (dbErr) {
        console.warn('[summarizeDocument] DB log error:', dbErr.message);
      }

      return { success: true, summary };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── AI Summarize Results ──
  ipcMain.handle('ai:summarizeResults', async (event, data) => {
    try {
      const { examId, userId } = data;
      const stats = await query('SELECT * FROM vw_exam_stats WHERE exam_id=?', [examId]);
      if (!stats.length) return { success: false, message: 'Chưa có dữ liệu' };
      const prompt = PROMPTS.SUMMARIZE_RESULTS(stats[0]);
      const result = await generateContent(prompt, 'text', { userId });
      return { success: true, summary: result.text };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── AI Group Students ──
  ipcMain.handle('ai:groupStudents', async (event, data) => {
    try {
      const { examId, userId } = data;
      const performance = await query(
        `SELECT ea.user_id, u.full_name, ea.score, ea.correct_count, ea.total_questions
         FROM exam_attempts ea JOIN users u ON u.id=ea.user_id
         WHERE ea.exam_id=? AND ea.status='completed'`, [examId]);
      if (!performance.length) return { success: false, message: 'Chưa có dữ liệu' };
      const prompt = PROMPTS.GROUP_STUDENTS(performance);
      const result = await generateContent(prompt, 'text', { userId });
      const groups = parseAIJson(result.text);
      return { success: true, groups };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── AI Provider Settings ──
  ipcMain.handle('ai:getProvider', async (event, userId) => {
    try {
      if (!userId) return { success: false, message: 'Thiếu userId' };
      const provider = getAIProvider(userId);
      return { success: true, provider };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('ai:setProvider', async (event, data) => {
    try {
      const { userId, provider } = data || {};
      if (!userId) return { success: false, message: 'Thiếu userId' };
      const updatedProvider = setAIProvider(userId, provider);
      return { success: true, provider: updatedProvider };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // ── AI Status Check – cả 3 providers ──
  ipcMain.handle('ai:checkStatus', async (event, userId) => {
    try {
      const currentProvider = userId ? getAIProvider(userId) : 'unknown';

      // Kiểm tra parallel để nhanh
      const [ollamaStatus, groqStatus, geminiStatus] = await Promise.all([
        getOllamaStatus(),
        getGroqStatus(),
        Promise.resolve(getGeminiStatus()),
      ]);

      // Mô tả luồng fallback theo provider hiện tại
      const providerLabels = { ollama: '🦙 Ollama', groq: '⚡ Groq', gemini: '✨ Gemini' };
      const rest = ['ollama', 'groq', 'gemini'].filter(p => p !== currentProvider);
      const flowDescription = `${providerLabels[currentProvider] || currentProvider} (PRIMARY) → ${rest.map(p => providerLabels[p]).join(' → ')} (fallback tự động)`;

      const ollamaOk  = ollamaStatus.online;
      const groqOk    = groqStatus.configured && groqStatus.online !== false;
      const geminiOk  = geminiStatus.configured;
      const anyOk     = ollamaOk || groqOk || geminiOk;

      return {
        success: true,
        currentProvider,
        validProviders: VALID_PROVIDERS,
        ollama: ollamaStatus,
        groq:   groqStatus,
        gemini: geminiStatus,
        flowDescription,
        bothUnavailable: !anyOk,
        primaryOk: {
          ollama: ollamaOk, groq: groqOk, gemini: geminiOk,
        }[currentProvider] ?? false,
        summary: {
          online: { ollama: ollamaOk, groq: groqOk, gemini: geminiOk },
          preferredOrder: [currentProvider, ...rest],
        },
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // ── Anti-cheat: log event ──
  ipcMain.handle('cheat:logEvent', async (event, data) => {
    try {
      const { attemptId, eventType, detail, weight, questionId } = data;
      const logs = await query('SELECT id FROM cheating_logs WHERE attempt_id=?', [attemptId]);
      if (logs.length) {
        await insert(
          `INSERT INTO cheating_events (cheating_log_id, event_type, detail, weight, question_id)
           VALUES (?,?,?,?,?)`,
          [logs[0].id, eventType, detail||null, weight||1, questionId||null]);
      }
      return { success: true };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── Anti-cheat: xem báo cáo ──
  ipcMain.handle('cheat:getReport', async (event, attemptId) => {
    try {
      const logs = await query('SELECT * FROM cheating_logs WHERE attempt_id=?', [attemptId]);
      if (!logs.length) return { success: true, report: null };
      const events = await query(
        'SELECT * FROM cheating_events WHERE cheating_log_id=? ORDER BY event_at', [logs[0].id]);
      return { success: true, report: { ...logs[0], events } };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── Anti-cheat: danh sách tổng hợp ──
  ipcMain.handle('cheat:getAll', async (event, params = {}, requestUser = null) => {
    try {
      const denied = await ensureAdmin(requestUser);
      if (denied) return denied;

      const directQuery = `
        SELECT TOP (100)
            cl.id, cl.attempt_id, u.full_name AS student_name, u.username,
            e.id AS exam_id, e.title AS exam_title, ea.score,
            cl.risk_score, cl.risk_level, cl.total_events, cl.review_action,
            cl.created_at
        FROM cheating_logs cl
        JOIN users u ON u.id = cl.user_id
        JOIN exam_attempts ea ON ea.id = cl.attempt_id
        JOIN exams e ON e.id = ea.exam_id
        ORDER BY cl.created_at DESC
      `;
      const rows = await query(directQuery);
      return { success: true, reports: rows };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── Anti-cheat: review ──
  ipcMain.handle('cheat:reviewReport', async (event, logId, data, requestUser = null) => {
    try {
      const denied = await ensureAdmin(requestUser);
      if (denied) return denied;

      const { reviewedBy, action, note } = data;
      await query(
        `UPDATE cheating_logs SET reviewed_by=?, review_action=?, review_note=?,
         reviewed_at=GETDATE() WHERE id=?`,
        [reviewedBy || requestUser?.id, action, note || null, logId]);
      return { success: true };
    } catch (err) { return { success: false, message: err.message }; }
  });
};
