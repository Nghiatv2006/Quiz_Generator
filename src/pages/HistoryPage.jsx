import React, { useState, useEffect, useCallback } from 'react';

const api = typeof window !== 'undefined' ? window['electronAPI'] : null;

const STATUS_LABELS = {
  completed:   { label: 'Hoàn Thành ✓', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  in_progress: { label: 'Đang Làm Bài ⏳',   color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  timed_out:   { label: 'Hết Giờ Làm Bài ⏰',    color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  banned:      { label: 'Đình Chỉ Thi ❌', color: '#be123c', bg: 'rgba(225,29,72,0.15)' },
};

function formatTime(secs) {
  if (secs === null || secs === undefined || secs === '') return '—';
  const safeSecs = Math.max(0, Number(secs) || 0);
  const m = Math.floor(safeSecs / 60);
  const s = safeSecs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(dt) {
  if (!dt) return '—';
  try {
    return new Date(dt).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

function getScoreColor(score, isPassed) {
  if (score == null) return 'var(--text-muted)';
  if (isPassed)      return '#10b981';
  if (score === 0)   return 'var(--text-muted)';
  return '#ef4444';
}

export default function HistoryPage({ user, showToast, navigateTo }) {
  const [attempts,    setAttempts]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [pagination,  setPagination]  = useState({ page: 1, totalPages: 1, total: 0 });
  const [filterStatus, setFilterStatus] = useState('');
  const [searchText,  setSearchText]  = useState('');
  const [stats,       setStats]       = useState(null);

  const PAGE_SIZE = 20;

  const loadHistory = useCallback(async (page = 1, status = filterStatus) => {
    if (!api || !user?.id) return;
    setLoading(true);
    try {
      const res = await api.attempts.getHistory({
        userId: user.id, page, limit: PAGE_SIZE,
        status: status || undefined,
      });
      if (res.success) {
        setAttempts(res.attempts || []);
        setPagination(res.pagination || { page: 1, totalPages: 1, total: 0 });

        if (page === 1 && !status) {
          const completed = (res.attempts || []).filter(a => a.status === 'completed');
          const passed    = completed.filter(a => a.is_passed);
          const avgScore  = completed.length
            ? (completed.reduce((s, a) => s + (a.score || 0), 0) / completed.length).toFixed(1)
            : null;
          setStats({
            total: res.pagination?.total || 0,
            completed: completed.length,
            passed: passed.length,
            avgScore,
            passRate: completed.length ? Math.round(passed.length / completed.length * 100) : 0,
          });
        }
      } else {
        showToast('Lỗi truy xuất hệ thống: ' + res.message, 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('Lỗi đường truyền tín hiệu: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [user?.id, filterStatus]); 

  useEffect(() => { loadHistory(1); }, []);

  const handleFilterChange = (status) => {
    setFilterStatus(status);
    loadHistory(1, status);
  };

  const handlePageChange = (p) => {
    loadHistory(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const displayed = searchText
    ? attempts.filter(a =>
        (a.exam_title || '').toLowerCase().includes(searchText.toLowerCase()) ||
        (a.topic_name || '').toLowerCase().includes(searchText.toLowerCase())
      )
    : attempts;

  return (
    <div className="page" style={{ padding: '32px', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      
      {/* Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(88,28,135,0.9) 0%, rgba(30,58,138,0.9) 100%)',
        borderRadius: '24px', padding: '32px', marginBottom: '32px', border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', right: '-10%', bottom: '-20%', width: '300px', height: '300px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', filter: 'blur(50px)', zIndex: 0 }}></div>
        
        <div style={{ position: 'relative', zIndex: 2 }}>
          <h1 style={{ fontSize: '36px', fontWeight: 900, color: 'white', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', textShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '40px' }}>📈</span> CSDL Lịch Sử Đào Tạo
          </h1>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)', textShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            Kiểm tra vết tích toàn bộ các chặng bài kiểm tra đã lưu trong hệ thống.
          </p>
        </div>
        
        <div style={{ position: 'relative', zIndex: 2 }}>
          <button 
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '14px 24px', borderRadius: '12px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', backdropFilter: 'blur(10px)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={() => loadHistory(pagination.page)} disabled={loading}
          >
            <span>🔄</span> TRUY XUẤT LẠI DỮ LIỆU
          </button>
        </div>
      </div>

      {/* ─── Stats summary ─── */}
      {stats && !filterStatus && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {[
            { icon: '📝', val: stats.total,      label: 'Tổng Mệnh Lệnh Khởi Tạo', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
            { icon: '✅', val: stats.completed,  label: 'Đã Kết Thúc Thành Công',   color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
            { icon: '🏆', val: stats.passed,     label: 'Đạt Phiếu Thăng Hạng',     color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
            { icon: '📊', val: stats.avgScore ?? '—', label: 'Điểm Trung Bình (TB)',color: '#facc15', bg: 'rgba(250,204,21,0.1)' },
            { icon: '💯', val: `${stats.passRate}%`,  label: 'Tỷ Lệ Sống Sót',      color: '#ec4899', bg: 'rgba(236,72,153,0.1)' },
          ].map(({ icon, val, label, color, bg }) => (
            <div key={label} style={{ background: 'var(--bg-glass)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: color }} />
              <div style={{ position: 'absolute', top: '10px', left: '10px', width: '60px', height: '60px', background: bg, borderRadius: '50%', filter: 'blur(20px)', zIndex: 0 }} />
              
              <div style={{ fontSize: '28px', marginBottom: '8px', zIndex: 2 }}>{icon}</div>
              <div style={{ fontSize: '32px', fontWeight: 900, color: 'white', zIndex: 2, marginBottom: '4px', textShadow: `0 0 20px ${bg}` }}>{val}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800, textAlign: 'center', zIndex: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Toolbar: Filter + Search ─── */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', background: 'var(--bg-glass)', padding: '16px', borderRadius: '20px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { val: '',            label: 'Tất cả Bản Lịch Sử' },
            { val: 'completed',   label: '✅ Đã Kết Thúc' },
            { val: 'in_progress', label: '⏳ Đang Quá Trình' },
            { val: 'timed_out',   label: '⏰ Quá Thời Gian' },
            { val: 'banned',      label: '❌ Vi Phạm Quy Chế' },
          ].map(f => (
            <button key={f.val}
              onClick={() => handleFilterChange(f.val)}
              style={{
                padding: '10px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s', border: 'none',
                background: filterStatus === f.val ? 'linear-gradient(135deg, #4f46e5, #3b82f6)' : 'rgba(255,255,255,0.05)',
                color: filterStatus === f.val ? '#fff' : 'var(--text-muted)',
                boxShadow: filterStatus === f.val ? '0 4px 12px rgba(79,70,229,0.3)' : 'none'
              }}>
              {f.label}
            </button>
          ))}
        </div>
        
        <div style={{ flex: 1, minWidth: '250px', display: 'flex', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '10px 16px', alignItems: 'center' }}>
          <span style={{ fontSize: '18px', marginRight: '10px', filter: 'grayscale(1)' }}>🔍</span>
          <input 
            placeholder="Tìm theo chủ đề mật mã bài thi..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: 'white', flex: 1, outline: 'none', fontSize: '14px', fontWeight: 500 }}
          />
        </div>

        {pagination.total > 0 && (
          <div style={{ fontSize: '13px', color: '#93c5fd', fontWeight: 800, background: 'rgba(59,130,246,0.1)', padding: '10px 20px', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)' }}>
            Quét thấy: {pagination.total} Bản ghi <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>•</span> Trang {pagination.page}/{pagination.totalPages}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '100px 0', textAlign: 'center' }}>
          <div className="spinner" style={{ transform: 'scale(1.5)', borderColor: 'rgba(79,70,229,0.2)', borderTopColor: '#4f46e5' }} />
          <p style={{ marginTop: '24px', color: 'var(--text-muted)', fontSize: '14px', fontWeight: 600 }}>Hệ thống đang trích lục dữ liệu...</p>
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ background: 'var(--bg-glass)', borderRadius: '24px', border: '1px dashed rgba(255,255,255,0.1)', padding: '60px', textAlign: 'center' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.5, filter: 'grayscale(1)' }}>{searchText ? '🔍' : '🗄️'}</div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: 'white', marginBottom: '8px' }}>
            {searchText ? 'Không Tìm Thấy Tín Hiệu Khớp' : 'CSDL Tuyệt Đối Trống'}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            {searchText ? 'Hãy xoá bộ lọc và thử bằng một tiêu điểm khác.' : 'Trạng thái dữ liệu hiện đang sạch. Bạn chưa thực thi khảo hạch nào ở hệ thống.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
           {displayed.map((a, i) => {
              const rowNum  = (pagination.page - 1) * PAGE_SIZE + i + 1;
              const stMeta  = STATUS_LABELS[a.status] || { label: a.status, color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' };

              return (
                 <div key={a.id} style={{ 
                    display: 'flex', alignItems: 'center', background: 'var(--bg-glass)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '20px', padding: '20px 24px', gap: '20px', transition: 'all 0.2s', position: 'relative', overflow: 'hidden'
                 }} onMouseOver={e=>e.currentTarget.style.transform='translateY(-2px)'} onMouseOut={e=>e.currentTarget.style.transform='none'}>
                    
                    {a.status === 'completed' && a.is_passed === 1 && <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '4px', background: '#10b981' }}></div>}
                    {a.status === 'completed' && a.is_passed === 0 && <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '4px', background: '#ef4444' }}></div>}
                    {a.status !== 'completed' && <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '4px', background: stMeta.color }}></div>}

                    {/* Number */}
                    <div style={{ fontSize: '20px', fontWeight: 900, color: 'rgba(255,255,255,0.1)', width: '30px' }}>
                       {String(rowNum).padStart(2, '0')}
                    </div>

                    {/* Titles */}
                    <div style={{ flex: 2, minWidth: '200px' }}>
                       <div style={{ fontSize: '15px', fontWeight: 800, color: 'white', marginBottom: '6px' }}>
                          {a.exam_title || `Bài thi mã hoá #${a.exam_id}`}
                       </div>
                       <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          {a.topic_name ? (
                             <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '8px', fontWeight: 700 }}>
                                {a.topic_name}
                             </span>
                          ) : (
                             <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Chủ đề ẩn</span>
                          )}
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>⏱️ {formatTime(a.time_taken_seconds)}</span>
                       </div>
                    </div>

                    {/* Score */}
                    <div style={{ flex: 1, minWidth: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                       <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Điểm Số Cuối</span>
                       <span style={{ fontSize: '24px', fontWeight: 900, color: getScoreColor(a.score, a.is_passed), textShadow: a.score != null ? `0 0 10px ${getScoreColor(a.score, a.is_passed)}40` : 'none' }}>
                          {a.score != null ? a.score : '—'}
                       </span>
                    </div>

                    {/* Correct/Wrong stats */}
                    <div style={{ flex: 1, minWidth: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                       <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Tỷ Lệ Đúng</span>
                       {a.status === 'completed' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.3)', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                             <span style={{ color: '#34d399', fontWeight: 800, fontSize: '14px' }}>{a.correct_count ?? '—'}</span>
                             <span style={{ color: 'var(--text-muted)' }}>/</span>
                             <span style={{ color: '#f87171', fontWeight: 800, fontSize: '14px' }}>{a.wrong_count ?? '—'}</span>
                          </div>
                       ) : (
                          <span style={{ color: 'var(--text-muted)', fontWeight: 800, fontSize: '14px' }}>—</span>
                       )}
                    </div>

                    {/* Status & Date */}
                    <div style={{ flex: 2, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '32px' }}>
                       <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                          <span style={{ background: stMeta.bg, color: stMeta.color, fontSize: '12px', fontWeight: 800, padding: '6px 12px', borderRadius: '16px', border: `1px solid ${stMeta.color}40`, display: 'flex', alignItems: 'center', gap: '4px' }}>
                             {stMeta.label}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>🕒 {formatDate(a.started_at)}</span>
                       </div>
                       
                       {/* Action Button */}
                       <div style={{ width: '50px', display: 'flex', justifyContent: 'center' }}>
                          {a.status === 'completed' ? (
                             <button onClick={() => navigateTo('exam-result', { attemptId: a.id })} style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }} onMouseOver={e=>e.currentTarget.style.background='rgba(59,130,246,0.2)'} onMouseOut={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'} title="Kéo Xuất Báo Cáo Phân Tích Hiện Trường">
                                👁️
                             </button>
                          ) : (
                             <span style={{ fontSize: '18px', opacity: 0.2, filter: 'grayscale(1)' }}>🔒</span>
                          )}
                       </div>
                    </div>
                 </div>
              );
           })}

           {/* ─── Pagination ─── */}
           {pagination.totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '32px' }}>
                 <button disabled={pagination.page <= 1} onClick={() => handlePageChange(pagination.page - 1)} style={{ background: 'rgba(255,255,255,0.05)', color: pagination.page <= 1 ? 'var(--text-muted)' : 'white', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 20px', borderRadius: '12px', fontWeight: 800, cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer' }}>
                    ← QUAY LUI
                 </button>
                 
                 <div style={{ display: 'flex', gap: '6px' }}>
                 {Array.from({ length: Math.min(7, pagination.totalPages) }, (_, i) => {
                    let pageNum;
                    if (pagination.totalPages <= 7) pageNum = i + 1;
                    else if (pagination.page <= 4) pageNum = i + 1;
                    else if (pagination.page >= pagination.totalPages - 3) pageNum = pagination.totalPages - 6 + i;
                    else pageNum = pagination.page - 3 + i;
                    
                    return (
                       <button key={pageNum} onClick={() => handlePageChange(pageNum)} style={{ width: '44px', height: '44px', borderRadius: '12px', border: 'none', background: pagination.page === pageNum ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : 'rgba(255,255,255,0.05)', color: pagination.page === pageNum ? '#fff' : 'var(--text-secondary)', fontWeight: 900, cursor: 'pointer', transition: '0.2s', boxShadow: pagination.page === pageNum ? '0 4px 12px rgba(59,130,246,0.4)' : 'none' }}>
                          {pageNum}
                       </button>
                    );
                 })}
                 </div>

                 <button disabled={pagination.page >= pagination.totalPages} onClick={() => handlePageChange(pagination.page + 1)} style={{ background: 'rgba(255,255,255,0.05)', color: pagination.page >= pagination.totalPages ? 'var(--text-muted)' : 'white', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 20px', borderRadius: '12px', fontWeight: 800, cursor: pagination.page >= pagination.totalPages ? 'not-allowed' : 'pointer' }}>
                    TIẾP TỚI →
                 </button>
              </div>
           )}
        </div>
      )}
    </div>
  );
}
