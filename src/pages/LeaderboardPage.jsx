import React, { useState, useEffect } from 'react';

const api = typeof window !== 'undefined' ? window['electronAPI'] : null;

const LEVELS = [
  { level:1, name:'Lính Mới',   xp:0,     color:'#94a3b8', bg:'rgba(148,163,184,0.1)', icon:'🌱' },
  { level:2, name:'Nghiên Cứu Sinh', xp:200, color:'#4ade80', bg:'rgba(74,222,128,0.1)', icon:'📖' },
  { level:3, name:'Học Giả',    xp:500,   color:'#60a5fa', bg:'rgba(96,165,250,0.1)', icon:'🎓' },
  { level:4, name:'Tung Cánh',  xp:1000,  color:'#a855f7', bg:'rgba(168,85,247,0.1)', icon:'⭐' },
  { level:5, name:'Tinh Anh',   xp:2000,  color:'#facc15', bg:'rgba(250,204,21,0.1)', icon:'🏅' },
  { level:6, name:'Thủ Lĩnh',   xp:5000,  color:'#f87171', bg:'rgba(248,113,113,0.1)', icon:'🔥' },
  { level:7, name:'Vĩ Nhân',    xp:10000, color:'#ec4899', bg:'rgba(236,72,153,0.1)', icon:'💎' },
  { level:8, name:'Huyền Thoại',xp:20000, color:'#f59e0b', bg:'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(217,119,6,0.2))', icon:'👑' },
];

export default function LeaderboardPage({ user, showToast }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [myStats,     setMyStats]     = useState(null);
  const [tab,         setTab]         = useState('board');
  const [refreshKey,  setRefreshKey]  = useState(0);

  useEffect(() => { loadData(); }, [refreshKey]);

  const loadData = async () => {
    if (!api) return;
    setLoading(true);
    try {
      const [lbRes, statsRes] = await Promise.all([
        api.gamification.getLeaderboard({ limit: 50 }),
        api.gamification.getUserStats(user?.id),
      ]);

      if (lbRes.success) setLeaderboard(lbRes.leaderboard || []);
      else showToast('Không thể kết nối máy chủ xếp hạng: ' + lbRes.message, 'error');
      
      if (statsRes.success) setMyStats(statsRes.stats);
      else showToast('Không tải được thông tin cá nhân.', 'warning');
    } catch (e) {
      console.error(e);
      showToast('Lỗi đường truyền: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank) => {
    if (rank === 1) return '🥇'; if (rank === 2) return '🥈'; if (rank === 3) return '🥉'; return `#${rank}`;
  };

  const getRankStyle = (rank) => {
    if (rank === 1) return { bg: 'linear-gradient(135deg,#fbbf24,#f59e0b)', color: '#000', glow: '0 0 20px rgba(245,158,11,0.4)', size: '44px', font: '20px' };
    if (rank === 2) return { bg: 'linear-gradient(135deg,#e2e8f0,#94a3b8)', color: '#000', glow: '0 0 16px rgba(148,163,184,0.3)', size: '40px', font: '18px' };
    if (rank === 3) return { bg: 'linear-gradient(135deg,#fba97c,#c2855a)', color: '#000', glow: '0 0 16px rgba(194,133,90,0.3)', size: '36px', font: '16px' };
    return { bg: 'rgba(255,255,255,0.05)', color: 'white', glow: 'none', size: '32px', font: '13px' };
  };

  const getLevel = (lvl) => LEVELS.find(l => l.level === lvl) || LEVELS[0];
  const getInitials = (name) => (name || '??').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '20px' }}>
        <div className="spinner" style={{ transform: 'scale(1.5)', borderColor: 'rgba(236,72,153,0.2)', borderTopColor: '#ec4899' }} />
        <h2 style={{ color: 'var(--text-muted)' }}>Đang đồng bộ hóa bảng vàng...</h2>
      </div>
    );
  }

  const myRank = myStats?.xpRank;
  const myLevel = getLevel(myStats?.level || 1);

  return (
    <div className="page" style={{ padding: '32px', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      
      {/* Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(88,28,135,0.9) 0%, rgba(134,25,143,0.9) 100%)',
        borderRadius: '24px', padding: '32px', marginBottom: '32px', border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', right: '-5%', top: '-30%', width: '300px', height: '300px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', filter: 'blur(50px)', zIndex: 0 }}></div>
        <div style={{ position: 'relative', zIndex: 2 }}>
          <h1 style={{ fontSize: '36px', fontWeight: 900, color: 'white', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', textShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '40px' }}>🏆</span> Bảng Xếp Hạng Kỳ Tích
          </h1>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)', textShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>Nơi vinh danh các học giả lỗi lạc nhất toàn hệ thống.</p>
        </div>
        <div style={{ position: 'relative', zIndex: 2 }}>
          <button style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '14px 24px', borderRadius: '12px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', backdropFilter: 'blur(10px)', transition: '0.2s', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => setRefreshKey(k => k + 1)}>
            <span>🔄</span> TẢI LẠI ĐỈNH BẢNG
          </button>
        </div>
      </div>

      {/* ─── My Stats VIP Card ─── */}
      {myStats && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(30,41,59,0.9) 0%, rgba(15,23,42,0.95) 100%)', border: '1px solid rgba(236,72,153,0.3)', borderRadius: '24px', padding: '32px', marginBottom: '32px',
          display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
        }}>
          {/* Neon Glow background */}
          <div style={{ position: 'absolute', top: '-100px', left: '-100px', width: '300px', height: '300px', background: myLevel.bg, borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: '-50px', right: '-50px', width: '250px', height: '250px', background: 'rgba(236,72,153,0.1)', borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none' }} />

          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', position: 'relative', zIndex: 2, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <div style={{ width: '84px', height: '84px', borderRadius: '24px', background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 900, color: 'white', boxShadow: '0 10px 25px rgba(236,72,153,0.4)', border: '2px solid rgba(255,255,255,0.2)' }}>
                {getInitials(user?.fullName)}
              </div>
              <div style={{ position: 'absolute', bottom: '-10px', left: '50%', transform: 'translateX(-50%)', background: myLevel.color, color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 800, whiteSpace: 'nowrap', boxShadow: '0 4px 10px rgba(0,0,0,0.3)', border: '2px solid rgba(15,23,42,1)' }}>
                {myLevel.icon} LV {myStats.level}
              </div>
            </div>

            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontSize: '24px', fontWeight: 900, color: 'white' }}>{user?.fullName} </div>
              <div style={{ fontSize: '14px', color: myLevel.color, fontWeight: 700, margin: '4px 0 '}}>{myLevel.name} <span style={{ color: 'var(--text-muted)' }}>— 👤 @{user?.username}</span></div>
            </div>

            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', background: 'rgba(0,0,0,0.3)', padding: '16px 32px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: '6px' }}>Thứ Hạng</div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: '#facc15' }}>{myRank ? `#${myRank}` : '—'}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                 <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: '6px' }}>Kinh Nghiệm</div>
                 <div style={{ fontSize: '28px', fontWeight: 900, color: '#a855f7' }}>{myStats.xp_points?.toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                 <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: '6px' }}>Chuỗi Học</div>
                 <div style={{ fontSize: '28px', fontWeight: 900, color: '#f87171' }}>🔥 {myStats.streak_days || 0}</div>
              </div>
            </div>
          </div>

          {myStats.nextLevel && (
             <div style={{ position: 'relative', zIndex: 2, background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px', fontWeight: 700 }}>
                  <span style={{ color: myLevel.color }}>Lv.{myStats.level} ({myStats.xpProgress}%)</span>
                  <span style={{ color: 'var(--text-muted)' }}>Khoảng cách thăng bậc: {(myStats.nextLevel.xp - myStats.xp_points).toLocaleString()} XP →</span>
                  <span style={{ color: 'white' }}>Lv.{myStats.nextLevel.level} {getLevel(myStats.nextLevel.level).name}</span>
               </div>
               <div style={{ height: '12px', background: 'rgba(0,0,0,0.4)', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ height: '100%', width: `${myStats.xpProgress}%`, background: 'linear-gradient(90deg, #ec4899, #8b5cf6)', borderRadius: '6px', boxShadow: '0 0 10px rgba(236,72,153,0.5)', transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }} />
               </div>
             </div>
          )}
        </div>
      )}

      {/* ─── Tabs Navigation ─── */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
         <button onClick={() => setTab('board')} style={{ background: tab === 'board' ? 'rgba(236,72,153,0.1)' : 'transparent', border: `1px solid ${tab === 'board' ? 'rgba(236,72,153,0.4)' : 'transparent'}`, color: tab === 'board' ? 'white' : 'var(--text-muted)', padding: '12px 24px', borderRadius: '12px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📊 NHỮNG KẺ DẪN ĐẦU
         </button>
         <button onClick={() => setTab('badges')} style={{ background: tab === 'badges' ? 'rgba(236,72,153,0.1)' : 'transparent', border: `1px solid ${tab === 'badges' ? 'rgba(236,72,153,0.4)' : 'transparent'}`, color: tab === 'badges' ? 'white' : 'var(--text-muted)', padding: '12px 24px', borderRadius: '12px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🏅 TỦ KÍNH HUY HIỆU
            {myStats?.badges?.length > 0 && <span style={{ background: '#ec4899', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>{myStats.badges.length}</span>}
         </button>
      </div>

      {/* ─── Tab: Bảng xếp hạng ─── */}
      {tab === 'board' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {leaderboard.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', background: 'var(--bg-glass)', borderRadius: '24px', border: '1px dashed rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>🏆</div>
              <h3 style={{ fontSize: '20px', color: 'white', fontWeight: 800 }}>Dữ liệu chưa ghi nhận</h3>
              <p style={{ color: 'var(--text-muted)' }}>Chưa có chiến binh nào trỗi dậy trên bảng xếp hạng.</p>
            </div>
          ) : (
            leaderboard.map((lb, i) => {
              const rank   = lb.xp_rank || (i + 1);
              const isMe   = lb.user_id === user?.id;
              const lvInfo = getLevel(lb.level || 1);
              const rStyle = getRankStyle(rank);

              return (
                <div key={lb.user_id || i} style={{
                  display: 'flex', alignItems: 'center', gap: '20px', padding: rank <= 3 ? '20px 24px' : '16px 24px',
                  background: isMe ? 'rgba(236,72,153,0.1)' : rank <= 3 ? 'rgba(0,0,0,0.3)' : 'var(--bg-glass)',
                  border: isMe ? '1px solid rgba(236,72,153,0.5)' : `1px solid ${rank <= 3 ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
                  borderRadius: '20px', transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
                  boxShadow: isMe ? '0 0 20px rgba(236,72,153,0.1)' : rank <= 3 ? '0 8px 24px rgba(0,0,0,0.3)' : 'none'
                }}>
                  {isMe && <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '4px', background: '#ec4899' }}></div>}
                  {rank <= 3 && <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '4px', background: rStyle.bg }}></div>}

                  {/* Rank Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '60px', flexShrink: 0 }}>
                    <div style={{ width: rStyle.size, height: rStyle.size, borderRadius: '50%', background: rStyle.bg, color: rStyle.color, display: 'flex', alignItems: 'center', justifyItems: 'center', padding: 'auto 0', fontWeight: 900, fontSize: rStyle.font, boxShadow: rStyle.glow, justifyContent: 'center' }}>
                       {getRankIcon(rank)}
                    </div>
                  </div>

                  {/* Player Info */}
                  <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '16px', minWidth: '200px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: isMe ? '#ec4899' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 900, color: 'white', border: isMe ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>
                      {getInitials(lb.full_name)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '16px', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {lb.full_name} {isMe && <span style={{ fontSize: '11px', background: 'rgba(236,72,153,0.2)', padding: '2px 8px', borderRadius: '10px', color: '#fbcfe8' }}>HIỆN TẠI</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>
                        Tài khoản: @{lb.username} <span style={{ margin: '0 8px' }}>•</span> {lvInfo.name}
                      </div>
                    </div>
                  </div>

                  {/* Badges/Tags */}
                  <div style={{ flex: 1, minWidth: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ background: lvInfo.bg, color: lvInfo.color, padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 800, border: `1px solid ${lvInfo.color}40`, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      {lvInfo.icon} Level {lb.level || 1}
                    </span>
                  </div>

                  {/* Mini Stats */}
                  <div style={{ flex: 2, display: 'flex', justifyContent: 'flex-end', gap: '32px' }}>
                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Kinh Nghiệm</span>
                        <span style={{ fontSize: '18px', fontWeight: 900, color: '#a855f7' }}>{(lb.xp_points || 0).toLocaleString()}</span>
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '60px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Chuỗi Học</span>
                        <span style={{ fontSize: '15px', fontWeight: 800, color: lb.streak_days > 0 ? '#f87171' : 'var(--text-muted)' }}>{lb.streak_days > 0 ? `🔥 ${lb.streak_days}` : '—'}</span>
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '60px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Bài Thi</span>
                        <span style={{ fontSize: '15px', fontWeight: 800, color: 'white' }}>{lb.completed_exams || 0}</span>
                     </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ─── Tab: Huy hiệu ─── */}
      {tab === 'badges' && (
        <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: '24px', padding: '32px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            🏅 Tủ Kính Lưu Niệm <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '14px' }}>— Sửa soạn hành trang cá nhân ({myStats?.badges?.length || 0})</span>
          </h3>
          
          {!myStats?.badges?.length ? (
            <div style={{ padding: '60px', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '20px', border: '1px dashed rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', filter: 'grayscale(1)', opacity: 0.5 }}>🏅</div>
              <h3 style={{ fontSize: '18px', color: 'white', fontWeight: 800 }}>Trống Rỗng</h3>
              <p style={{ color: 'var(--text-muted)' }}>Hoàn thành xuất sắc các bài thực hành AI để khai mở huy chương!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
              {myStats.badges.map(b => (
                <div key={b.id} style={{
                  display: 'flex', alignItems: 'center', gap: '16px', padding: '20px', borderRadius: '20px',
                  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)',
                  transition: 'all 0.2s', position: 'relative', overflow: 'hidden'
                }} onMouseOver={e=>e.currentTarget.style.transform='translateY(-4px)'} onMouseOut={e=>e.currentTarget.style.transform='none'}>
                  {b.rarity === 'legendary' && <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'linear-gradient(180deg, #f59e0b, #d97706)' }} />}
                  {b.rarity === 'epic' && <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'linear-gradient(180deg, #8b5cf6, #6366f1)' }} />}
                  
                  <div style={{
                    width: '64px', height: '64px', borderRadius: '16px', flexShrink: 0,
                    background: b.rarity === 'legendary' ? 'linear-gradient(135deg,#f59e0b 0%,#d97706 100%)' : b.rarity === 'epic' ? 'linear-gradient(135deg,#8b5cf6 0%,#6366f1 100%)' : b.rarity === 'rare' ? 'linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%)' : 'rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', boxShadow: '0 8px 20px rgba(0,0,0,0.3)'
                  }}>
                    {b.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'white', marginBottom: '4px' }}>{b.name}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{b.description}</div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                       <span style={{ fontSize: '11px', background: 'rgba(168,85,247,0.2)', color: '#d8b4fe', padding: '2px 8px', borderRadius: '10px', fontWeight: 800 }}>+{b.xp_reward} Phép Màu (XP)</span>
                       <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.1)', color: 'white', padding: '2px 8px', borderRadius: '10px', fontWeight: 800, textTransform: 'uppercase' }}>{b.rarity}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
