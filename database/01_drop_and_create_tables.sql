-- ============================================================
-- QUIZ GENERATOR V2 - SQL SERVER (T-SQL)
-- PART 1: CREATE DATABASE + ALL TABLES
-- ============================================================

-- Tạo database
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'quiz_generator')
    CREATE DATABASE quiz_generator;
GO

USE quiz_generator;
GO

-- ============================================================
-- DROP ALL TABLES (đúng thứ tự dependency)
-- ============================================================
IF OBJECT_ID('dbo.xp_transactions_tbl', 'U') IS NOT NULL DROP TABLE dbo.xp_transactions_tbl;
IF OBJECT_ID('dbo.daily_quests', 'U') IS NOT NULL DROP TABLE dbo.daily_quests;
IF OBJECT_ID('dbo.question_reports', 'U') IS NOT NULL DROP TABLE dbo.question_reports;
IF OBJECT_ID('dbo.login_history', 'U') IS NOT NULL DROP TABLE dbo.login_history;
IF OBJECT_ID('dbo.password_reset_tokens', 'U') IS NOT NULL DROP TABLE dbo.password_reset_tokens;
IF OBJECT_ID('dbo.user_settings', 'U') IS NOT NULL DROP TABLE dbo.user_settings;
IF OBJECT_ID('dbo.study_plan_items', 'U') IS NOT NULL DROP TABLE dbo.study_plan_items;
IF OBJECT_ID('dbo.study_plans', 'U') IS NOT NULL DROP TABLE dbo.study_plans;
IF OBJECT_ID('dbo.study_group_members', 'U') IS NOT NULL DROP TABLE dbo.study_group_members;
IF OBJECT_ID('dbo.study_groups', 'U') IS NOT NULL DROP TABLE dbo.study_groups;
IF OBJECT_ID('dbo.user_badges', 'U') IS NOT NULL DROP TABLE dbo.user_badges;
IF OBJECT_ID('dbo.badges', 'U') IS NOT NULL DROP TABLE dbo.badges;
IF OBJECT_ID('dbo.cheating_events', 'U') IS NOT NULL DROP TABLE dbo.cheating_events;
IF OBJECT_ID('dbo.cheating_logs', 'U') IS NOT NULL DROP TABLE dbo.cheating_logs;
IF OBJECT_ID('dbo.chat_messages', 'U') IS NOT NULL DROP TABLE dbo.chat_messages;
IF OBJECT_ID('dbo.chat_sessions', 'U') IS NOT NULL DROP TABLE dbo.chat_sessions;
IF OBJECT_ID('dbo.learning_path_steps', 'U') IS NOT NULL DROP TABLE dbo.learning_path_steps;
IF OBJECT_ID('dbo.learning_paths', 'U') IS NOT NULL DROP TABLE dbo.learning_paths;
IF OBJECT_ID('dbo.prediction_logs', 'U') IS NOT NULL DROP TABLE dbo.prediction_logs;
IF OBJECT_ID('dbo.ai_evaluations', 'U') IS NOT NULL DROP TABLE dbo.ai_evaluations;
IF OBJECT_ID('dbo.ai_logs', 'U') IS NOT NULL DROP TABLE dbo.ai_logs;
IF OBJECT_ID('dbo.document_uploads', 'U') IS NOT NULL DROP TABLE dbo.document_uploads;
IF OBJECT_ID('dbo.attempt_answers', 'U') IS NOT NULL DROP TABLE dbo.attempt_answers;
IF OBJECT_ID('dbo.exam_attempts', 'U') IS NOT NULL DROP TABLE dbo.exam_attempts;
IF OBJECT_ID('dbo.exam_questions', 'U') IS NOT NULL DROP TABLE dbo.exam_questions;
IF OBJECT_ID('dbo.exams', 'U') IS NOT NULL DROP TABLE dbo.exams;
IF OBJECT_ID('dbo.question_tags', 'U') IS NOT NULL DROP TABLE dbo.question_tags;
IF OBJECT_ID('dbo.question_fill_answers', 'U') IS NOT NULL DROP TABLE dbo.question_fill_answers;
IF OBJECT_ID('dbo.question_options', 'U') IS NOT NULL DROP TABLE dbo.question_options;
IF OBJECT_ID('dbo.questions', 'U') IS NOT NULL DROP TABLE dbo.questions;
IF OBJECT_ID('dbo.topic_tags', 'U') IS NOT NULL DROP TABLE dbo.topic_tags;
IF OBJECT_ID('dbo.tags', 'U') IS NOT NULL DROP TABLE dbo.tags;
IF OBJECT_ID('dbo.topics', 'U') IS NOT NULL DROP TABLE dbo.topics;
IF OBJECT_ID('dbo.notifications', 'U') IS NOT NULL DROP TABLE dbo.notifications;
IF OBJECT_ID('dbo.users', 'U') IS NOT NULL DROP TABLE dbo.users;
GO

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE users (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    username          NVARCHAR(50)  NOT NULL UNIQUE,
    email             NVARCHAR(100) NOT NULL UNIQUE,
    password_hash     NVARCHAR(255) NOT NULL,
    full_name         NVARCHAR(100) NOT NULL,
    phone             NVARCHAR(20)  NULL,
    avatar_url        NVARCHAR(500) NULL,
    role              NVARCHAR(20)  NOT NULL DEFAULT 'student'
        CHECK (role IN ('admin','teacher','student')),
    xp_points         INT           NOT NULL DEFAULT 0,
    level             INT           NOT NULL DEFAULT 1,
    streak_days       INT           NOT NULL DEFAULT 0,
    longest_streak    INT           NOT NULL DEFAULT 0,
    last_active_date  DATE          NULL,
    total_exams_taken INT           NOT NULL DEFAULT 0,
    total_ai_usage    INT           NOT NULL DEFAULT 0,
    is_active         BIT           NOT NULL DEFAULT 1,
    email_verified    BIT           NOT NULL DEFAULT 0,
    created_at        DATETIME2     NOT NULL DEFAULT GETDATE(),
    updated_at        DATETIME2     NOT NULL DEFAULT GETDATE()
);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_xp ON users(xp_points DESC);
GO

-- ============================================================
-- 2. USER_SETTINGS
-- ============================================================
CREATE TABLE user_settings (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    user_id         INT NOT NULL UNIQUE,
    theme           NVARCHAR(10)  NOT NULL DEFAULT 'system'
        CHECK (theme IN ('light','dark','system')),
    font_size       NVARCHAR(10)  NOT NULL DEFAULT 'medium'
        CHECK (font_size IN ('small','medium','large')),
    language        NVARCHAR(5)   NOT NULL DEFAULT 'vi'
        CHECK (language IN ('vi','en')),
    enable_tts      BIT NOT NULL DEFAULT 0,
    enable_notifications BIT NOT NULL DEFAULT 1,
    enable_sound    BIT NOT NULL DEFAULT 1,
    high_contrast   BIT NOT NULL DEFAULT 0,
    ai_tutor_enabled BIT NOT NULL DEFAULT 1,
    updated_at      DATETIME2 NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
GO

-- ============================================================
-- 3. PASSWORD_RESET_TOKENS
-- ============================================================
CREATE TABLE password_reset_tokens (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    user_id     INT           NOT NULL,
    token       NVARCHAR(255) NOT NULL UNIQUE,
    expires_at  DATETIME2     NOT NULL,
    is_used     BIT           NOT NULL DEFAULT 0,
    created_at  DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
GO

-- ============================================================
-- 4. LOGIN_HISTORY
-- ============================================================
CREATE TABLE login_history (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    user_id      INT           NOT NULL,
    ip_address   NVARCHAR(45)  NULL,
    user_agent   NVARCHAR(500) NULL,
    login_method NVARCHAR(20)  NOT NULL DEFAULT 'password'
        CHECK (login_method IN ('password','google','token')),
    is_success   BIT           NOT NULL DEFAULT 1,
    created_at   DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_lh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_lh_user ON login_history(user_id);
GO

-- ============================================================
-- 5. TOPICS
-- ============================================================
CREATE TABLE topics (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    name           NVARCHAR(200) NOT NULL,
    slug           NVARCHAR(200) NOT NULL UNIQUE,
    description    NVARCHAR(MAX) NULL,
    icon           NVARCHAR(50)  DEFAULT N'📚',
    color          NVARCHAR(7)   DEFAULT '#4F46E5',
    parent_id      INT           NULL,
    created_by     INT           NOT NULL,
    question_count INT           NOT NULL DEFAULT 0,
    exam_count     INT           NOT NULL DEFAULT 0,
    is_deleted     BIT           NOT NULL DEFAULT 0,
    created_at     DATETIME2     NOT NULL DEFAULT GETDATE(),
    updated_at     DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_topics_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_topics_parent FOREIGN KEY (parent_id) REFERENCES topics(id)
);
CREATE INDEX idx_topics_slug ON topics(slug);
GO

-- ============================================================
-- 6. TAGS
-- ============================================================
CREATE TABLE tags (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    name        NVARCHAR(100) NOT NULL UNIQUE,
    slug        NVARCHAR(100) NOT NULL UNIQUE,
    usage_count INT           NOT NULL DEFAULT 0,
    created_at  DATETIME2     NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================
-- 7. TOPIC_TAGS
-- ============================================================
CREATE TABLE topic_tags (
    topic_id INT NOT NULL,
    tag_id   INT NOT NULL,
    PRIMARY KEY (topic_id, tag_id),
    CONSTRAINT fk_tt_topic FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
    CONSTRAINT fk_tt_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
GO

-- ============================================================
-- 8. QUESTIONS
-- ============================================================
CREATE TABLE questions (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    topic_id         INT           NOT NULL,
    created_by       INT           NOT NULL,
    question_text    NVARCHAR(MAX) NOT NULL,
    question_image   NVARCHAR(500) NULL,
    question_type    NVARCHAR(20)  NOT NULL DEFAULT 'single_choice'
        CHECK (question_type IN ('single_choice','multiple_choice','fill_in')),
    difficulty       NVARCHAR(10)  NOT NULL DEFAULT 'medium'
        CHECK (difficulty IN ('easy','medium','hard')),
    explanation      NVARCHAR(MAX) NULL,
    bloom_level      NVARCHAR(20)  NULL
        CHECK (bloom_level IS NULL OR bloom_level IN ('remember','understand','apply','analyze','evaluate','create')),
    estimated_time   INT           DEFAULT 30,
    points           DECIMAL(4,2)  NOT NULL DEFAULT 1.00,
    is_ai_generated  BIT           NOT NULL DEFAULT 0,
    ai_model         NVARCHAR(50)  NULL,
    quality_score    DECIMAL(3,1)  NULL,
    quality_feedback NVARCHAR(MAX) NULL,
    usage_count      INT           NOT NULL DEFAULT 0,
    correct_rate     DECIMAL(5,2)  NULL,
    report_count     INT           NOT NULL DEFAULT 0,
    is_approved      BIT           NOT NULL DEFAULT 1,
    is_deleted       BIT           NOT NULL DEFAULT 0,
    created_at       DATETIME2     NOT NULL DEFAULT GETDATE(),
    updated_at       DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_q_topic FOREIGN KEY (topic_id) REFERENCES topics(id),
    CONSTRAINT fk_q_creator FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX idx_q_topic ON questions(topic_id);
CREATE INDEX idx_q_type ON questions(question_type);
CREATE INDEX idx_q_difficulty ON questions(difficulty);
CREATE INDEX idx_q_ai ON questions(is_ai_generated);
GO

-- ============================================================
-- 9. QUESTION_OPTIONS
-- ============================================================
CREATE TABLE question_options (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    question_id  INT           NOT NULL,
    option_label NCHAR(1)      NOT NULL,
    option_text  NVARCHAR(MAX) NOT NULL,
    option_image NVARCHAR(500) NULL,
    is_correct   BIT           NOT NULL DEFAULT 0,
    sort_order   INT           NOT NULL DEFAULT 0,
    CONSTRAINT fk_opt_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    CONSTRAINT uk_q_label UNIQUE (question_id, option_label)
);
CREATE INDEX idx_opt_q ON question_options(question_id);
GO

-- ============================================================
-- 10. QUESTION_FILL_ANSWERS
-- ============================================================
CREATE TABLE question_fill_answers (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    question_id     INT           NOT NULL,
    accepted_answer NVARCHAR(500) NOT NULL,
    is_primary      BIT           NOT NULL DEFAULT 0,
    match_mode      NVARCHAR(10)  NOT NULL DEFAULT 'exact'
        CHECK (match_mode IN ('exact','contains','regex')),
    CONSTRAINT fk_fa_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);
GO

-- ============================================================
-- 11. QUESTION_TAGS
-- ============================================================
CREATE TABLE question_tags (
    question_id INT NOT NULL,
    tag_id      INT NOT NULL,
    PRIMARY KEY (question_id, tag_id),
    CONSTRAINT fk_qt_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    CONSTRAINT fk_qt_t FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
GO

-- ============================================================
-- 12. QUESTION_REPORTS
-- ============================================================
CREATE TABLE question_reports (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    question_id INT           NOT NULL,
    reported_by INT           NOT NULL,
    reason      NVARCHAR(30)  NOT NULL
        CHECK (reason IN ('wrong_answer','ambiguous','duplicate','inappropriate','other')),
    detail      NVARCHAR(MAX) NULL,
    status      NVARCHAR(20)  NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','accepted','rejected')),
    reviewed_by INT           NULL,
    review_note NVARCHAR(MAX) NULL,
    created_at  DATETIME2     NOT NULL DEFAULT GETDATE(),
    reviewed_at DATETIME2     NULL,
    CONSTRAINT fk_qr_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    CONSTRAINT fk_qr_user FOREIGN KEY (reported_by) REFERENCES users(id),
    CONSTRAINT fk_qr_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)
);
GO

-- ============================================================
-- 13. EXAMS
-- ============================================================
CREATE TABLE exams (
    id                 INT IDENTITY(1,1) PRIMARY KEY,
    title              NVARCHAR(300) NOT NULL,
    description        NVARCHAR(MAX) NULL,
    topic_id           INT           NOT NULL,
    created_by         INT           NOT NULL,
    duration_minutes   INT           NOT NULL DEFAULT 60,
    total_questions    INT           NOT NULL DEFAULT 0,
    max_score          DECIMAL(5,2)  NOT NULL DEFAULT 10.00,
    passing_score      DECIMAL(5,2)  NOT NULL DEFAULT 5.00,
    shuffle_questions  BIT           NOT NULL DEFAULT 1,
    shuffle_options    BIT           NOT NULL DEFAULT 1,
    show_result        BIT           NOT NULL DEFAULT 1,
    show_explanation   BIT           NOT NULL DEFAULT 1,
    allow_ai_explain   BIT           NOT NULL DEFAULT 1,
    is_adaptive        BIT           NOT NULL DEFAULT 0,
    enable_anti_cheat  BIT           NOT NULL DEFAULT 1,
    require_fullscreen BIT           NOT NULL DEFAULT 0,
    max_attempts       INT           NULL,
    access_code        NVARCHAR(20)  NULL,
    status             NVARCHAR(10)  NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','active','closed')),
    start_time         DATETIME2     NULL,
    end_time           DATETIME2     NULL,
    attempt_count      INT           NOT NULL DEFAULT 0,
    avg_score          DECIMAL(5,2)  NULL,
    pass_rate          DECIMAL(5,2)  NULL,
    is_deleted         BIT           NOT NULL DEFAULT 0,
    created_at         DATETIME2     NOT NULL DEFAULT GETDATE(),
    updated_at         DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_e_topic FOREIGN KEY (topic_id) REFERENCES topics(id),
    CONSTRAINT fk_e_creator FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX idx_e_topic ON exams(topic_id);
CREATE INDEX idx_e_status ON exams(status);
GO

-- ============================================================
-- 14. EXAM_QUESTIONS
-- ============================================================
CREATE TABLE exam_questions (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    exam_id     INT          NOT NULL,
    question_id INT          NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    points      DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    CONSTRAINT fk_eq_e FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    CONSTRAINT fk_eq_q FOREIGN KEY (question_id) REFERENCES questions(id),
    CONSTRAINT uk_eq UNIQUE (exam_id, question_id)
);
GO

-- ============================================================
-- 15. EXAM_ATTEMPTS
-- ============================================================
CREATE TABLE exam_attempts (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    exam_id             INT           NOT NULL,
    user_id             INT           NOT NULL,
    shuffle_seed        NVARCHAR(100) NULL,
    score               DECIMAL(5,2)  NULL,
    max_possible_score  DECIMAL(5,2)  NULL,
    total_questions     INT           NOT NULL DEFAULT 0,
    correct_count       INT           NOT NULL DEFAULT 0,
    wrong_count         INT           NOT NULL DEFAULT 0,
    unanswered_count    INT           NOT NULL DEFAULT 0,
    time_taken_seconds  INT           NULL,
    ability_score       DECIMAL(5,3)  NULL,
    is_passed           BIT           NULL,
    xp_earned           INT           NOT NULL DEFAULT 0,
    status              NVARCHAR(20)  NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress','completed','timed_out','abandoned')),
    started_at          DATETIME2     NOT NULL DEFAULT GETDATE(),
    completed_at        DATETIME2     NULL,
    ip_address          NVARCHAR(45)  NULL,
    CONSTRAINT fk_ea_exam FOREIGN KEY (exam_id) REFERENCES exams(id),
    CONSTRAINT fk_ea_user FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_ea_exam ON exam_attempts(exam_id);
CREATE INDEX idx_ea_user ON exam_attempts(user_id);
CREATE INDEX idx_ea_status ON exam_attempts(status);
GO

-- ============================================================
-- 16. ATTEMPT_ANSWERS
-- ============================================================
CREATE TABLE attempt_answers (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    attempt_id          INT           NOT NULL,
    question_id         INT           NOT NULL,
    question_order      INT           NOT NULL,
    selected_options    NVARCHAR(20)  NULL,
    fill_answer         NVARCHAR(500) NULL,
    is_correct          BIT           NULL,
    points_earned       DECIMAL(4,2)  NOT NULL DEFAULT 0.00,
    max_points          DECIMAL(4,2)  NOT NULL DEFAULT 1.00,
    time_spent_seconds  INT           NULL,
    option_order        NVARCHAR(50)  NULL,
    is_flagged          BIT           NOT NULL DEFAULT 0,
    ai_explanation      NVARCHAR(MAX) NULL,
    answered_at         DATETIME2     NULL,
    CONSTRAINT fk_aa_attempt FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE,
    CONSTRAINT fk_aa_q FOREIGN KEY (question_id) REFERENCES questions(id),
    CONSTRAINT uk_aa UNIQUE (attempt_id, question_id)
);
GO

-- ============================================================
-- 17. DOCUMENT_UPLOADS
-- ============================================================
CREATE TABLE document_uploads (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    user_id             INT           NOT NULL,
    topic_id            INT           NULL,
    original_name       NVARCHAR(500) NOT NULL,
    stored_name         NVARCHAR(500) NOT NULL,
    file_path           NVARCHAR(500) NOT NULL,
    file_type           NVARCHAR(10)  NOT NULL
        CHECK (file_type IN ('pdf','docx','txt','image','pptx')),
    file_size           INT           NOT NULL,
    mime_type           NVARCHAR(100) NULL,
    page_count          INT           NULL,
    extracted_text      NVARCHAR(MAX) NULL,
    ai_summary          NVARCHAR(MAX) NULL,
    ai_chapters         NVARCHAR(MAX) NULL,
    questions_generated INT           NOT NULL DEFAULT 0,
    status              NVARCHAR(15)  NOT NULL DEFAULT 'uploading'
        CHECK (status IN ('uploading','processing','ready','error')),
    error_message       NVARCHAR(MAX) NULL,
    created_at          DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_doc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_topic FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
);
GO

-- ============================================================
-- 18. AI_LOGS
-- ============================================================
CREATE TABLE ai_logs (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    user_id           INT           NOT NULL,
    action_type       NVARCHAR(30)  NOT NULL
        CHECK (action_type IN ('generate_questions','generate_from_image','explain_answer',
               'evaluate_exam','learning_path','summarize_doc','quality_check','predict_score',
               'chat','auto_tag','semantic_search','summarize_results','translate',
               'group_students','adaptive_next','daily_quest')),
    related_id        INT           NULL,
    related_type      NVARCHAR(50)  NULL,
    input_summary     NVARCHAR(MAX) NULL,
    output_summary    NVARCHAR(MAX) NULL,
    model_used        NVARCHAR(50)  DEFAULT 'ollama',
    prompt_tokens     INT           NULL,
    completion_tokens INT           NULL,
    total_tokens      INT           NULL,
    response_time_ms  INT           NULL,
    is_success        BIT           NOT NULL DEFAULT 1,
    error_message     NVARCHAR(MAX) NULL,
    cost_estimate     DECIMAL(10,6) NULL,
    created_at        DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_ai_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_ai_action ON ai_logs(action_type);
CREATE INDEX idx_ai_date ON ai_logs(created_at DESC);
GO

-- ============================================================
-- 19. AI_EVALUATIONS
-- ============================================================
CREATE TABLE ai_evaluations (
    id                    INT IDENTITY(1,1) PRIMARY KEY,
    exam_id               INT           NOT NULL,
    requested_by          INT           NOT NULL,
    evaluation_type       NVARCHAR(20)  NOT NULL
        CHECK (evaluation_type IN ('exam_evaluation','quality_summary','trend_analysis')),
    overall_assessment    NVARCHAR(MAX) NOT NULL,
    pass_rate             DECIMAL(5,2)  NULL,
    fail_rate             DECIMAL(5,2)  NULL,
    avg_score             DECIMAL(5,2)  NULL,
    median_score          DECIMAL(5,2)  NULL,
    hardest_questions     NVARCHAR(MAX) NULL,
    easiest_questions     NVARCHAR(MAX) NULL,
    weak_areas            NVARCHAR(MAX) NULL,
    strong_areas          NVARCHAR(MAX) NULL,
    recommendations       NVARCHAR(MAX) NULL,
    top_students          NVARCHAR(MAX) NULL,
    difficulty_assessment NVARCHAR(MAX) NULL,
    raw_ai_response       NVARCHAR(MAX) NULL,
    created_at            DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_eval_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    CONSTRAINT fk_eval_user FOREIGN KEY (requested_by) REFERENCES users(id)
);
GO

-- ============================================================
-- 20. LEARNING_PATHS
-- ============================================================
CREATE TABLE learning_paths (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    user_id             INT           NOT NULL,
    attempt_id          INT           NULL,
    topic_id            INT           NOT NULL,
    overall_assessment  NVARCHAR(MAX) NULL,
    overall_score       DECIMAL(5,2)  NULL,
    weak_areas          NVARCHAR(MAX) NULL,
    strong_areas        NVARCHAR(MAX) NULL,
    estimated_time      NVARCHAR(100) NULL,
    motivational_note   NVARCHAR(MAX) NULL,
    total_steps         INT           NOT NULL DEFAULT 0,
    completed_steps     INT           NOT NULL DEFAULT 0,
    status              NVARCHAR(15)  NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','completed','expired')),
    created_at          DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_lp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_lp_attempt FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id) ON DELETE SET NULL,
    CONSTRAINT fk_lp_topic FOREIGN KEY (topic_id) REFERENCES topics(id)
);
GO

-- ============================================================
-- 21. LEARNING_PATH_STEPS
-- ============================================================
CREATE TABLE learning_path_steps (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    learning_path_id INT           NOT NULL,
    step_order       INT           NOT NULL,
    title            NVARCHAR(300) NOT NULL,
    description      NVARCHAR(MAX) NULL,
    duration         NVARCHAR(100) NULL,
    resources        NVARCHAR(MAX) NULL,
    weak_area        NVARCHAR(200) NULL,
    priority         NVARCHAR(10)  NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low','medium','high')),
    step_type        NVARCHAR(10)  NOT NULL DEFAULT 'learn'
        CHECK (step_type IN ('learn','practice','review','test')),
    is_completed     BIT           NOT NULL DEFAULT 0,
    completed_at     DATETIME2     NULL,
    CONSTRAINT fk_lps_lp FOREIGN KEY (learning_path_id) REFERENCES learning_paths(id) ON DELETE CASCADE
);
GO

-- ============================================================
-- 22. PREDICTION_LOGS
-- ============================================================
CREATE TABLE prediction_logs (
    id                   INT IDENTITY(1,1) PRIMARY KEY,
    user_id              INT           NOT NULL,
    exam_id              INT           NOT NULL,
    predicted_score      DECIMAL(5,2)  NOT NULL,
    confidence           DECIMAL(5,2)  NOT NULL,
    predicted_pass       BIT           NULL,
    actual_score         DECIMAL(5,2)  NULL,
    actual_pass          BIT           NULL,
    prediction_error     DECIMAL(5,2)  NULL,
    weak_areas_predicted NVARCHAR(MAX) NULL,
    suggestions          NVARCHAR(MAX) NULL,
    data_points_used     INT           NULL,
    created_at           DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_pred_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_pred_exam FOREIGN KEY (exam_id) REFERENCES exams(id)
);
GO

-- ============================================================
-- 23. CHAT_SESSIONS
-- ============================================================
CREATE TABLE chat_sessions (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    user_id       INT           NOT NULL,
    topic_id      INT           NULL,
    title         NVARCHAR(300) DEFAULT N'Phiên chat mới',
    context_type  NVARCHAR(20)  NOT NULL DEFAULT 'general'
        CHECK (context_type IN ('general','topic','question','exam_review')),
    context_id    INT           NULL,
    message_count INT           NOT NULL DEFAULT 0,
    total_tokens  INT           NOT NULL DEFAULT 0,
    is_pinned     BIT           NOT NULL DEFAULT 0,
    created_at    DATETIME2     NOT NULL DEFAULT GETDATE(),
    updated_at    DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_cs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cs_topic FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
);
GO

-- ============================================================
-- 24. CHAT_MESSAGES
-- ============================================================
CREATE TABLE chat_messages (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    session_id   INT           NOT NULL,
    sender_role  NVARCHAR(15)  NOT NULL
        CHECK (sender_role IN ('user','assistant','system')),
    content      NVARCHAR(MAX) NOT NULL,
    content_type NVARCHAR(15)  NOT NULL DEFAULT 'text'
        CHECK (content_type IN ('text','code','image','markdown')),
    tokens_used  INT           NULL,
    is_error     BIT           NOT NULL DEFAULT 0,
    created_at   DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_cm_session FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);
GO

-- ============================================================
-- 25. CHEATING_LOGS
-- ============================================================
CREATE TABLE cheating_logs (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    attempt_id    INT           NOT NULL UNIQUE,
    user_id       INT           NOT NULL,
    risk_score    INT           NOT NULL DEFAULT 0,
    risk_level    NVARCHAR(10)  NOT NULL DEFAULT 'clean'
        CHECK (risk_level IN ('clean','low','medium','high','critical')),
    total_events  INT           NOT NULL DEFAULT 0,
    ai_analysis   NVARCHAR(MAX) NULL,
    summary       NVARCHAR(MAX) NULL,
    reviewed_by   INT           NULL,
    review_note   NVARCHAR(MAX) NULL,
    review_action NVARCHAR(20)  NULL
        CHECK (review_action IS NULL OR review_action IN ('approved','warning','invalidated')),
    reviewed_at   DATETIME2     NULL,
    created_at    DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_cl_attempt FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE,
    CONSTRAINT fk_cl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
    CONSTRAINT fk_cl_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE NO ACTION
);
GO

-- ============================================================
-- 26. CHEATING_EVENTS
-- ============================================================
CREATE TABLE cheating_events (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    cheating_log_id INT           NOT NULL,
    event_type      NVARCHAR(20)  NOT NULL
        CHECK (event_type IN ('tab_switch','copy_paste','right_click','window_blur',
               'suspicious_key','rapid_answer','unusual_idle','answer_pattern',
               'fullscreen_exit','devtools_open')),
    detail          NVARCHAR(500) NULL,
    weight          INT           NOT NULL DEFAULT 1,
    question_id     INT           NULL,
    event_at        DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_ce_log FOREIGN KEY (cheating_log_id) REFERENCES cheating_logs(id) ON DELETE CASCADE
);
GO

-- ============================================================
-- 27. BADGES
-- ============================================================
CREATE TABLE badges (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    code            NVARCHAR(50)  NOT NULL UNIQUE,
    name            NVARCHAR(100) NOT NULL,
    description     NVARCHAR(500) NOT NULL,
    icon            NVARCHAR(10)  NOT NULL DEFAULT N'⭐',
    image_url       NVARCHAR(500) NULL,
    category        NVARCHAR(15)  NOT NULL DEFAULT 'achievement'
        CHECK (category IN ('achievement','streak','social','ai','special')),
    rarity          NVARCHAR(15)  NOT NULL DEFAULT 'common'
        CHECK (rarity IN ('common','uncommon','rare','epic','legendary')),
    condition_type  NVARCHAR(50)  NOT NULL,
    condition_value INT           NOT NULL DEFAULT 1,
    xp_reward       INT           NOT NULL DEFAULT 50,
    sort_order      INT           NOT NULL DEFAULT 0,
    is_active       BIT           NOT NULL DEFAULT 1,
    is_hidden       BIT           NOT NULL DEFAULT 0,
    created_at      DATETIME2     NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================
-- 28. USER_BADGES
-- ============================================================
CREATE TABLE user_badges (
    id        INT IDENTITY(1,1) PRIMARY KEY,
    user_id   INT       NOT NULL,
    badge_id  INT       NOT NULL,
    earned_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    is_new    BIT       NOT NULL DEFAULT 1,
    CONSTRAINT fk_ub_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ub_badge FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE,
    CONSTRAINT uk_ub UNIQUE (user_id, badge_id)
);
GO

-- ============================================================
-- 29. XP_TRANSACTIONS
-- ============================================================
CREATE TABLE xp_transactions_tbl (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    user_id       INT           NOT NULL,
    amount        INT           NOT NULL,
    reason        NVARCHAR(30)  NOT NULL
        CHECK (reason IN ('exam_complete','exam_pass','perfect_score','streak_bonus',
               'badge_earned','daily_login','ai_tutor_use','quest_complete',
               'group_activity','admin_adjust')),
    related_id    INT           NULL,
    related_type  NVARCHAR(50)  NULL,
    description   NVARCHAR(300) NULL,
    balance_after INT           NOT NULL,
    created_at    DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_xp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
GO

-- ============================================================
-- 30. DAILY_QUESTS
-- ============================================================
CREATE TABLE daily_quests (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    quest_date      DATE          NOT NULL,
    user_id         INT           NOT NULL,
    title           NVARCHAR(300) NOT NULL,
    description     NVARCHAR(MAX) NULL,
    quest_type      NVARCHAR(15)  NOT NULL
        CHECK (quest_type IN ('practice','review','exam','explore_ai')),
    target_topic_id INT           NULL,
    target_count    INT           NOT NULL DEFAULT 1,
    current_count   INT           NOT NULL DEFAULT 0,
    xp_reward       INT           NOT NULL DEFAULT 30,
    is_completed    BIT           NOT NULL DEFAULT 0,
    is_ai_generated BIT           NOT NULL DEFAULT 1,
    completed_at    DATETIME2     NULL,
    created_at      DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_dq_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_dq_topic FOREIGN KEY (target_topic_id) REFERENCES topics(id) ON DELETE SET NULL
);
GO

-- ============================================================
-- 31. STUDY_GROUPS
-- ============================================================
CREATE TABLE study_groups (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    name              NVARCHAR(200) NOT NULL,
    description       NVARCHAR(MAX) NULL,
    topic_id          INT           NOT NULL,
    created_by        INT           NOT NULL,
    max_members       INT           NOT NULL DEFAULT 5,
    current_members   INT           NOT NULL DEFAULT 0,
    weak_areas        NVARCHAR(MAX) NULL,
    ai_recommendation NVARCHAR(MAX) NULL,
    ai_exercises      NVARCHAR(MAX) NULL,
    is_ai_created     BIT           NOT NULL DEFAULT 0,
    is_active         BIT           NOT NULL DEFAULT 1,
    created_at        DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_sg_topic FOREIGN KEY (topic_id) REFERENCES topics(id),
    CONSTRAINT fk_sg_creator FOREIGN KEY (created_by) REFERENCES users(id)
);
GO

-- ============================================================
-- 32. STUDY_GROUP_MEMBERS
-- ============================================================
CREATE TABLE study_group_members (
    id        INT IDENTITY(1,1) PRIMARY KEY,
    group_id  INT          NOT NULL,
    user_id   INT          NOT NULL,
    role      NVARCHAR(10) NOT NULL DEFAULT 'member'
        CHECK (role IN ('leader','member')),
    joined_at DATETIME2    NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_sgm_g FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
    CONSTRAINT fk_sgm_u FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT uk_sgm UNIQUE (group_id, user_id)
);
GO

-- ============================================================
-- 33. STUDY_PLANS
-- ============================================================
CREATE TABLE study_plans (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    user_id          INT           NOT NULL,
    topic_id         INT           NOT NULL,
    title            NVARCHAR(300) NULL,
    exam_date        DATE          NULL,
    total_steps      INT           NOT NULL DEFAULT 0,
    completed_steps  INT           NOT NULL DEFAULT 0,
    progress_percent DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
    ai_suggestion    NVARCHAR(MAX) NULL,
    plan_data        NVARCHAR(MAX) NULL,
    status           NVARCHAR(15)  NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','completed','abandoned')),
    created_at       DATETIME2     NOT NULL DEFAULT GETDATE(),
    updated_at       DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_sp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_sp_topic FOREIGN KEY (topic_id) REFERENCES topics(id)
);
GO

-- ============================================================
-- 34. STUDY_PLAN_ITEMS
-- ============================================================
CREATE TABLE study_plan_items (
    id                 INT IDENTITY(1,1) PRIMARY KEY,
    plan_id            INT           NOT NULL,
    scheduled_date     DATE          NOT NULL,
    title              NVARCHAR(300) NOT NULL,
    description        NVARCHAR(MAX) NULL,
    item_type          NVARCHAR(10)  NOT NULL DEFAULT 'review'
        CHECK (item_type IN ('learn','review','practice','exam','read')),
    related_topic_area NVARCHAR(200) NULL,
    repetition_number  INT           NOT NULL DEFAULT 1,
    estimated_minutes  INT           NULL,
    is_completed       BIT           NOT NULL DEFAULT 0,
    completed_at       DATETIME2     NULL,
    CONSTRAINT fk_spi_plan FOREIGN KEY (plan_id) REFERENCES study_plans(id) ON DELETE CASCADE
);
GO

-- ============================================================
-- 35. NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    user_id      INT           NOT NULL,
    title        NVARCHAR(300) NOT NULL,
    message      NVARCHAR(MAX) NOT NULL,
    type         NVARCHAR(20)  NOT NULL DEFAULT 'info'
        CHECK (type IN ('info','success','warning','error','exam_reminder','badge_earned',
               'ai_result','study_reminder','group_invite','quest_available',
               'streak_warning','level_up')),
    icon         NVARCHAR(10)  NULL,
    link         NVARCHAR(500) NULL,
    related_id   INT           NULL,
    related_type NVARCHAR(50)  NULL,
    is_read      BIT           NOT NULL DEFAULT 0,
    created_at   DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_n_user_read ON notifications(user_id, is_read);
GO

PRINT N'✅ Tất cả 35 tables đã được tạo thành công!';
GO
