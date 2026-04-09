import React, { useEffect, useState, useCallback, useRef } from 'react';

const api = typeof window !== 'undefined' ? window['electronAPI'] : null;
const PAGE_SIZE = 20;

const ROLE_BADGE = {
  admin:   { label: '👑 Quản Trị Đặc Quyền',   style: { background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.1))',   color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' } },
  teacher: { label: '📚 Giảng Viên', style: { background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(79,70,229,0.1))',  color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' } },
  student: { label: '🎓 Học Viên', style: { background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(22,163,74,0.1))',   color: '#86efac', border: '1px solid rgba(34,197,94,0.3)' } },
};

export default function UsersPage({ user, showToast }) {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pendingRole, setPendingRole]  = useState(null);
  const [processing, setProcessing] = useState(null);
  const searchTimer = useRef(null);

  const isAdmin = user?.role?.toLowerCase() === 'admin';

  // ── Load ─────────────────────────────────────────────────────
  const loadUsers = useCallback(async (pg = 1, q = search, rf = roleFilter) => {
    if (!api || !isAdmin) return;
    setLoading(true);
    try {
      const res = await api.users.getAll(
        { search: q, role: rf, page: pg, limit: PAGE_SIZE },
        { id: user.id }
      );
      if (res?.success) {
        setUsers(res.users || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
        setPage(pg);
      } else {
        showToast(res?.message || 'Không thể tải danh sách người dùng', 'error');
      }
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { loadUsers(1, '', ''); }, []); // eslint-disable-line

  const handleSearchChange = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadUsers(1, val, roleFilter), val ? 400 : 0);
  };

  const handleRoleFilterChange = (val) => {
    setRoleFilter(val);
    loadUsers(1, search, val);
  };

  const goToPage = (pg) => {
    const p = Math.max(1, Math.min(totalPages, pg));
    loadUsers(p, search, roleFilter);
  };

  const handleRoleSelectChange = (targetUser, newRole) => {
    if (newRole === targetUser.role) return;
    if (Number(targetUser.id) === Number(user.id)) {
      showToast('Không thể tự thay đổi chức vụ của chính mình', 'error');
      return;
    }
    setPendingRole({ userId: targetUser.id, newRole, userName: targetUser.full_name || targetUser.username, oldRole: targetUser.role });
  };

  const confirmRoleChange = async () => {
    if (!pendingRole) return;
    setProcessing(pendingRole.userId);
    try {
      const res = await api.users.updateRole(pendingRole.userId, pendingRole.newRole, { id: user.id });
      if (res.success) {
        showToast(`✅ Đã thăng/giáng chức "${pendingRole.userName}" thành ${ROLE_BADGE[pendingRole.newRole]?.label.split(' ')[1]}`, 'success');
        loadUsers(page, search, roleFilter);
      } else {
        showToast(res.message || 'Không thể cập nhật role', 'error');
      }
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setProcessing(null);
      setPendingRole(null);
    }
  };

  const handleToggleLock = async (targetUser) => {
    if (Number(targetUser.id) === Number(user.id)) {
      showToast('Không thể tự khóa tài khoản của bản thân', 'error');
      return;
    }

    const action = targetUser.is_active ? 'khóa' : 'mở khóa';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} tài khoản "${targetUser.full_name || targetUser.username}" thuộc phân hệ hiện tại?`)) return;

    setProcessing(targetUser.id);
    try {
      const res = await api.users.delete(targetUser.id, { id: user.id });
      if (res.success) {
        showToast(`Trạng thái an ninh: Đã ${action}`, 'success');
        loadUsers(page, search, roleFilter);
      } else {
        showToast(res.message || `Lỗi bảo mật khi ${action}`, 'error');
      }
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setProcessing(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center', background: 'rgba(239,68,68,0.05)', padding: '60px', borderRadius: '32px', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div style={{ fontSize: '72px', marginBottom: '20px' }}>🔐</div>
          <h2 style={{ fontSize: '28px', color: '#fca5a5', fontWeight: 800 }}>Khu Vực Bất Khả Xâm Phạm</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '12px' }}>Không gian này thuộc quyền quản trị tối cao của Admin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ padding: '32px', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      {/* Premium Hero Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(88,28,135,1) 0%, rgba(76,29,149,1) 100%)',
        borderRadius: '24px', padding: '32px', marginBottom: '32px',
        border: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
        position: 'relative', overflow: 'hidden'
      }}>
        {/* Decorative elements */}
        <div style={{ position: 'absolute', right: '-10%', top: '-20%', width: '300px', height: '300px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', filter: 'blur(40px)' }}></div>
        
        <div style={{ position: 'relative', zIndex: 2 }}>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: 'white', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '36px' }}>👥</span> Quản Trị Tệp Người Dùng
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.7)' }}>
            Quản lý quyền truy cập, theo dõi dữ liệu và xử lý vi phạm trong hệ sinh thái.
          </p>
        </div>
        
        <div style={{ position: 'relative', zIndex: 2, background: 'rgba(0,0,0,0.2)', padding: '16px 24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '1px' }}>Hồ sơ khả dụng</div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: 'white' }}>{total} <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>tài khoản</span></div>
        </div>
      </div>

      {/* Modern Action Bar */}
      <div style={{ 
        display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap',
        background: 'var(--bg-secondary)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border)'
      }}>
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={{ position: 'absolute', left: '16px', fontSize: '18px', color: 'var(--text-muted)' }}>🔍</span>
          <input
            style={{ 
              width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', 
              color: 'var(--text-primary)', padding: '12px 16px 12px 48px', borderRadius: '12px',
              fontSize: '15px', outline: 'none', transition: 'border 0.2s'
            }}
            placeholder="Tra cứu theo tên định danh, username, email..."
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
            onKeyDown={e => e.key === 'Enter' && loadUsers(1, search, roleFilter)}
          />
          {search && (
            <button onClick={() => handleSearchChange('')} style={{
              position: 'absolute', right: '16px', background: 'rgba(255,255,255,0.1)', border: 'none',
              color: 'var(--text-primary)', width: '24px', height: '24px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              fontSize: '12px', transition: 'background 0.2s'
            }} onMouseOver={e=>e.currentTarget.style.background='rgba(255,255,255,0.2)'} onMouseOut={e=>e.currentTarget.style.background='rgba(255,255,255,0.1)'}>✕</button>
          )}
        </div>

        <select 
          style={{ 
            background: 'var(--bg-glass)', border: '1px solid var(--border)', 
            color: 'var(--text-primary)', padding: '0 16px', borderRadius: '12px',
            fontSize: '15px', minWidth: '180px', outline: 'none', cursor: 'pointer'
          }}
          value={roleFilter}
          onChange={e => handleRoleFilterChange(e.target.value)}>
          <option value="">🔮 Tất cả phận sự</option>
          <option value="admin">👑 Khu vực Admin</option>
          <option value="teacher">📚 Khu vực Teacher</option>
          <option value="student">🎓 Khu vực Student</option>
        </select>

        <button 
          style={{
            background: 'var(--gradient-accent)', border: 'none', color: 'white',
            padding: '0 24px', borderRadius: '12px', fontSize: '15px', fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 4px 12px rgba(99,102,241,0.3)', transition: 'transform 0.2s'
          }}
          onClick={() => loadUsers(1, search, roleFilter)}
          onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          🔄 Quét Lại
        </button>
      </div>

      {/* Premium Data List */}
      {loading ? (
        <div className="loading-page" style={{ height: '400px' }}><div className="spinner" /></div>
      ) : users.length === 0 ? (
        <div style={{ background: 'var(--bg-secondary)', padding: '60px', borderRadius: '24px', textAlign: 'center', border: '1px dashed var(--border-accent)' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Không tìm thấy hồ sơ</div>
          <div style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Thử thay đổi bộ lọc hoặc khóa tìm kiếm.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {users.map((u) => {
            const isSelf = Number(u.id) === Number(user.id);
            const isProcessing = processing === u.id;
            const roleMeta = ROLE_BADGE[u.role] || ROLE_BADGE.student;

            return (
              <div key={u.id} style={{
                background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: '16px',
                padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'all 0.2s', opacity: isProcessing ? 0.6 : 1, position: 'relative', overflow: 'hidden'
              }}
              onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,0,0,0.2)'; }}
              onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                {!u.is_active && <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', background: '#ef4444' }} />}
                {isSelf && <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', background: '#6366f1' }} />}

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 2 }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '14px', background: `linear-gradient(135deg, ${roleMeta.color}30, ${roleMeta.color}10)`,
                    color: roleMeta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 800,
                    border: `1px solid ${roleMeta.color}40`, flexShrink: 0
                  }}>
                    {u.full_name ? u.full_name.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase() : 'U'}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>{u.full_name || 'Khách Vô Danh'}</strong>
                      {isSelf && <span style={{ fontSize: '10px', background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', padding: '2px 8px', borderRadius: '10px', fontWeight: 800 }}>TÔI</span>}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '16px' }}>
                      <span>🆔 {u.username}</span>
                      <span>📧 {u.email || 'Chưa cung cấp email'}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '32px', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tích Luỹ XP</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#fbbf24', marginTop: '2px' }}>{u.xp_points || 0}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Lửa Streak</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#f87171', marginTop: '2px' }}>{u.streak_days > 0 ? `🔥 ${u.streak_days}` : '—'}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, justifyContent: 'flex-end' }}>
                  <div style={{ pointerEvents: isSelf || isProcessing ? 'none' : 'auto', opacity: isSelf ? 0.5 : 1 }}>
                    <select
                      style={{
                        ...roleMeta.style,
                        padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                        outline: 'none', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', textAlign: 'center',
                        width: '180px'
                      }}
                      value={u.role}
                      onChange={e => handleRoleSelectChange(u, e.target.value)}
                    >
                      <option value="admin">👑 QUẢN TRỊ ĐẶC QUYỀN</option>
                      <option value="teacher">📚 GIẢNG VIÊN</option>
                      <option value="student">🎓 HỌC VIÊN</option>
                    </select>
                  </div>

                  {!isSelf && (
                    <button
                      onClick={() => handleToggleLock(u)}
                      disabled={isProcessing}
                      style={{
                        background: u.is_active ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                        color: u.is_active ? '#ef4444' : '#22c55e',
                        border: `1px solid ${u.is_active ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                        padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                        cursor: 'pointer', transition: 'all 0.2s', width: '90px'
                      }}
                      onMouseOver={e => e.currentTarget.style.background = u.is_active ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}
                      onMouseOut={e => e.currentTarget.style.background = u.is_active ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)'}
                    >
                      {isProcessing ? '⏳' : u.is_active ? '🔒 BAN' : '🔓 MỞ KHOÁ'}
                    </button>
                  )}
                  {isSelf && <div style={{ width: '90px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>Mặc định</div>}
                </div>
              </div>
            );
          })}

          {/* Futuristic Pagination */}
          {totalPages > 1 && (
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '32px', background: 'var(--bg-glass)', padding: '16px 24px', borderRadius: '16px', border: '1px solid var(--border)' }}>
               <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 500 }}>
                 Đang hiển thị trang <strong style={{ color: 'var(--text-primary)' }}>{page}</strong> trên tổng số <strong style={{ color: 'var(--accent)' }}>{totalPages}</strong>
               </span>
               <div style={{ display: 'flex', gap: '8px' }}>
                 <button onClick={() => goToPage(1)} disabled={page === 1} style={{ background: page===1?'transparent':'rgba(255,255,255,0.05)', color: page===1?'var(--text-muted)':'var(--text-primary)', border: '1px solid var(--border)', width: '40px', height: '40px', borderRadius: '10px', cursor: page===1?'default':'pointer' }}>«</button>
                 <button onClick={() => goToPage(page-1)} disabled={page === 1} style={{ background: page===1?'transparent':'rgba(255,255,255,0.05)', color: page===1?'var(--text-muted)':'var(--text-primary)', border: '1px solid var(--border)', width: '40px', height: '40px', borderRadius: '10px', cursor: page===1?'default':'pointer' }}>‹</button>
                 {(() => {
                   const start = Math.max(1, Math.min(page-2, totalPages-4));
                   return Array.from({ length: Math.min(5, totalPages) }, (_, i) => start+i).map(pg => (
                     <button key={pg} onClick={() => goToPage(pg)} style={{
                       background: pg === page ? 'var(--gradient-accent)' : 'rgba(255,255,255,0.05)',
                       color: pg === page ? '#fff' : 'var(--text-primary)',
                       border: pg === page ? 'none' : '1px solid var(--border)',
                       width: '40px', height: '40px', borderRadius: '10px', fontWeight: pg === page ? 800 : 500, cursor: 'pointer',
                       boxShadow: pg === page ? '0 4px 12px rgba(99,102,241,0.4)' : 'none'
                     }}>{pg}</button>
                   ));
                 })()}
                 <button onClick={() => goToPage(page+1)} disabled={page === totalPages} style={{ background: page===totalPages?'transparent':'rgba(255,255,255,0.05)', color: page===totalPages?'var(--text-muted)':'var(--text-primary)', border: '1px solid var(--border)', width: '40px', height: '40px', borderRadius: '10px', cursor: page===totalPages?'default':'pointer' }}>›</button>
                 <button onClick={() => goToPage(totalPages)} disabled={page === totalPages} style={{ background: page===totalPages?'transparent':'rgba(255,255,255,0.05)', color: page===totalPages?'var(--text-muted)':'var(--text-primary)', border: '1px solid var(--border)', width: '40px', height: '40px', borderRadius: '10px', cursor: page===totalPages?'default':'pointer' }}>»</button>
               </div>
             </div>
          )}
        </div>
      )}

      {/* Premium Confirm Modal */}
      {pendingRole && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#111827', width: '440px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>⚠️ Thiếp lập Phân Quyền</h3>
              <button onClick={() => setPendingRole(null)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ padding: '32px 24px', textAlign: 'center' }}>
              <p style={{ color: '#d1d5db', fontSize: '15px', marginBottom: '8px' }}>Xác nhận chuyển đổi chức vụ đối với hồ sơ:</p>
              <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'white', marginBottom: '24px' }}>{pendingRole.userName}</h2>
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '16px' }}>
                <span style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, ...ROLE_BADGE[pendingRole.oldRole]?.style }}>
                  {ROLE_BADGE[pendingRole.oldRole]?.label || pendingRole.oldRole}
                </span>
                <span style={{ fontSize: '24px', color: '#6b7280' }}>→</span>
                <span style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, ...ROLE_BADGE[pendingRole.newRole]?.style, boxShadow: '0 0 16px' + ROLE_BADGE[pendingRole.newRole]?.style.color.replace(')', ',0.4)') }}>
                  {ROLE_BADGE[pendingRole.newRole]?.label || pendingRole.newRole}
                </span>
              </div>
              
              {pendingRole.newRole === 'admin' && (
                <div style={{ marginTop: '24px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', padding: '16px', borderRadius: '12px', color: '#fca5a5', fontSize: '13px', textAlign: 'left', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '20px' }}>🚨</span>
                  <div>
                    <strong style={{ display: 'block', marginBottom: '4px', color: '#f87171' }}>Cảnh báo cấp độ S</strong>
                    Người dùng sẽ có đặc quyền xâm nhập mọi ngóc ngách của hệ thống, quản lý cơ sở dữ liệu và xử lý quyền hạn.
                  </div>
                </div>
              )}
            </div>
            
            <div style={{ padding: '20px 24px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '12px' }}>
              <button 
                style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => setPendingRole(null)}>
                Trở Lại
              </button>
              <button 
                style={{ flex: 1, padding: '12px', borderRadius: '12px', background: pendingRole.newRole === 'admin' ? '#ef4444' : 'var(--gradient-accent)', border: 'none', color: 'white', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
                onClick={confirmRoleChange}>
                Đồng Ý Cấp Phép
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
