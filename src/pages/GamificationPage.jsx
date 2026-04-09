import React, { useEffect, useMemo, useState } from 'react';

const api = typeof window !== 'undefined' ? window.electronAPI : null;

const QUEST_TYPE_LABEL = {
  exam: { icon: '📝', label: 'Thi Cử', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  practice: { icon: '📚', label: 'Tự Luyện', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  review: { icon: '🔁', label: 'Ôn Tập', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  explore_ai: { icon: '🤖', label: 'Khám Phá AI', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
};

export default function GamificationPage({ user, showToast }) {
  const [stats, setStats] = useState(null);
  const [badges, setBadges] = useState([]);
  const [quests, setQuests] = useState([]);
  const [xpHistory, setXpHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!api || !user?.id) return;
    setLoading(true);
    try {
      const [sRes, bRes, qRes, xRes] = await Promise.all([
        api.gamification.getUserStats(user.id),
        api.gamification.getBadges(user.id),
        api.gamification.getDailyQuests(user.id),
        api.gamification.getXPHistory(user.id),
      ]);
      if (sRes.success) setStats(sRes.stats); else showToast(sRes.message || 'Lỗi tải thống kê', 'error');
      if (bRes.success) setBadges(bRes.badges || []); else showToast(bRes.message || 'Lỗi tải huy hiệu', 'error');
      if (qRes.success) setQuests(qRes.quests || []); else showToast(qRes.message || 'Lỗi tải nhiệm vụ', 'error');
      if (xRes.success) setXpHistory(xRes.history || []); else showToast(xRes.message || 'Lỗi tải lịch sử nhận XP', 'error');
    } catch (e) {
      showToast(`Lỗi kết nối: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [user?.id]);

  const earnedBadges = useMemo(() => badges.filter(b => b.earned), [badges]);
  const completedQuests = useMemo(() => quests.filter(q => q.is_completed), [quests]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '20px' }}>
        <div className="spinner" style={{ transform: 'scale(1.5)', borderColor: 'rgba(16,185,129,0.2)', borderTopColor: '#10b981' }} />
        <h2 style={{ color: 'var(--text-muted)' }}>Đang quét hệ thống nhiệm vụ AI...</h2>
      </div>
    );
  }

  return (
    <div className="page" style={{ padding: '32px', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      
      {/* Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(6,78,59,0.9) 0%, rgba(4,120,87,0.9) 100%)',
        borderRadius: '24px', padding: '32px', marginBottom: '32px', border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', right: '-10%', top: '-20%', width: '300px', height: '300px', background: 'rgba(0,0,0,0.2)', borderRadius: '50%', filter: 'blur(50px)', zIndex: 0 }}></div>
        
        <div style={{ position: 'relative', zIndex: 2 }}>
          <h1 style={{ fontSize: '36px', fontWeight: 900, color: 'white', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', textShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '40px' }}>🎮</span> Hệ Sinh Thái Định Vị Kỹ Năng
          </h1>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)', textShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            Thống kê điểm kinh nghiệm, chuỗi đăng nhập và các nhiệm vụ cá nhân hoá giúp tăng cường động lực học.
          </p>
        </div>
        
        <div style={{ position: 'relative', zIndex: 2 }}>
          <button 
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '14px 24px', borderRadius: '12px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', backdropFilter: 'blur(10px)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={loadData}
          >
            <span>🔄</span> LÀM MỚI QUỸ ĐIỂM
          </button>
        </div>
      </div>

      {/* Grid Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '32px' }}>
         <div style={{ background: 'var(--bg-glass)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '24px', padding: '24px', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #ec4899, #8b5cf6)' }} />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px' }}>Kinh Nghiệm Thu Thập</div>
            <div style={{ fontSize: '36px', fontWeight: 900, color: 'white' }}>{stats?.xp_points?.toLocaleString() || 0} <span style={{ fontSize: '16px', color: '#a855f7' }}>XP</span></div>
         </div>
         <div style={{ background: 'var(--bg-glass)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '24px', padding: '24px', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #06b6d4, #3b82f6)' }} />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px' }}>Bậc Hệ Thống</div>
            <div style={{ fontSize: '36px', fontWeight: 900, color: 'white' }}>LV {stats?.level || 1}</div>
         </div>
         <div style={{ background: 'var(--bg-glass)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '24px', padding: '24px', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #f59e0b, #ef4444)' }} />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px' }}>Dấu Ấn Luyện Tập</div>
            <div style={{ fontSize: '36px', fontWeight: 900, color: '#fca5a5' }}>🔥 {stats?.streak_days || 0} <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600 }}>Ngày liên tiếp</span></div>
         </div>
         <div style={{ background: 'var(--bg-glass)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '24px', padding: '24px', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #10b981, #059669)' }} />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px' }}>Ghi Nhận Nhiệm Vụ </div>
            <div style={{ fontSize: '36px', fontWeight: 900, color: 'white' }}>{completedQuests.length}<span style={{ color: 'var(--text-muted)' }}>/{quests.length}</span> <span style={{ fontSize: '14px', color: '#34d399', fontWeight: 600 }}>Đã xử lý</span></div>
         </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(380px, 6fr) minmax(380px, 5fr)', gap: '24px', marginBottom: '32px' }}>
        
        {/* Daily Quests Card */}
        <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: '24px', padding: '32px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🎯 Nhiệm Vụ Đặc Biệt <span style={{ fontSize: '12px', background: 'rgba(16,185,129,0.2)', color: '#6ee7b7', padding: '4px 10px', borderRadius: '20px', fontWeight: 700 }}>(Thiết Kế Bởi AI)</span>
          </h3>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {(quests || []).length === 0 ? (
               <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📭</div>
                  <h4 style={{ color: 'white', fontSize: '16px', fontWeight: 800 }}>Chưa Phát Sinh Nhiệm Vụ</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Hệ thống thuật toán chưa cấp mệnh lệnh cho hôm nay.</p>
               </div>
            ) : quests.map(q => {
               const meta = QUEST_TYPE_LABEL[q.quest_type] || { icon:'🧩', label:q.quest_type, color:'#94a3b8', bg:'rgba(148,163,184,0.1)' };
               const progressPercent = Math.min(100, Math.floor((q.current_count / q.target_count) * 100));
               return (
                  <div key={q.id} style={{ 
                     background: q.is_completed ? 'rgba(16,185,129,0.05)' : 'rgba(0,0,0,0.3)', 
                     border: `1px solid ${q.is_completed ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.05)'}`, 
                     borderRadius: '16px', padding: '20px', transition: 'all 0.2s', position: 'relative', overflow: 'hidden'
                  }}>
                     {q.is_completed && <div style={{ position: 'absolute', right: '-20px', top: '-20px', width: '100px', height: '100px', background: 'rgba(16,185,129,0.1)', borderRadius: '50%', filter: 'blur(20px)' }} />}
                     
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', position: 'relative', zIndex: 2 }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                           <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>{meta.icon}</div>
                           <div>
                              <div style={{ fontSize: '15px', fontWeight: 800, color: q.is_completed ? '#6ee7b7' : 'white' }}>{q.title}</div>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Mệnh lệnh thuộc: <strong>{meta.label}</strong></div>
                           </div>
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 800, background: 'rgba(168,85,247,0.15)', color: '#d8b4fe', border: '1px solid rgba(168,85,247,0.3)', padding: '4px 10px', borderRadius: '12px' }}>
                           + {q.xp_reward} XP
                        </div>
                     </div>
                     
                     <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5, position: 'relative', zIndex: 2 }}>
                        {q.description || 'Thực thi các chuỗi chỉ thị được uỷ nhiệm từ thuật toán nhằm tối ưu trình độ.'}
                     </div>
                     
                     <div style={{ position: 'relative', zIndex: 2 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 700 }}>
                           <span>{q.is_completed ? 'Hoàn Tất' : 'Đang Xử Lý'}</span>
                           <span>{q.current_count} / {q.target_count} Lệnh</span>
                        </div>
                        <div style={{ height: '8px', background: 'rgba(0,0,0,0.5)', borderRadius: '4px', overflow: 'hidden' }}>
                           <div style={{ height: '100%', width: `${progressPercent}%`, background: q.is_completed ? '#10b981' : '#3b82f6', borderRadius: '4px', boxShadow: q.is_completed ? '0 0 10px #10b981' : 'none', transition: 'width 0.5s' }} />
                        </div>
                     </div>
                  </div>
               );
            })}
          </div>
        </div>

        {/* Badges Preview Card */}
        <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: '24px', padding: '32px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🎖️ Kỷ Kỷ Lục Đã Khai Mở
          </h3>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
             {earnedBadges.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                   <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5, filter: 'grayscale(1)' }}>📦</div>
                   <h4 style={{ color: 'white', fontSize: '16px', fontWeight: 800 }}>Chưa Ghi Nhận Thành Tựu</h4>
                   <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Khoá tín vật vẫn chưa được mở. Hoàn thành bài thi để sở hữu thêm.</p>
                </div>
             ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: '12px', overflowY: 'auto', paddingRight: '8px', maxHeight: '400px' }}>
                  {earnedBadges.slice(0, 8).map(b => (
                     <div key={b.id} style={{ display: 'flex', gap: '16px', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', padding: '16px', borderRadius: '16px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0))', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
                           {b.icon}
                        </div>
                        <div>
                           <div style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>{b.name}</div>
                           <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Đã ghi danh vào tủ chứa huy hiệu</div>
                        </div>
                     </div>
                  ))}
                  {earnedBadges.length > 8 && (
                     <div style={{ textAlign: 'center', padding: '12px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700, background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
                        + {earnedBadges.length - 8} Huy Hiệu Ẩn Dấu Khác...
                     </div>
                  )}
                </div>
             )}
          </div>
        </div>

      </div>

      {/* XP Transaction History */}
      <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: '24px', padding: '32px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          📜 Nhật Ký Dịch Chuyển K.Nghiệm
        </h3>
        
        {(xpHistory || []).length === 0 ? (
           <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Hệ thống chưa ghi nhận bất kỳ giao dịch luân chuyển phép XP nào.</p>
           </div>
        ) : (
           <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                     <tr style={{ background: 'rgba(0,0,0,0.4)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        <th style={{ padding: '16px 24px', fontWeight: 800 }}>Chỉ Thị Ghi Nhận</th>
                        <th style={{ padding: '16px 24px', fontWeight: 800 }}>Mức Phép Biến Số</th>
                        <th style={{ padding: '16px 24px', fontWeight: 800 }}>Chủ Thể Cuối Cùng</th>
                        <th style={{ padding: '16px 24px', fontWeight: 800, textAlign: 'right' }}>Dấu Ấn Thời Gian</th>
                     </tr>
                  </thead>
                  <tbody>
                     {xpHistory.slice(0, 12).map((x, idx) => (
                        <tr key={x.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                           <td style={{ padding: '16px 24px', fontSize: '14px', color: 'white', fontWeight: 500 }}>{x.reason}</td>
                           <td style={{ padding: '16px 24px', fontSize: '15px', color: '#34d399', fontWeight: 900 }}>+{x.amount} XP</td>
                           <td style={{ padding: '16px 24px', fontSize: '14px', color: 'var(--text-secondary)' }}>{x.balance_after}</td>
                           <td style={{ padding: '16px 24px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'right' }}>{new Date(x.created_at).toLocaleString('vi-VN')}</td>
                        </tr>
                     ))}
                  </tbody>
              </table>
           </div>
        )}
      </div>

    </div>
  );
}
