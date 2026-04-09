-- ============================================================
-- QUIZ GENERATOR V2 - SQL SERVER (T-SQL)
-- PART 2: VIEWS + TRIGGERS + STORED PROCEDURES + SEED DATA
-- ============================================================
USE quiz_generator;
GO

-- ============================================================
-- VIEWS
-- ============================================================

-- V1: Thống kê chủ đề
CREATE OR ALTER VIEW vw_topic_stats AS
SELECT
    t.id AS topic_id, t.name AS topic_name, t.slug, t.icon, t.color,
    COUNT(DISTINCT q.id) AS total_questions,
    SUM(CASE WHEN q.difficulty='easy' THEN 1 ELSE 0 END) AS easy_count,
    SUM(CASE WHEN q.difficulty='medium' THEN 1 ELSE 0 END) AS medium_count,
    SUM(CASE WHEN q.difficulty='hard' THEN 1 ELSE 0 END) AS hard_count,
    SUM(CASE WHEN q.is_ai_generated=1 THEN 1 ELSE 0 END) AS ai_generated_count,
    COUNT(DISTINCT e.id) AS total_exams,
    COUNT(DISTINCT ea.id) AS total_attempts,
    ROUND(AVG(CAST(ea.score AS FLOAT)), 2) AS avg_score
FROM topics t
LEFT JOIN questions q ON q.topic_id = t.id AND q.is_deleted = 0
LEFT JOIN exams e ON e.topic_id = t.id AND e.is_deleted = 0
LEFT JOIN exam_attempts ea ON ea.exam_id = e.id AND ea.status = 'completed'
WHERE t.is_deleted = 0
GROUP BY t.id, t.name, t.slug, t.icon, t.color;
GO

-- V2: Bảng xếp hạng
CREATE OR ALTER VIEW vw_leaderboard AS
SELECT
    u.id AS user_id, u.full_name, u.username, u.avatar_url,
    u.xp_points, u.level, u.streak_days, u.longest_streak,
    COUNT(DISTINCT ea.id) AS completed_exams,
    ROUND(AVG(CAST(ea.score AS FLOAT)), 2) AS avg_score,
    MAX(ea.score) AS best_score,
    SUM(CASE WHEN ea.is_passed=1 THEN 1 ELSE 0 END) AS pass_count,
    COUNT(DISTINCT ub.badge_id) AS badge_count,
    RANK() OVER (ORDER BY u.xp_points DESC) AS xp_rank
FROM users u
LEFT JOIN exam_attempts ea ON ea.user_id = u.id AND ea.status = 'completed'
LEFT JOIN user_badges ub ON ub.user_id = u.id
WHERE u.role = 'student' AND u.is_active = 1
GROUP BY u.id, u.full_name, u.username, u.avatar_url,
         u.xp_points, u.level, u.streak_days, u.longest_streak;
GO

-- V3: Thống kê bài thi
CREATE OR ALTER VIEW vw_exam_stats AS
SELECT
    e.id AS exam_id, e.title, e.topic_id, t.name AS topic_name,
    e.total_questions, e.duration_minutes, e.passing_score, e.status,
    COUNT(ea.id) AS total_attempts,
    COUNT(DISTINCT ea.user_id) AS unique_students,
    ROUND(AVG(CAST(ea.score AS FLOAT)), 2) AS avg_score,
    MIN(ea.score) AS min_score, MAX(ea.score) AS max_score,
    ROUND(AVG(CAST(ea.time_taken_seconds AS FLOAT)), 0) AS avg_time_seconds,
    SUM(CASE WHEN ea.is_passed=1 THEN 1 ELSE 0 END) AS pass_count,
    SUM(CASE WHEN ea.is_passed=0 THEN 1 ELSE 0 END) AS fail_count,
    CASE WHEN COUNT(ea.id)>0
        THEN ROUND(CAST(SUM(CASE WHEN ea.is_passed=1 THEN 1 ELSE 0 END) AS FLOAT)*100.0/COUNT(ea.id), 2)
        ELSE 0 END AS pass_rate
FROM exams e
LEFT JOIN exam_attempts ea ON ea.exam_id = e.id AND ea.status = 'completed'
LEFT JOIN topics t ON t.id = e.topic_id
WHERE e.is_deleted = 0
GROUP BY e.id, e.title, e.topic_id, t.name, e.total_questions,
         e.duration_minutes, e.passing_score, e.status;
GO

-- V4: Phân tích câu hỏi
CREATE OR ALTER VIEW vw_question_analysis AS
SELECT
    q.id AS question_id,
    LEFT(q.question_text, 200) AS question_preview,
    q.topic_id, q.difficulty, q.question_type, q.is_ai_generated, q.quality_score,
    COUNT(aa.id) AS times_answered,
    SUM(CASE WHEN aa.is_correct=1 THEN 1 ELSE 0 END) AS correct_count,
    SUM(CASE WHEN aa.is_correct=0 THEN 1 ELSE 0 END) AS wrong_count,
    CASE WHEN COUNT(aa.id)>0
        THEN ROUND(CAST(SUM(CASE WHEN aa.is_correct=1 THEN 1 ELSE 0 END) AS FLOAT)*100.0/COUNT(aa.id), 2)
        ELSE NULL END AS correct_rate,
    ROUND(AVG(CAST(aa.time_spent_seconds AS FLOAT)), 1) AS avg_time_seconds
FROM questions q
LEFT JOIN attempt_answers aa ON aa.question_id = q.id AND aa.is_correct IS NOT NULL
WHERE q.is_deleted = 0
GROUP BY q.id, q.question_text, q.topic_id, q.difficulty, q.question_type,
         q.is_ai_generated, q.quality_score;
GO

-- V5: Hiệu suất user theo chủ đề
CREATE OR ALTER VIEW vw_user_performance AS
SELECT
    u.id AS user_id, u.full_name, t.id AS topic_id, t.name AS topic_name,
    COUNT(ea.id) AS attempts,
    ROUND(AVG(CAST(ea.score AS FLOAT)), 2) AS avg_score,
    MAX(ea.score) AS best_score,
    SUM(CASE WHEN ea.is_passed=1 THEN 1 ELSE 0 END) AS pass_count
FROM users u
JOIN exam_attempts ea ON ea.user_id = u.id AND ea.status = 'completed'
JOIN exams e ON e.id = ea.exam_id
JOIN topics t ON t.id = e.topic_id
WHERE u.is_active = 1
GROUP BY u.id, u.full_name, t.id, t.name;
GO

-- V6: AI usage stats
CREATE OR ALTER VIEW vw_ai_usage_stats AS
SELECT
    CAST(created_at AS DATE) AS usage_date, action_type,
    COUNT(*) AS total_calls,
    SUM(CASE WHEN is_success=1 THEN 1 ELSE 0 END) AS success_count,
    SUM(ISNULL(total_tokens, 0)) AS total_tokens_used,
    COUNT(DISTINCT user_id) AS unique_users
FROM ai_logs
GROUP BY CAST(created_at AS DATE), action_type;
GO

-- V7: Cheating overview
CREATE OR ALTER VIEW vw_cheating_overview AS
SELECT
    cl.id, u.full_name AS student_name, u.username,
    e.title AS exam_title, ea.score,
    cl.risk_score, cl.risk_level, cl.total_events, cl.review_action,
    cl.created_at, reviewer.full_name AS reviewed_by_name
FROM cheating_logs cl
JOIN users u ON u.id = cl.user_id
JOIN exam_attempts ea ON ea.id = cl.attempt_id
JOIN exams e ON e.id = ea.exam_id
LEFT JOIN users reviewer ON reviewer.id = cl.reviewed_by;
GO

-- ============================================================
-- TRIGGERS
-- ============================================================

-- T1: Cập nhật total_questions khi INSERT exam_questions
CREATE OR ALTER TRIGGER trg_eq_after_insert ON exam_questions
AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    UPDATE exams SET total_questions = (
        SELECT COUNT(*) FROM exam_questions WHERE exam_id = i.exam_id
    ) FROM exams e INNER JOIN inserted i ON e.id = i.exam_id;
END;
GO

-- T2: Cập nhật total_questions khi DELETE exam_questions
CREATE OR ALTER TRIGGER trg_eq_after_delete ON exam_questions
AFTER DELETE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE exams SET total_questions = (
        SELECT COUNT(*) FROM exam_questions WHERE exam_id = d.exam_id
    ) FROM exams e INNER JOIN deleted d ON e.id = d.exam_id;
END;
GO

-- T3: Cập nhật question stats
CREATE OR ALTER TRIGGER trg_answer_after_insert ON attempt_answers
AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    UPDATE questions SET
        usage_count = (SELECT COUNT(*) FROM attempt_answers WHERE question_id = i.question_id AND is_correct IS NOT NULL),
        correct_rate = (
            SELECT ROUND(CAST(SUM(CASE WHEN is_correct=1 THEN 1 ELSE 0 END) AS FLOAT)*100.0/NULLIF(COUNT(*),0), 2)
            FROM attempt_answers WHERE question_id = i.question_id AND is_correct IS NOT NULL
        )
    FROM questions q INNER JOIN inserted i ON q.id = i.question_id
    WHERE i.is_correct IS NOT NULL;
END;
GO

-- T4: Chat message count
CREATE OR ALTER TRIGGER trg_chat_msg_insert ON chat_messages
AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    UPDATE chat_sessions SET
        message_count = (SELECT COUNT(*) FROM chat_messages WHERE session_id = i.session_id),
        total_tokens = (SELECT ISNULL(SUM(ISNULL(tokens_used, 0)), 0) FROM chat_messages WHERE session_id = i.session_id),
        updated_at = GETDATE()
    FROM chat_sessions cs INNER JOIN inserted i ON cs.id = i.session_id;
END;
GO

-- T5: Cheating events → update risk
CREATE OR ALTER TRIGGER trg_ce_after_insert ON cheating_events
AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @log_id INT = (SELECT TOP 1 cheating_log_id FROM inserted);
    DECLARE @total_weight INT;

    SELECT @total_weight = SUM(weight) FROM cheating_events WHERE cheating_log_id = @log_id;

    UPDATE cheating_logs SET
        total_events = (SELECT COUNT(*) FROM cheating_events WHERE cheating_log_id = @log_id),
        risk_score = CASE WHEN @total_weight > 100 THEN 100 ELSE @total_weight END,
        risk_level = CASE
            WHEN @total_weight >= 20 THEN 'critical'
            WHEN @total_weight >= 15 THEN 'high'
            WHEN @total_weight >= 8 THEN 'medium'
            WHEN @total_weight >= 3 THEN 'low'
            ELSE 'clean' END
    WHERE id = @log_id;
END;
GO

-- T6: User settings tự động tạo khi có user mới
CREATE OR ALTER TRIGGER trg_user_after_insert ON users
AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO user_settings (user_id)
    SELECT id FROM inserted;
END;
GO

-- T7: AI usage count
CREATE OR ALTER TRIGGER trg_ai_after_insert ON ai_logs
AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    UPDATE users SET total_ai_usage = total_ai_usage + 1
    FROM users u INNER JOIN inserted i ON u.id = i.user_id;
END;
GO

-- T8: Question report count
CREATE OR ALTER TRIGGER trg_qr_after_insert ON question_reports
AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    UPDATE questions SET report_count = (
        SELECT COUNT(*) FROM question_reports WHERE question_id = i.question_id
    ) FROM questions q INNER JOIN inserted i ON q.id = i.question_id;
END;
GO

-- T9: Study group member count
CREATE OR ALTER TRIGGER trg_sgm_after_insert ON study_group_members
AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    UPDATE study_groups SET current_members = (
        SELECT COUNT(*) FROM study_group_members WHERE group_id = i.group_id
    ) FROM study_groups sg INNER JOIN inserted i ON sg.id = i.group_id;
END;
GO

CREATE OR ALTER TRIGGER trg_sgm_after_delete ON study_group_members
AFTER DELETE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE study_groups SET current_members = (
        SELECT COUNT(*) FROM study_group_members WHERE group_id = d.group_id
    ) FROM study_groups sg INNER JOIN deleted d ON sg.id = d.group_id;
END;
GO

-- ============================================================
-- STORED PROCEDURES
-- ============================================================

-- SP1: Dashboard overview
CREATE OR ALTER PROCEDURE sp_get_dashboard_stats
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        (SELECT COUNT(*) FROM users WHERE is_active=1) AS total_users,
        (SELECT COUNT(*) FROM users WHERE role='student' AND is_active=1) AS total_students,
        (SELECT COUNT(*) FROM users WHERE role='teacher' AND is_active=1) AS total_teachers,
        (SELECT COUNT(*) FROM topics WHERE is_deleted=0) AS total_topics,
        (SELECT COUNT(*) FROM questions WHERE is_deleted=0) AS total_questions,
        (SELECT COUNT(*) FROM questions WHERE is_ai_generated=1 AND is_deleted=0) AS ai_questions,
        (SELECT COUNT(*) FROM exams WHERE is_deleted=0) AS total_exams,
        (SELECT COUNT(*) FROM exam_attempts WHERE status='completed') AS total_attempts,
        (SELECT ROUND(AVG(CAST(score AS FLOAT)),2) FROM exam_attempts WHERE status='completed') AS avg_score,
        (SELECT COUNT(*) FROM ai_logs) AS total_ai_calls,
        (SELECT COUNT(*) FROM cheating_logs WHERE risk_level IN ('high','critical')) AS high_risk_attempts;
END;
GO

-- SP2: Chi tiết lượt thi
CREATE OR ALTER PROCEDURE sp_get_attempt_detail @attempt_id INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT ea.*, e.title AS exam_title, e.passing_score, e.duration_minutes,
           t.name AS topic_name, u.full_name AS student_name
    FROM exam_attempts ea
    JOIN exams e ON e.id = ea.exam_id
    JOIN topics t ON t.id = e.topic_id
    JOIN users u ON u.id = ea.user_id
    WHERE ea.id = @attempt_id;

    SELECT aa.*, q.question_text, q.question_type, q.difficulty, q.explanation
    FROM attempt_answers aa
    JOIN questions q ON q.id = aa.question_id
    WHERE aa.attempt_id = @attempt_id
    ORDER BY aa.question_order;
END;
GO

-- SP3: Thống kê kỳ thi đầy đủ
CREATE OR ALTER PROCEDURE sp_get_exam_full_stats @exam_id INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM vw_exam_stats WHERE exam_id = @exam_id;

    SELECT qa.* FROM vw_question_analysis qa
    JOIN exam_questions eq ON eq.question_id = qa.question_id
    WHERE eq.exam_id = @exam_id ORDER BY qa.correct_rate ASC;

    -- Phân bổ điểm
    SELECT
        CASE
            WHEN score<1 THEN '0-1' WHEN score<2 THEN '1-2' WHEN score<3 THEN '2-3'
            WHEN score<4 THEN '3-4' WHEN score<5 THEN '4-5' WHEN score<6 THEN '5-6'
            WHEN score<7 THEN '6-7' WHEN score<8 THEN '7-8' WHEN score<9 THEN '8-9'
            ELSE '9-10' END AS score_range,
        COUNT(*) AS student_count
    FROM exam_attempts WHERE exam_id = @exam_id AND status='completed'
    GROUP BY CASE WHEN score<1 THEN '0-1' WHEN score<2 THEN '1-2' WHEN score<3 THEN '2-3'
                  WHEN score<4 THEN '3-4' WHEN score<5 THEN '4-5' WHEN score<6 THEN '5-6'
                  WHEN score<7 THEN '6-7' WHEN score<8 THEN '7-8' WHEN score<9 THEN '8-9'
                  ELSE '9-10' END;

    -- Top 10
    SELECT TOP 10 u.full_name, u.username, ea.score, ea.time_taken_seconds, ea.correct_count
    FROM exam_attempts ea JOIN users u ON u.id = ea.user_id
    WHERE ea.exam_id = @exam_id AND ea.status='completed'
    ORDER BY ea.score DESC, ea.time_taken_seconds ASC;
END;
GO

-- SP4: Dữ liệu cho AI dự đoán
CREATE OR ALTER PROCEDURE sp_get_prediction_data @user_id INT, @topic_id INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP 10 ea.score, ea.correct_count, ea.total_questions, ea.time_taken_seconds, e.title
    FROM exam_attempts ea
    JOIN exams e ON e.id = ea.exam_id
    WHERE ea.user_id = @user_id AND e.topic_id = @topic_id AND ea.status='completed'
    ORDER BY ea.completed_at DESC;

    SELECT q.difficulty, COUNT(aa.id) AS total,
           SUM(CASE WHEN aa.is_correct=1 THEN 1 ELSE 0 END) AS correct
    FROM attempt_answers aa
    JOIN questions q ON q.id = aa.question_id
    JOIN exam_attempts ea ON ea.id = aa.attempt_id
    JOIN exams e ON e.id = ea.exam_id
    WHERE ea.user_id = @user_id AND e.topic_id = @topic_id AND aa.is_correct IS NOT NULL
    GROUP BY q.difficulty;
END;
GO

-- SP5: Cập nhật user level
CREATE OR ALTER PROCEDURE sp_update_user_level @user_id INT
AS
BEGIN
    DECLARE @xp INT, @new_level INT = 1;
    SELECT @xp = xp_points FROM users WHERE id = @user_id;
    SET @new_level = CASE
        WHEN @xp >= 20000 THEN 8 WHEN @xp >= 10000 THEN 7
        WHEN @xp >= 5000 THEN 6  WHEN @xp >= 2000 THEN 5
        WHEN @xp >= 1000 THEN 4  WHEN @xp >= 500 THEN 3
        WHEN @xp >= 200 THEN 2   ELSE 1 END;
    UPDATE users SET level = @new_level WHERE id = @user_id;
END;
GO

-- SP6: Cộng XP
CREATE OR ALTER PROCEDURE sp_add_xp
    @user_id INT, @amount INT, @reason NVARCHAR(30),
    @related_id INT = NULL, @related_type NVARCHAR(50) = NULL, @desc NVARCHAR(300) = NULL
AS
BEGIN
    DECLARE @balance INT;
    UPDATE users SET xp_points = xp_points + @amount WHERE id = @user_id;
    SELECT @balance = xp_points FROM users WHERE id = @user_id;
    INSERT INTO xp_transactions_tbl (user_id, amount, reason, related_id, related_type, description, balance_after)
    VALUES (@user_id, @amount, @reason, @related_id, @related_type, @desc, @balance);
    EXEC sp_update_user_level @user_id;
END;
GO

-- SP7: Cập nhật streak
CREATE OR ALTER PROCEDURE sp_update_streak @user_id INT
AS
BEGIN
    DECLARE @last_active DATE, @today DATE = CAST(GETDATE() AS DATE);
    SELECT @last_active = last_active_date FROM users WHERE id = @user_id;
    IF @last_active IS NULL OR @last_active < DATEADD(DAY, -1, @today)
        UPDATE users SET streak_days = 1, last_active_date = @today WHERE id = @user_id;
    ELSE IF @last_active = DATEADD(DAY, -1, @today)
        UPDATE users SET streak_days = streak_days + 1,
            longest_streak = CASE WHEN streak_days+1 > longest_streak THEN streak_days+1 ELSE longest_streak END,
            last_active_date = @today WHERE id = @user_id;
    ELSE
        UPDATE users SET last_active_date = @today WHERE id = @user_id;
END;
GO

-- ============================================================

-- ============================================================
-- DAILY QUESTS HARDENING (ANTI-DUPLICATE)
-- ============================================================
-- Dọn dữ liệu duplicate cũ theo (user, date, type, topic)
;WITH dq_ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, quest_date, quest_type, ISNULL(target_topic_id, -1)
             ORDER BY id
           ) AS rn
    FROM daily_quests
)
DELETE FROM daily_quests
WHERE id IN (SELECT id FROM dq_ranked WHERE rn > 1);
GO

-- Unique index chống tạo trùng quest trong cùng ngày
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'ux_daily_quests_user_date_type_topic'
      AND object_id = OBJECT_ID('dbo.daily_quests')
)
BEGIN
    CREATE UNIQUE INDEX ux_daily_quests_user_date_type_topic
    ON daily_quests(user_id, quest_date, quest_type, target_topic_id);
END
GO

-- SEED DATA
-- ============================================================

-- Badges (20 badges)
INSERT INTO badges (code, name, description, icon, category, rarity, condition_type, condition_value, xp_reward, sort_order) VALUES
('first_exam',  N'Bước Đầu Tiên',   N'Hoàn thành bài thi đầu tiên',         N'⭐', 'achievement','common',   'exam_count',    1,   50,  1),
('exam_5',      N'Người Siêng Năng', N'Hoàn thành 5 bài thi',                N'📝', 'achievement','common',   'exam_count',    5,   80,  2),
('exam_10',     N'Chăm Chỉ',        N'Hoàn thành 10 bài thi',               N'📖', 'achievement','uncommon', 'exam_count',    10,  100, 3),
('exam_25',     N'Kiên Nhẫn',       N'Hoàn thành 25 bài thi',               N'🎯', 'achievement','rare',     'exam_count',    25,  250, 4),
('exam_50',     N'Học Giả',         N'Hoàn thành 50 bài thi',               N'📚', 'achievement','epic',     'exam_count',    50,  500, 5),
('exam_100',    N'Bách Chiến',      N'Hoàn thành 100 bài thi',              N'🏅', 'achievement','legendary','exam_count',    100, 1000,6),
('perfect',     N'Hoàn Hảo',        N'Đạt điểm tuyệt đối',                 N'💎', 'achievement','rare',     'perfect_score', 1,   200, 7),
('perfect_5',   N'Siêu Sao',        N'Đạt 5 lần điểm tuyệt đối',           N'🌟', 'achievement','epic',     'perfect_score', 5,   500, 8),
('perfect_10',  N'Bậc Thầy',        N'Đạt 10 lần điểm tuyệt đối',          N'🧠', 'achievement','legendary','perfect_score', 10,  1000,9),
('speed_demon', N'Tia Chớp',        N'Hoàn thành dưới 50% thời gian',       N'⚡', 'achievement','rare',     'speed_finish',  1,   150, 10),
('streak_3',    N'Khởi Động',       N'Duy trì streak 3 ngày',               N'🔥', 'streak',     'common',   'streak_days',   3,   50,  11),
('streak_7',    N'Kiên Trì',        N'Duy trì streak 7 ngày',               N'🔥', 'streak',     'uncommon', 'streak_days',   7,   200, 12),
('streak_14',   N'Không Nghỉ',      N'Duy trì streak 14 ngày',              N'💪', 'streak',     'rare',     'streak_days',   14,  400, 13),
('streak_30',   N'Bất Khuất',       N'Duy trì streak 30 ngày',              N'🦾', 'streak',     'epic',     'streak_days',   30,  1000,14),
('ai_explorer', N'Thám Hiểm AI',    N'Sử dụng AI Tutor 10 lần',            N'🤖', 'ai',         'uncommon', 'ai_usage',      10,  150, 15),
('ai_master',   N'Chuyên Gia AI',   N'Sử dụng AI 50 lần',                  N'🧪', 'ai',         'rare',     'ai_usage',      50,  500, 16),
('social',      N'Hòa Đồng',       N'Tham gia nhóm học tập',               N'🤝', 'social',     'common',   'group_join',    1,   100, 17),
('champion',    N'Nhà Vô Địch',    N'Đạt Top 1 bảng xếp hạng',            N'🏆', 'special',    'legendary','leaderboard_1', 1,   500, 18),
('comeback',    N'Trở Lại Mạnh',   N'Cải thiện điểm 50%',                  N'🔄', 'achievement','rare',     'score_improve', 50,  300, 19),
('night_owl',   N'Cú Đêm',         N'Học sau 12 giờ đêm',                  N'🦉', 'special',    'uncommon', 'night_study',   1,   50,  20);
GO

-- Admin user (password = admin123)
-- Teacher (password = admin123)
-- Students (password = user123)
SET IDENTITY_INSERT users ON;
INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES
(1, 'admin', 'admin@quizgen.vn', '$2b$10$jo8h8vSi4fcafzkb1rl0GucHePRHbh12L0NYgvz.SZTQC4oYhqDEu', N'Quản trị viên', 'admin');
INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES
(2, 'teacher01', 'teacher@quizgen.vn', '$2b$10$jo8h8vSi4fcafzkb1rl0GucHePRHbh12L0NYgvz.SZTQC4oYhqDEu', N'Nguyễn Văn Thầy', 'teacher');
INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES
(3, 'student01', 'sv01@quizgen.vn', '$2b$10$OeNw1G67iLs/C.JoOVdnqOtcQgdeMFhKU.rzeEoT9vbbvLEVEO4Wy', N'Trần Văn An', 'student');
INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES
(4, 'student02', 'sv02@quizgen.vn', '$2b$10$OeNw1G67iLs/C.JoOVdnqOtcQgdeMFhKU.rzeEoT9vbbvLEVEO4Wy', N'Lê Thị Bình', 'student');
INSERT INTO users (id, username, email, password_hash, full_name, role) VALUES
(5, 'student03', 'sv03@quizgen.vn', '$2b$10$OeNw1G67iLs/C.JoOVdnqOtcQgdeMFhKU.rzeEoT9vbbvLEVEO4Wy', N'Phạm Minh Châu', 'student');
SET IDENTITY_INSERT users OFF;
GO

-- Sample topics
SET IDENTITY_INSERT topics ON;
INSERT INTO topics (id, name, slug, description, icon, color, created_by) VALUES
(1, N'JavaScript Cơ bản', 'javascript-co-ban', N'Biến, hàm, vòng lặp, mảng, object', N'🟨', '#F7DF1E', 2),
(2, N'React.js', 'react-js', N'Components, hooks, state, props', N'⚛️', '#61DAFB', 2),
(3, N'Node.js & Express', 'nodejs-express', N'REST API, middleware, authentication', N'🟩', '#339933', 2),
(4, N'Cơ sở dữ liệu SQL', 'co-so-du-lieu-sql', N'SQL, thiết kế database, query', N'🗄️', '#4479A1', 2),
(5, N'Git & GitHub', 'git-github', N'Branch, merge, pull request', N'🐙', '#181717', 2);
SET IDENTITY_INSERT topics OFF;
GO

-- Sample tags
INSERT INTO tags (name, slug) VALUES
(N'biến','bien'), (N'hàm','ham'), (N'vòng lặp','vong-lap'), (N'mảng','mang'),
('object','object'), ('ES6','es6'), ('async','async'), ('DOM','dom'),
('hooks','hooks'), ('state','state'), ('props','props'), ('routing','routing'),
('REST API','rest-api'), ('middleware','middleware'), ('JWT','jwt'),
('SELECT','select-sql'), ('JOIN','join-sql'), ('INDEX','index-sql'),
('branch','branch'), ('merge','merge');
GO

-- Sample questions
SET IDENTITY_INSERT questions ON;
INSERT INTO questions (id, topic_id, created_by, question_text, question_type, difficulty, explanation, bloom_level) VALUES
(1, 1, 2, N'Từ khóa nào dùng để khai báo biến có block scope trong JavaScript?', 'single_choice', 'easy',
 N'let và const có block scope, var có function scope.', 'remember'),
(2, 1, 2, N'Kết quả của typeof null trong JavaScript là gì?', 'single_choice', 'medium',
 N'Đây là bug lịch sử trong JS. typeof null trả về "object".', 'understand'),
(3, 1, 2, N'Phương thức nào KHÔNG thay đổi mảng gốc?', 'single_choice', 'medium',
 N'map() trả về mảng mới, push/pop/splice thay đổi mảng gốc.', 'analyze'),
(4, 1, 2, N'Chọn tất cả kiểu dữ liệu primitive trong JavaScript:', 'multiple_choice', 'easy',
 N'JS có 7 primitive types: string, number, bigint, boolean, undefined, symbol, null.', 'remember'),
(5, 1, 2, N'Viết kết quả của biểu thức: 2 + "2"', 'fill_in', 'easy',
 N'Type coercion: 2 + "2" = "22"', 'apply');
SET IDENTITY_INSERT questions OFF;
GO

-- Options
INSERT INTO question_options (question_id, option_label, option_text, is_correct, sort_order) VALUES
(1, 'A', 'var', 0, 1), (1, 'B', 'let', 1, 2), (1, 'C', 'const', 0, 3), (1, 'D', 'function', 0, 4),
(2, 'A', N'"null"', 0, 1), (2, 'B', N'"undefined"', 0, 2), (2, 'C', N'"object"', 1, 3), (2, 'D', N'"number"', 0, 4),
(3, 'A', 'push()', 0, 1), (3, 'B', 'map()', 1, 2), (3, 'C', 'splice()', 0, 3), (3, 'D', 'pop()', 0, 4),
(4, 'A', 'string', 1, 1), (4, 'B', 'number', 1, 2), (4, 'C', 'array', 0, 3),
(4, 'D', 'boolean', 1, 4), (4, 'E', 'object', 0, 5), (4, 'F', 'null', 1, 6);
GO

-- Fill answers
INSERT INTO question_fill_answers (question_id, accepted_answer, is_primary, match_mode) VALUES
(5, '22', 1, 'exact'), (5, '"22"', 0, 'exact');
GO

-- Question tags
INSERT INTO question_tags (question_id, tag_id) VALUES
(1, 1), (1, 6), (2, 1), (3, 4), (4, 1), (5, 1), (5, 6);
GO

-- Sample exam
SET IDENTITY_INSERT exams ON;
INSERT INTO exams (id, title, description, topic_id, created_by, duration_minutes, passing_score,
                   shuffle_questions, shuffle_options, show_result, show_explanation,
                   allow_ai_explain, enable_anti_cheat, status) VALUES
(1, N'Kiểm tra JavaScript Cơ bản - Lần 1',
 N'Bài kiểm tra kiến thức nền tảng JavaScript gồm 5 câu hỏi.',
 1, 2, 15, 5.00, 1, 1, 1, 1, 1, 1, 'active');
SET IDENTITY_INSERT exams OFF;
GO

-- Link questions to exam
INSERT INTO exam_questions (exam_id, question_id, sort_order, points) VALUES
(1, 1, 1, 2.00), (1, 2, 2, 2.00), (1, 3, 3, 2.00), (1, 4, 4, 2.00), (1, 5, 5, 2.00);
GO

PRINT N'✅ Views, Triggers, Stored Procedures, Seed Data - TẤT CẢ đã tạo thành công!';
PRINT N'📊 35 Tables | 7 Views | 10 Triggers | 7 Stored Procedures | 20 Badges | 5 Users | 5 Topics | 5 Questions | 1 Exam';
GO
