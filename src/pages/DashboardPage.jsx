import React, { useState, useEffect } from 'react';

const api = typeof window !== 'undefined' ? window['electronAPI'] : null;

// Premium Stat Card overlay Component
function StatCard({ icon, label, value, color, description }) {
  const themes = {
    purple: { bg: 'linear-gradient(135deg, rgba(168,85,247,0.1) 0%, rgba(168,85,247,0.02) 100%)', text: '#d8b4fe', iconBg: 'rgba(168,85,247,0.2)', border: 'rgba(168,85,247,0.3)' },
    blue: { bg: 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(59,130,246,0.02) 100%)', text: '#93c5fd', iconBg: 'rgba(59,130,246,0.2)', border: 'rgba(59,130,246,0.3)' },
    green: { bg: 'linear-gradient(135deg, rgba(34,197,94,0.1) 0%, rgba(34,197,94,0.02) 100%)', text: '#86efac', iconBg: 'rgba(34,197,94,0.2)', border: 'rgba(34,197,94,0.3)' },
    orange: { bg: 'linear-gradient(135deg, rgba(249,115,22,0.1) 0%, rgba(249,115,22,0.02) 100%)', text: '#fdba74', iconBg: 'rgba(249,115,22,0.2)', border: 'rgba(249,115,22,0.3)' },
  };
  const theme = themes[color] || themes.blue;

  return (
    <div style={{
      background: theme.bg,
      border: `1px solid ${theme.border}`,
      borderRadius: '20px',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      cursor: 'default',
    }} 
    onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 10px 30px ${theme.border}`; }}
    onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2, textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>{value}</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: theme.text, textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: '4px' }}>{label}</div>
        </div>
        <div style={{
          width: '56px', height: '56px', borderRadius: '16px',
          background: theme.iconBg, color: theme.text,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '26px', backdropFilter: 'blur(10px)'
        }}>
          {icon}
        </div>
      </div>
      {description && <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>{description}</div>}
    </div>
  );
}

export default function DashboardPage({ user, showToast, navigateTo }) {
  const [adminStats, setAdminStats] = useState(null);
  const [studentStats, setStudentStats] = useState(null);
  const [recentExams, setRecentExams] = useState([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === 'admin' || user?.role === 'teacher';

  useEffect(() => {
    if (isAdmin) loadAdminStats();
    else loadStudentStats();
  }, [isAdmin, user?.id]); // eslint-disable-line

  const loadAdminStats = async () => {
    if (!api) return;
    try {
      setLoading(true);
      const res = await api.stats.overview();
      if (res.success) setAdminStats(res.stats);
      else showToast('Lỗi tải thống kê: ' + res.message, 'error');
    } catch (err) {
      console.error(err);
      showToast('Lỗi kết nối: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadStudentStats = async () => {
    if (!api || !user?.id) return;
    try {
      setLoading(true);
      const [gameRes, histRes] = await Promise.all([
        api.gamification.getUserStats(user.id),
        api.attempts.getHistory({ userId: user.id, page: 1, limit: 5 })
      ]);
      if (gameRes.success) setStudentStats(gameRes.stats);
      if (histRes.success) setRecentExams(histRes.attempts || []);
    } catch (err) {
      console.error(err);
      showToast('Lỗi tải dữ liệu học sinh.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="loading-page">
          <div className="spinner"></div>
          <p className="loading-page__text">Đồng bộ dữ liệu bảng điều khiển...</p>
        </div>
      </div>
    );
  }

  // ==== ADMIN DASHBOARD ====
  const renderAdminDashboard = () => {
    const cards = [
      { icon: '👥', label: 'Tài Khoản', value: adminStats?.total_users || 0, color: 'blue', description: 'Người dùng toàn hệ thống' },
      { icon: '📝', label: 'Lượt Dự Thi', value: adminStats?.total_attempts || 0, color: 'green', description: 'Tất cả các ca hoàn thành' },
      { icon: '🧠', label: 'Lượt Gọi AI', value: adminStats?.total_ai_calls || 0, color: 'purple', description: 'Hệ thống AI xử lý tích cực' },
      { icon: '🚫', label: 'Ca Rủi Ro Cao', value: adminStats?.high_risk_attempts || 0, color: 'orange', description: 'Báo cáo nghi ngờ từ Anti-cheat' },
      { icon: '📁', label: 'Chủ Đề Thi', value: adminStats?.total_topics || 0, color: 'blue', description: 'Đã phát hành ra nền tảng' },
      { icon: '❓', label: 'Ngân Hàng Câu Hỏi', value: adminStats?.total_questions || 0, color: 'purple', description: `Gồm ${adminStats?.ai_questions || 0} câu sinh từ AI` },
      { icon: '⭐', label: 'Điểm Số M/B', value: adminStats?.avg_score != null ? adminStats.avg_score : '—', color: 'green', description: 'Điểm trung bình hệ thống' },
      { icon: '🎯', label: 'Bài Thi Mở', value: adminStats?.total_exams || 0, color: 'orange', description: 'Tổng bài thi đang khả dụng' },
    ];

    return (
      <>
        {/* Admin Welcome Hero */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(20,22,37,1) 0%, rgba(31,34,51,1) 100%)',
          borderRadius: '24px', padding: '32px', marginBottom: '32px',
          border: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
        }}>
          <div>
            <h1 style={{ fontSize: '32px', fontWeight: 800, color: 'white', marginBottom: '8px' }}>Trung Tâm Chỉ Huy QG2</h1>
            <p style={{ fontSize: '15px', color: 'var(--text-muted)' }}>Kiểm soát hệ thống AI, quản lý đề thi, và theo dõi tiến trình học viên toàn diện.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn--primary" style={{ padding: '12px 24px', borderRadius: '12px', fontSize: '14px' }} onClick={() => navigateTo('ai-generate')}>
              ✨ Tạo Đề Siêu Tốc AI
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          {cards.map((s, i) => <StatCard key={i} {...s} />)}
        </div>

        <div className="grid-2">
          <div className="card" style={{ padding: '24px', borderRadius: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚡ Truy cập siêu tốc
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {[
                { icon: '📝', title: 'Quản lý bài thi', desc: 'Sửa, xóa đề thi', action: 'exams' },
                { icon: '📁', title: 'Quản lý chủ đề', desc: 'Cấu trúc khối ngành', action: 'topics' },
                { icon: '👥', title: 'User & Phân quyền', desc: 'Quản trị tài khoản', action: 'users' },
                { icon: '🛡️', title: 'Báo cáo gian lận', desc: 'Kiểm tra Anti-cheat', action: 'cheating-reports' },
              ].map((act, i) => (
                <div key={i} onClick={() => navigateTo(act.action)} style={{
                  background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px',
                  cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '16px'
                }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(99,102,241,0.05)'; }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-glass)'; }}
                >
                  <div style={{ fontSize: '28px' }}>{act.icon}</div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{act.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{act.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: '24px', borderRadius: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚙️ Thông số nền tảng (Platform Health)
            </h3>
            <div style={{ background: '#0f1015', borderRadius: '16px', padding: '20px', border: '1px solid #1f2937' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #1f2937' }}>
                <span style={{ color: '#9ca3af' }}>Engine Sinh Ngôn Ngữ</span>
                <strong style={{ color: '#bae6fd' }}>Groq / Gemini / Ollama</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #1f2937' }}>
                <span style={{ color: '#9ca3af' }}>Cơ Sở Dữ Liệu</span>
                <strong style={{ color: '#86efac' }}>SQL Server / SQLite</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #1f2937' }}>
                <span style={{ color: '#9ca3af' }}>Giao Thức Lõi</span>
                <strong style={{ color: '#e879f9' }}>Electron IPC + Vite</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
                <span style={{ color: '#9ca3af' }}>Phiên bản App</span>
                <strong style={{ color: '#fca5a5' }}>v2.0.0 (Anti-cheat Ready)</strong>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  // ==== STUDENT DASHBOARD ====
  const renderStudentDashboard = () => {
    const st = studentStats || user || {};

    return (
      <>
        {/* Modern Student Gamification Hero */}
        <div style={{
          position: 'relative',
          background: 'linear-gradient(135deg, rgba(67,56,202,1) 0%, rgba(139,92,246,1) 100%)',
          borderRadius: '24px', padding: '40px', marginBottom: '32px',
          boxShadow: '0 20px 40px rgba(67,56,202,0.3)',
          overflow: 'hidden', display: 'flex', alignItems: 'center', gap: '32px'
        }}>
          {/* Decorative background circle */}
          <div style={{ position: 'absolute', right: '-10%', top: '-50%', width: '300px', height: '300px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', filter: 'blur(30px)' }}></div>
          
          {/* Avatar Level Frame */}
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{
              width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', color: '#fff', border: '3px solid rgba(255,255,255,0.5)',
              boxShadow: '0 0 30px rgba(0,0,0,0.3)'
            }}>
              {st?.fullName ? st.fullName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() : '👨‍🎓'}
            </div>
            <div style={{
              position: 'absolute', bottom: '-10px', left: '50%', transform: 'translateX(-50%)',
              background: '#f59e0b', color: '#fff', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 800,
              boxShadow: '0 4px 10px rgba(0,0,0,0.4)', border: '2px solid rgba(255,255,255,0.2)'
            }}>
              Lv. {st.level || 1}
            </div>
          </div>

          <div style={{ flex: 1, zIndex: 2 }}>
            <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#fff', marginBottom: '8px', lineHeight: 1.1 }}>
              Chào mừng trở lại, {st.fullName || user?.fullName?.split(' ')[0]}!
            </h1>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.8)', marginBottom: '24px', maxWidth: '600px' }}>
              Hãy tiếp tục hoàn thiện hành trình học tập. Kiến thức hôm nay chính là tương lai của bạn ngày mai!
            </p>
            
            {/* XP Glass Progress Bar */}
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '16px', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                <span>{st.currentLevel?.name || 'Tân binh'} • {st.xp_points || 0} XP</span>
                <span>Tiến tới {st.nextLevel?.name || 'Cấp tiếp theo'}: {st.nextLevel?.xp || 'MAX'} XP</span>
              </div>
              <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                 <div style={{ width: `${st.xpProgress || 0}%`, height: '100%', background: 'linear-gradient(90deg, #34d399, #10b981)', borderRadius: '4px', boxShadow: '0 0 10px #10b981' }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Action & Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          <StatCard icon="🏆" label="Thứ Hạng Khối" value={st.xpRank ? `#${st.xpRank}` : '—'} color="orange" />
          <StatCard icon="🔥" label="Chuỗi Kỷ Lục Lửa" value={`${st.streak_days || 0} Ng`} color="orange" description={`Kỷ lục dài nhất: ${st.longest_streak || 0} ngày`} />
          <StatCard icon="✅" label="Đề Đã Hoành Thành" value={st.total_exams_taken || 0} color="blue" description="Cố gắng nộp bài đúng hạn nhé" />
          <StatCard icon="🏅" label="Huy Hiệu Sở Hữu" value={(st.badges || []).filter(b => b.earned_at).length || 0} color="purple" description="Chinh phục thành tựu giới hạn" />
        </div>

        <div className="grid-2">
          {/* Card Lịch Sử & Gợi Ý */}
          <div className="card" style={{ padding: '24px', borderRadius: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>📌 Hành Trình Gần Nhất</h3>
              <button className="btn btn--ghost btn--sm" style={{ color: 'var(--accent)' }} onClick={() => navigateTo('history')}>Xem tất cả →</button>
            </div>
            
            {recentExams.length === 0 ? (
              <div style={{ background: 'var(--bg-glass)', borderRadius: '16px', padding: '32px 16px', textAlign: 'center', border: '1px dashed var(--border-accent)' }}>
                <div style={{ fontSize: 40, marginBottom: '12px' }}>🚀</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Chưa có gì để hiển thị</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '20px' }}>Hãy tham gia bài thi mở đầu tiên để khởi tạo chuỗi lửa nhé!</div>
                <button className="btn btn--primary" onClick={() => navigateTo('exam-take')}>Vào kho bài thi ngay</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {recentExams.map(ex => {
                  const passBg = ex.is_passed ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)';
                  const passColor = ex.is_passed ? '#22c55e' : '#ef4444';
                  
                  return (
                  <div key={ex.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '16px', background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border)',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }} className="hover-scale" onClick={() => navigateTo(ex.status === 'completed' ? 'exam-result' : 'history', { attemptId: ex.id })}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: ex.status === 'completed' ? passBg : 'rgba(249,115,22,0.1)', color: ex.status === 'completed' ? passColor : '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                        {ex.status === 'completed' ? (ex.is_passed ? '✓' : '✕') : '⏳'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{ex.exam_title || `Bài thi #${ex.exam_id}`}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {ex.started_at ? new Date(ex.started_at).toLocaleString('vi-VN') : '—'}
                          {ex.status === 'completed' ? ` • Nhận ${ex.xp_earned || 0} XP` : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: ex.status === 'completed' ? passColor : '#f97316' }}>
                        {ex.status === 'completed' ? (ex.score != null ? `${ex.score}` : '—') : 'Đang thi'}
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            )}
          </div>

          {/* AI Banner */}
          <div className="card" style={{ padding: '0', borderRadius: '24px', overflow: 'hidden', border: 'none', background: 'linear-gradient(135deg, rgba(8,145,178,1) 0%, rgba(13,148,136,1) 100%)', boxShadow: '0 20px 40px rgba(13,148,136,0.3)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '200px', height: '200px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', filter: 'blur(30px)' }}></div>
            <div style={{ padding: '32px', position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>🧞‍♂️</div>
              <h3 style={{ fontSize: '24px', fontWeight: 800, color: '#fff', marginBottom: '12px', lineHeight: 1.2 }}>Gặp khó khăn với câu hỏi?</h3>
              <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.9)', marginBottom: '32px', lineHeight: 1.6 }}>
                Đừng ngại hỏi AI Tutor của nền tảng! Trợ lý ảo được trang bị trí tuệ thông minh nhân tạo mạnh mẽ có khả năng giải thích chi tiết, dẫn hướng lý thuyết và tạo bài tập nhỏ giúp khắc sâu tư duy.
              </p>
              <button className="btn" style={{ background: '#fff', color: '#0891b2', fontWeight: 800, padding: '16px 24px', borderRadius: '16px', fontSize: '15px', width: 'fit-content' }} onClick={() => navigateTo('ai-chat')}>
                🚀 Khám phá AI Tutor Ngay
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="page" style={{ padding: '32px', background: 'var(--bg-primary)' }}>
      {isAdmin ? renderAdminDashboard() : renderStudentDashboard()}
    </div>
  );
}
