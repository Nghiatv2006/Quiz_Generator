const { query, insert, transaction, transQuery } = require('../config/db');

function calcLevelFromXP(xp) {
  const safeXP = Math.max(0, Number(xp) || 0);
  if (safeXP >= 20000) return 8;
  if (safeXP >= 10000) return 7;
  if (safeXP >= 5000) return 6;
  if (safeXP >= 2000) return 5;
  if (safeXP >= 1000) return 4;
  if (safeXP >= 500) return 3;
  if (safeXP >= 200) return 2;
  return 1;
}

async function addXpInTransaction(trans, userId, amount, reason, relatedId = null, relatedType = null, description = null) {
  const safeAmount = Math.max(0, Math.trunc(Number(amount) || 0));
  if (!safeAmount || !userId) return 0;

  await transQuery(trans, 'UPDATE users SET xp_points = xp_points + ? WHERE id = ?', [safeAmount, userId]);
  const rows = await transQuery(trans, 'SELECT xp_points FROM users WHERE id = ?', [userId]);
  const currentXP = Math.max(0, Number(rows[0]?.xp_points || 0));
  const newLevel = calcLevelFromXP(currentXP);

  await transQuery(trans, 'UPDATE users SET level = ? WHERE id = ?', [newLevel, userId]);

  // Log XP là phần phụ: nếu schema cũ thiếu bảng/cột thì không được làm fail luồng nộp bài.
  try {
    await transQuery(
      trans,
      `INSERT INTO xp_transactions_tbl (user_id, amount, reason, related_id, related_type, description, balance_after)
       VALUES (?,?,?,?,?,?,?)`,
      [userId, safeAmount, reason, relatedId, relatedType, description, currentXP],
    );
  } catch (logErr) {
    console.warn('[attempt:submit] xp log skipped:', logErr.message);
  }

  return safeAmount;
}

async function updateStreakInTransaction(trans, userId) {
  const rows = await transQuery(trans, 'SELECT last_active_date, streak_days, longest_streak FROM users WHERE id=?', [userId]);
  if (!rows.length) return;

  const u = rows[0];
  const lastDate = u.last_active_date ? new Date(u.last_active_date) : null;
  const today = new Date();
  const toDateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = lastDate ? Math.floor((toDateOnly(today) - toDateOnly(lastDate)) / 86400000) : null;

  if (diffDays === 0) return;
  if (diffDays === 1) {
    const nextStreak = Math.max(0, Number(u.streak_days || 0)) + 1;
    const nextLongest = Math.max(Math.max(0, Number(u.longest_streak || 0)), nextStreak);
    await transQuery(trans,
      'UPDATE users SET streak_days=?, longest_streak=?, last_active_date=CAST(GETDATE() AS DATE) WHERE id=?',
      [nextStreak, nextLongest, userId]);
    return;
  }

  await transQuery(trans,
    'UPDATE users SET streak_days=1, longest_streak=CASE WHEN longest_streak<1 THEN 1 ELSE longest_streak END, last_active_date=CAST(GETDATE() AS DATE) WHERE id=?',
    [userId]);
}
const crypto = require('crypto');

// Fisher-Yates shuffle with seed
function seededShuffle(arr, seed) {
  const shuffled = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  for (let i = shuffled.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const j = h % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const DIFFICULTY_TO_SCORE = { easy: 0.2, medium: 0.5, hard: 0.8 };
const DIFFICULTY_STEP = { easy: 0.08, medium: 0.1, hard: 0.12 };

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

function toIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toDecimalOrDefault(v, defaultValue = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultValue;
}

function safeTrimmedString(v, fallback = '') {
  if (typeof v === 'string') return v.trim();
  if (v === null || v === undefined) return fallback;
  return String(v).trim();
}

function sanitizeQuestionForClient(q) {
  const clean = { ...q };
  if (clean.options) {
    clean.options = clean.options.map((o, idx) => ({
      id: o.id,
      label: o.option_label || o.optionLabel || String.fromCharCode(65 + idx),
      text: String(o.option_text ?? o.optionText ?? o.text ?? '').trim(),
    }));
  }
  delete clean.explanation;
  return clean;
}

function chooseAdaptiveQuestion(questionBank, ability, excludedIds = new Set()) {
  const candidates = questionBank.filter(q => !excludedIds.has(q.id));
  if (!candidates.length) return null;

  return candidates
    .map(q => ({ ...q, diffScore: DIFFICULTY_TO_SCORE[q.difficulty] ?? 0.5 }))
    .sort((a, b) => {
      const deltaA = Math.abs(a.diffScore - ability);
      const deltaB = Math.abs(b.diffScore - ability);
      if (deltaA !== deltaB) return deltaA - deltaB;
      return (a.sort_order || 0) - (b.sort_order || 0);
    })[0];
}

async function evaluateAnswerInTransaction(trans, questionId, selectedOptions, fillAnswer) {
  const qs = await transQuery(trans, 'SELECT * FROM questions WHERE id=?', [questionId]);
  if (!qs.length) return false;
  const q = qs[0];

  if (q.question_type === 'fill_in') {
    const fillAns = await transQuery(trans,
      'SELECT * FROM question_fill_answers WHERE question_id=?', [q.id]);
    return fillAns.some(fa => {
      const userAns = (fillAnswer || '').trim().toLowerCase();
      const correct = fa.accepted_answer.trim().toLowerCase();
      if (fa.match_mode === 'contains') return userAns.includes(correct);
      return userAns === correct;
    });
  }

  const opts = await transQuery(trans,
    'SELECT * FROM question_options WHERE question_id=? AND is_correct=1', [q.id]);
  const correctLabels = opts.map(o => o.option_label).sort().join(',');
  const selectedLabels = (selectedOptions || '').split(',').filter(Boolean).sort().join(',');
  return correctLabels === selectedLabels;
}

module.exports = function (ipcMain) {
  // ── Bắt đầu thi ──
  ipcMain.handle('exam:start', async (event, data) => {
    try {
      const examId = toIntOrNull(data?.examId);
      const userId = toIntOrNull(data?.userId);
      const accessCode = safeTrimmedString(data?.accessCode, '');

      if (!examId || !userId) {
        return { success: false, message: 'Thiếu thông tin bài thi hoặc người dùng' };
      }

      const exams = await query(
        "SELECT * FROM exams WHERE id=? AND status='active' AND is_deleted=0", [examId]);
      if (!exams.length) return { success: false, message: 'Bài thi không tồn tại hoặc chưa mở' };
      const exam = exams[0];

      // FIX BUG#2 – Validate access_code phía server (không dựa vào client)
      if (exam.access_code && exam.access_code !== accessCode) {
        return { success: false, message: 'Mã truy cập không đúng' };
      }

      if (exam.max_attempts) {
        const [{ cnt }] = await query(
          'SELECT COUNT(*) AS cnt FROM exam_attempts WHERE exam_id=? AND user_id=?', [examId, userId]);
        if (cnt >= exam.max_attempts) return { success: false, message: 'Đã hết lượt thi' };
      }

      const rawQuestions = await query(
        `SELECT eq.sort_order, eq.points, q.* FROM exam_questions eq
         JOIN questions q ON q.id=eq.question_id WHERE eq.exam_id=? ORDER BY eq.sort_order`, [examId]);
      if (!rawQuestions.length) return { success: false, message: 'Bài thi chưa có câu hỏi' };

      // BUG-10 FIX: Batch load options (chấm dứt N+1 queries)
      if (rawQuestions.length > 0) {
        const nonFillIds = rawQuestions.filter(q => q.question_type !== 'fill_in').map(q => q.id);
        if (nonFillIds.length > 0) {
          const placeholders = nonFillIds.map(() => '?').join(',');
          const allOpts = await query(
            `SELECT * FROM question_options WHERE question_id IN (${placeholders}) ORDER BY sort_order`,
            nonFillIds
          );
          const optsByQ = {};
          for (const o of allOpts) (optsByQ[o.question_id] ||= []).push(o);
          for (const q of rawQuestions) {
            q.options = q.question_type !== 'fill_in' ? (optsByQ[q.id] || []) : [];
          }
        }
      }

      const seed = crypto.randomUUID();
      const totalQuestionTarget = rawQuestions.length;
      const initialAbility = 0.5;
      const res = await insert(
        `INSERT INTO exam_attempts (exam_id, user_id, shuffle_seed, total_questions, max_possible_score, ability_score, status)
         VALUES (?,?,?,?,?,?,?)`,
        [
          examId,
          userId,
          seed,
          toIntOrNull(totalQuestionTarget) || 0,
          toDecimalOrDefault(exam.max_score, 10),
          initialAbility,
          'in_progress',
        ]);

      if (exam.enable_anti_cheat) {
        await insert('INSERT INTO cheating_logs (attempt_id, user_id) VALUES (?,?)',
          [res.insertId, userId]);
      }

      if (exam.is_adaptive) {
        let adaptiveBank = [...rawQuestions];
        if (exam.shuffle_questions) adaptiveBank = seededShuffle(adaptiveBank, seed);

        const firstQ = chooseAdaptiveQuestion(adaptiveBank, initialAbility);
        if (!firstQ) return { success: false, message: 'Không tìm thấy câu hỏi phù hợp cho adaptive' };

        const adaptiveQuestion = { ...firstQ };
        let optionOrder = null;
        if (adaptiveQuestion.options && exam.shuffle_options) {
          adaptiveQuestion.options = seededShuffle(adaptiveQuestion.options, `${seed}-0`);
          optionOrder = adaptiveQuestion.options.map(o => o.option_label).join(',');
        }

        await insert(
          `INSERT INTO attempt_answers (attempt_id, question_id, question_order, max_points, option_order)
           VALUES (?,?,?,?,?)`,
          [
            res.insertId,
            toIntOrNull(adaptiveQuestion.id),
            1,
            toDecimalOrDefault(adaptiveQuestion.points, 1),
            optionOrder,
          ]);

        return {
          success: true,
          attemptId: res.insertId,
          exam: {
            title: exam.title,
            duration: exam.duration_minutes,
            totalQuestions: totalQuestionTarget,
            isAdaptive: true,
          },
          questions: [sanitizeQuestionForClient(adaptiveQuestion)],
          adaptiveMeta: {
            abilityScore: initialAbility,
            answeredCount: 0,
            totalQuestions: totalQuestionTarget,
          },
        };
      }

      let shuffledQuestions = rawQuestions;
      if (exam.shuffle_questions) shuffledQuestions = seededShuffle(rawQuestions, seed);

      const processedQuestions = [];
      for (let i = 0; i < shuffledQuestions.length; i++) {
        const q = { ...shuffledQuestions[i] };
        let optionOrder = null;
        if (q.options && exam.shuffle_options) {
          q.options = seededShuffle(q.options, seed + i);
          optionOrder = q.options.map(o => o.option_label).join(',');
        }

        await insert(
          `INSERT INTO attempt_answers (attempt_id, question_id, question_order, max_points, option_order)
           VALUES (?,?,?,?,?)`,
          [
            res.insertId,
            toIntOrNull(q.id),
            i + 1,
            toDecimalOrDefault(q.points, 1),
            optionOrder,
          ]);

        processedQuestions.push(sanitizeQuestionForClient(q));
      }

      return {
        success: true,
        attemptId: res.insertId,
        exam: { title: exam.title, duration: exam.duration_minutes, totalQuestions: rawQuestions.length, isAdaptive: false },
        questions: processedQuestions,
      };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── Lưu câu trả lời ──
  ipcMain.handle('attempt:saveAnswer', async (event, data) => {
    try {
      const { attemptId, questionId, selectedOptions, fillAnswer, timeSpent, isFlagged } = data;
      await query(
        `UPDATE attempt_answers SET selected_options=?, fill_answer=?, time_spent_seconds=?,
         is_flagged=?, answered_at=GETDATE() WHERE attempt_id=? AND question_id=?`,
        [selectedOptions || null, fillAnswer || null, timeSpent || null,
          isFlagged ? 1 : 0, attemptId, questionId]);
      return { success: true };
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── Adaptive: lưu câu hiện tại + lấy câu kế tiếp ──
  ipcMain.handle('attempt:nextAdaptiveQuestion', async (event, data) => {
    try {
      const { attemptId, questionId, selectedOptions, fillAnswer, timeSpent, isFlagged } = data;

      return await transaction(async (trans) => {
        const attempts = await transQuery(trans,
          `SELECT ea.*, e.is_adaptive, e.shuffle_options, e.shuffle_questions
           FROM exam_attempts ea JOIN exams e ON e.id=ea.exam_id
           WHERE ea.id=? AND ea.status='in_progress'`, [attemptId]);
        if (!attempts.length) return { success: false, message: 'Lượt thi không hợp lệ' };

        const attempt = attempts[0];
        if (!attempt.is_adaptive) return { success: false, message: 'Bài thi này không ở chế độ adaptive' };

        await transQuery(trans,
          `UPDATE attempt_answers SET selected_options=?, fill_answer=?, time_spent_seconds=?,
           is_flagged=?, answered_at=GETDATE() WHERE attempt_id=? AND question_id=?`,
          [selectedOptions || null, fillAnswer || null, timeSpent || null, isFlagged ? 1 : 0, attemptId, questionId]);

        const answeredRows = await transQuery(trans,
          `SELECT aa.* FROM attempt_answers aa WHERE aa.attempt_id=?`, [attemptId]);
        const answeredQuestionIds = new Set(answeredRows.map(a => a.question_id));

        const currentAnswer = answeredRows.find(a => a.question_id === questionId);
        if (!currentAnswer) return { success: false, message: 'Không tìm thấy câu trả lời hiện tại' };

        const isCorrect = await evaluateAnswerInTransaction(
          trans,
          questionId,
          currentAnswer.selected_options,
          currentAnswer.fill_answer,
        );

        await transQuery(trans,
          'UPDATE attempt_answers SET is_correct=?, points_earned=? WHERE id=?',
          [isCorrect ? 1 : 0, isCorrect ? parseFloat(currentAnswer.max_points || 1) : 0, currentAnswer.id]);

        const baseAbility = clamp01(attempt.ability_score == null ? 0.5 : attempt.ability_score);
        const currentQ = await transQuery(trans,
          'SELECT difficulty FROM questions WHERE id=?', [questionId]);
        const diff = currentQ[0]?.difficulty || 'medium';
        const step = DIFFICULTY_STEP[diff] || 0.1;
        const nextAbility = clamp01(baseAbility + (isCorrect ? step : -step));

        await transQuery(trans,
          'UPDATE exam_attempts SET ability_score=? WHERE id=?', [nextAbility, attemptId]);

        const allQuestions = await transQuery(trans,
          `SELECT eq.sort_order, eq.points, q.* FROM exam_questions eq
           JOIN questions q ON q.id=eq.question_id WHERE eq.exam_id=? ORDER BY eq.sort_order`, [attempt.exam_id]);

        for (const q of allQuestions) {
          if (q.question_type !== 'fill_in') {
            q.options = await transQuery(trans,
              'SELECT * FROM question_options WHERE question_id=? ORDER BY sort_order', [q.id]);
          }
        }

        const nextQuestion = chooseAdaptiveQuestion(allQuestions, nextAbility, answeredQuestionIds);
        const answeredCount = answeredRows.length;
        if (!nextQuestion) {
          return {
            success: true,
            done: true,
            adaptiveMeta: {
              abilityScore: nextAbility,
              answeredCount,
              totalQuestions: attempt.total_questions,
              lastCorrect: !!isCorrect,
            },
          };
        }

        const nextOrder = answeredCount + 1;
        const seed = attempt.shuffle_seed || '';
        let optionOrder = null;
        let nextQWithOptions = { ...nextQuestion };
        if (nextQWithOptions.options && attempt.shuffle_options) {
          nextQWithOptions.options = seededShuffle(nextQWithOptions.options, `${seed}-${nextOrder}`);
          optionOrder = nextQWithOptions.options.map(o => o.option_label).join(',');
        }

        await transQuery(trans,
          `INSERT INTO attempt_answers (attempt_id, question_id, question_order, max_points, option_order)
           VALUES (?,?,?,?,?)`,
          [
            attemptId,
            toIntOrNull(nextQWithOptions.id),
            nextOrder,
            toDecimalOrDefault(nextQWithOptions.points, 1),
            optionOrder,
          ]);

        return {
          success: true,
          done: false,
          question: sanitizeQuestionForClient(nextQWithOptions),
          adaptiveMeta: {
            abilityScore: nextAbility,
            answeredCount,
            totalQuestions: attempt.total_questions,
            lastCorrect: !!isCorrect,
          },
        };
      });
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── Nộp bài ──
  ipcMain.handle('attempt:submit', async (event, attemptId, customStatus = 'completed') => {
    try {
      return await transaction(async (trans) => {
        // Lấy attempt
        const attempts = await transQuery(trans,
          "SELECT * FROM exam_attempts WHERE id=? AND status='in_progress'", [attemptId]);
        if (!attempts.length) return { success: false, message: 'Lượt thi không hợp lệ' };
        const attempt = attempts[0];

        // Lấy exam – FIX BUG#13: null check
        const exams = await transQuery(trans, 'SELECT * FROM exams WHERE id=?', [attempt.exam_id]);
        if (!exams.length) return { success: false, message: 'Không tìm thấy thông tin bài thi' };
        const exam = exams[0];

        // Lấy answers + chấm điểm
        const answers = await transQuery(trans,
          'SELECT * FROM attempt_answers WHERE attempt_id=?', [attemptId]);
        let correctCount = 0, wrongCount = 0, unanswered = 0, totalPoints = 0;
        let totalMaxPoints = 0;

        for (const ans of answers) {
          totalMaxPoints += parseFloat(ans.max_points || 1);

          if (!ans.selected_options && !ans.fill_answer) {
            unanswered++;
            continue;
          }

          // Lấy câu hỏi
          const qs = await transQuery(trans, 'SELECT * FROM questions WHERE id=?', [ans.question_id]);
          const q = qs[0];
          let isCorrect = false;

          if (q.question_type === 'fill_in') {
            const fillAns = await transQuery(trans,
              'SELECT * FROM question_fill_answers WHERE question_id=?', [q.id]);
            isCorrect = fillAns.some(fa => {
              const userAns = (ans.fill_answer || '').trim().toLowerCase();
              const correct = fa.accepted_answer.trim().toLowerCase();
              if (fa.match_mode === 'contains') return userAns.includes(correct);
              return userAns === correct;
            });
          } else {
            const opts = await transQuery(trans,
              'SELECT * FROM question_options WHERE question_id=? AND is_correct=1', [q.id]);
            const correctLabels = opts.map(o => o.option_label).sort().join(',');
            // BUG-03 FIX: thêm filter(Boolean) – tránh '' trong array sau split('')
            const selectedLabels = (ans.selected_options || '').split(',').filter(Boolean).sort().join(',');
            isCorrect = correctLabels === selectedLabels;
          }

          if (isCorrect) { correctCount++; totalPoints += parseFloat(ans.max_points || 1); }
          else { wrongCount++; }

          await transQuery(trans,
            'UPDATE attempt_answers SET is_correct=?, points_earned=? WHERE id=?',
            [isCorrect ? 1 : 0, isCorrect ? parseFloat(ans.max_points || 1) : 0, ans.id]);
        }

        // Tính điểm thang 10
        const score = totalMaxPoints > 0
          ? parseFloat(exam.max_score || 10) * (totalPoints / totalMaxPoints)
          : 0;
        let isPassed = score >= parseFloat(exam.passing_score);
        
        if (customStatus === 'banned') {
          isPassed = false;
        }

        const elapsedRows = await transQuery(trans,
          'SELECT DATEDIFF(SECOND, started_at, GETDATE()) AS elapsed_seconds FROM exam_attempts WHERE id=?',
          [attemptId]);
        const rawElapsed = Number(elapsedRows?.[0]?.elapsed_seconds || 0);
        const timeTaken = Math.max(0, Number.isFinite(rawElapsed) ? rawElapsed : 0);

        const roundedScore = Math.round(score * 100) / 100;

        // Update attempt
        await transQuery(trans,
          `UPDATE exam_attempts SET score=?, correct_count=?, wrong_count=?, unanswered_count=?,
           time_taken_seconds=?, is_passed=?, status=?, completed_at=GETDATE() WHERE id=?`,
          [roundedScore, correctCount, wrongCount, unanswered,
            timeTaken, isPassed ? 1 : 0, customStatus, attemptId]);

        // Gamification: core XP phải luôn chạy ổn định
        await transQuery(trans,
          'UPDATE users SET total_exams_taken = total_exams_taken + 1 WHERE id = ?',
          [attempt.user_id]);

        await updateStreakInTransaction(trans, attempt.user_id);

        let xpEarned = 0;
        const baseXp = Math.max(10, Math.round(roundedScore * 10));
        xpEarned += await addXpInTransaction(trans, attempt.user_id, baseXp, 'exam_complete', attemptId, 'attempt', `Hoàn thành bài thi #${attempt.exam_id}`);

        if (isPassed) {
          // Tránh phụ thuộc reason có/không có trong DB cũ
          xpEarned += await addXpInTransaction(trans, attempt.user_id, 25, 'exam_complete', attemptId, 'attempt', 'Thưởng vượt điểm đạt');
        }
        if (Math.abs(Number(exam.max_score || 10) - roundedScore) < 0.001) {
          xpEarned += await addXpInTransaction(trans, attempt.user_id, 50, 'perfect_score', attemptId, 'attempt', 'Điểm tuyệt đối');
        }

        // Lưu tổng XP nhận được vào attempt
        await transQuery(trans, 'UPDATE exam_attempts SET xp_earned=? WHERE id=?', [xpEarned, attemptId]);

        // Optional: badges + quests. Nếu lỗi schema/migration cũ thì bỏ qua, KHÔNG làm fail submit.
        try {
          const completedRows = await transQuery(trans,
            "SELECT COUNT(*) AS c FROM exam_attempts WHERE user_id=? AND status='completed'", [attempt.user_id]);
          const perfectRows = await transQuery(trans,
            'SELECT COUNT(*) AS c FROM exam_attempts WHERE user_id=? AND status=\'completed\' AND is_passed=1 AND ABS(ISNULL(score,0)-ISNULL(max_possible_score,0)) <= 0.001', [attempt.user_id]);
          const userRows = await transQuery(trans,
            'SELECT streak_days, total_ai_usage FROM users WHERE id=?', [attempt.user_id]);
          const rankRows = await transQuery(trans,
            `SELECT COUNT(*) + 1 AS xp_rank
             FROM users
             WHERE role='student' AND is_active=1
               AND xp_points > (SELECT xp_points FROM users WHERE id=?)`, [attempt.user_id]);

          const examCount = Number(completedRows[0]?.c || 0);
          const perfectCount = Number(perfectRows[0]?.c || 0);
          const streakDays = Number(userRows[0]?.streak_days || 0);
          const aiUsage = Number(userRows[0]?.total_ai_usage || 0);
          const xpRank = Number(rankRows[0]?.xp_rank || 999999);
          const speedDone = Number(exam.duration_minutes || 0) > 0 && timeTaken <= Number(exam.duration_minutes) * 60 * 0.5;

          const badges = await transQuery(trans, 'SELECT * FROM badges WHERE is_active=1 ORDER BY sort_order');
          const earned = await transQuery(trans, 'SELECT badge_id FROM user_badges WHERE user_id=?', [attempt.user_id]);
          const earnedSet = new Set(earned.map(e => Number(e.badge_id)));

          for (const b of badges) {
            if (earnedSet.has(Number(b.id))) continue;
            const target = Number(b.condition_value || 1);
            let ok = false;
            if (b.condition_type === 'exam_count') ok = examCount >= target;
            else if (b.condition_type === 'perfect_score') ok = perfectCount >= target;
            else if (b.condition_type === 'streak_days') ok = streakDays >= target;
            else if (b.condition_type === 'ai_usage') ok = aiUsage >= target;
            else if (b.condition_type === 'leaderboard_1') ok = xpRank === 1;
            else if (b.condition_type === 'speed_finish') ok = speedDone;
            if (!ok) continue;

            await transQuery(trans, 'INSERT INTO user_badges (user_id, badge_id, is_new) VALUES (?,?,1)', [attempt.user_id, b.id]);
            if (Number(b.xp_reward || 0) > 0) {
              const bonus = await addXpInTransaction(trans, attempt.user_id, Number(b.xp_reward || 0), 'badge_earned', b.id, 'badge', `Nhận huy hiệu: ${b.name}`);
              xpEarned += bonus;
            }
          }

          const todayExamQuest = await transQuery(trans,
            `SELECT TOP (1) * FROM daily_quests
             WHERE user_id=? AND quest_date=CAST(GETDATE() AS DATE)
               AND is_completed=0 AND quest_type='exam'
             ORDER BY id`,
            [attempt.user_id]);

          if (todayExamQuest.length > 0) {
            const q = todayExamQuest[0];
            const nextCount = Math.max(0, Number(q.current_count || 0)) + 1;
            const completed = nextCount >= Number(q.target_count || 1) ? 1 : 0;
            await transQuery(trans,
              'UPDATE daily_quests SET current_count=?, is_completed=?, completed_at=CASE WHEN ?=1 THEN GETDATE() ELSE completed_at END WHERE id=?',
              [nextCount, completed, completed, q.id]);
            if (completed) {
              const qBonus = await addXpInTransaction(trans, attempt.user_id, Number(q.xp_reward || 0), 'quest_complete', q.id, 'daily_quest', q.title || 'Daily quest');
              xpEarned += qBonus;
            }
          }

          await transQuery(trans, 'UPDATE exam_attempts SET xp_earned=? WHERE id=?', [xpEarned, attemptId]);
        } catch (gErr) {
          console.warn('[attempt:submit] optional gamification skipped:', gErr.message);
        }

        return {
          success: true,
          result: {
            score: roundedScore, correctCount, wrongCount, unanswered,
            totalQuestions: answers.length, isPassed, timeTaken,
            xpEarned: xpEarned, status: customStatus
          }
        };
      });
    } catch (err) { return { success: false, message: err.message }; }
  });

  // ── Xem kết quả ──
  ipcMain.handle('attempt:getResult', async (event, attemptId) => {
    try {
      if (!attemptId) return { success: false, message: 'Thiếu attemptId' };

      const attempts = await query(
        `SELECT ea.*, e.title AS exam_title, e.passing_score, e.show_explanation,
                t.name AS topic_name,
                CASE
                  WHEN ea.time_taken_seconds IS NULL OR ea.time_taken_seconds < 0 THEN
                    DATEDIFF(SECOND, ea.started_at, ISNULL(ea.completed_at, GETDATE()))
                  ELSE ea.time_taken_seconds
                END AS computed_time_taken_seconds
         FROM exam_attempts ea JOIN exams e ON e.id=ea.exam_id
         LEFT JOIN topics t ON t.id=e.topic_id WHERE ea.id=?`, [attemptId]);
      if (!attempts.length) return { success: false, message: 'Không tìm thấy lượt thi' };

      const attempt = attempts[0];
      attempt.time_taken_seconds = Math.max(0, Number(attempt.computed_time_taken_seconds || attempt.time_taken_seconds || 0));
      attempt.answers = await query(
        `SELECT aa.*, q.question_text, q.question_type, q.difficulty, q.explanation
         FROM attempt_answers aa JOIN questions q ON q.id=aa.question_id
         WHERE aa.attempt_id=? ORDER BY aa.question_order`, [attemptId]);

      // BUG-HIST-13 FIX: Batch load tất cả options trong 1 query – tránh N+1
      const nonFillIds = attempt.answers
        .filter(a => a.question_type !== 'fill_in')
        .map(a => a.question_id);

      const optsByQ = {};
      if (nonFillIds.length > 0) {
        const ph = nonFillIds.map(() => '?').join(',');
        const allOpts = await query(
          `SELECT * FROM question_options WHERE question_id IN (${ph}) ORDER BY sort_order`,
          nonFillIds);
        for (const o of allOpts) (optsByQ[o.question_id] ||= []).push(o);
      }

      for (const a of attempt.answers) {
        a.options = optsByQ[a.question_id] || [];
        if (!attempt.show_explanation) delete a.explanation;
      }

      return { success: true, attempt };
    } catch (err) {
      console.error('[attempt:getResult]', err);
      return { success: false, message: err.message };
    }
  });

  // ── Lịch sử thi ──
  ipcMain.handle('attempt:getHistory', async (event, params) => {
    try {
      const { userId, page = 1, limit = 20, status, topicId } = params || {};

      // BUG-HIST-11 FIX: validate userId và sành page/limit – tránh OFFSET âm
      if (!userId) return { success: false, message: 'Thiếu userId' };
      const safePage  = Math.max(1, parseInt(page)  || 1);
      const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
      const offset    = (safePage - 1) * safeLimit;

      // Build WHERE clause một cách an toàn (với params)
      const conditions = ['ea.user_id = ?'];
      const sqlParams  = [userId];

      if (status && ['completed','in_progress','timed_out'].includes(status)) {
        conditions.push('ea.status = ?');
        sqlParams.push(status);
      }
      if (topicId) {
        conditions.push('e.topic_id = ?');
        sqlParams.push(topicId);
      }

      const whereClause = conditions.join(' AND ');

      // BUG-HIST-12 FIX: trả về total count để frontend phân trang
      const [{ total }] = await query(
        `SELECT COUNT(*) AS total FROM exam_attempts ea
         JOIN exams e ON e.id=ea.exam_id WHERE ${whereClause}`,
        [...sqlParams]);

      const attempts = await query(
        `SELECT ea.*, e.title AS exam_title, e.max_score, e.passing_score,
                t.name AS topic_name,
                CASE
                  WHEN ea.time_taken_seconds IS NULL OR ea.time_taken_seconds < 0 THEN
                    DATEDIFF(SECOND, ea.started_at, ISNULL(ea.completed_at, GETDATE()))
                  ELSE ea.time_taken_seconds
                END AS computed_time_taken_seconds
         FROM exam_attempts ea
         JOIN exams e ON e.id=ea.exam_id
         LEFT JOIN topics t ON t.id=e.topic_id
         WHERE ${whereClause}
         ORDER BY ea.started_at DESC
         OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`,
        [...sqlParams, offset, safeLimit]);

      for (const a of attempts) {
        a.time_taken_seconds = Math.max(0, Number(a.computed_time_taken_seconds || a.time_taken_seconds || 0));
      }
      return {
        success: true,
        attempts,
        pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
      };
    } catch (err) {
      console.error('[attempt:getHistory]', err);
      return { success: false, message: err.message };
    }
  });
};
