import React, { useEffect, useState, useMemo } from 'react';

const api = typeof window !== 'undefined' ? window['electronAPI'] : null;

// Thống nhất từ ngữ sang chuẩn tiếng Việt cao cấp
const REVIEW_ACTIONS = [
  { value: 'approved', label: '✅ Xác Nhận An Toàn' },
  { value: 'warning', label: '⚠️ Nhắc Nhở Vi Phạm' },
  { value: 'invalidated', label: '❌ Huỷ Kết Quả' },
];

const RISK_MAP = {
  clean: { label: 'AN TOÀN', color: '#4ade80', bg: 'rgba(34,197,94,0.1)' },
  low: { label: 'RỦI RO THẤP', color: '#60a5fa', bg: 'rgba(59,130,246,0.1)' },
  medium: { label: 'NHIỀU NGHI VẤN', color: '#facc15', bg: 'rgba(250,204,21,0.1)' },
  high: { label: 'NGUY HIỂM', color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
  critical: { label: 'VI PHẠM NẶNG', color: '#e11d48', bg: 'rgba(225,29,72,0.15)' }
};

export default function CheatingReportsPage({ user, showToast }) {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  
  const [selected, setSelected] = useState(null);
  const [reviewAction, setReviewAction] = useState('approved');
  const [reviewNote, setReviewNote] = useState('');

  const [filterReview, setFilterReview] = useState('all');
  const [selectedExamId, setSelectedExamId] = useState('all');

  useEffect(() => { loadReports(); }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const res = await api.cheat.getAll({}, { id: user.id });
      if (res.success) setReports(res.reports || []);
      else showToast(res.message || 'Không thể tải hệ thống phòng chống gian lận', 'error');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  const openDetail = async (row) => {
    try {
      const res = await api.cheat.getReport(row.attempt_id);
      if (res.success && res.report) {
        setSelected(res.report);
        setReviewAction(res.report.review_action || 'approved');
        setReviewNote(res.report.review_note || '');
      }
    } catch (e) { showToast(e.message, 'error'); }
  };

  const submitReview = async () => {
    if (!selected) return;
    try {
      const res = await api.cheat.reviewReport(selected.id, {
        reviewedBy: user.id,
        action: reviewAction,
        note: reviewNote,
      }, { id: user.id });
      if (!res.success) return showToast(res.message || 'Xử lý thất bại', 'error');
      showToast('Đã lưu quy định xử lý hệ thống', 'success');
      setSelected(null);
      loadReports();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const filteredReports = useMemo(() => {
    let result = reports;
    if (selectedExamId !== 'all') {
      result = result.filter(r => String(r.exam_id) === String(selectedExamId));
    }
    if (filterReview === 'pending') result = result.filter(r => !r.review_action);
    if (filterReview === 'reviewed') result = result.filter(r => !!r.review_action);
    return result;
  }, [reports, filterReview, selectedExamId]);

  const uniqueExams = useMemo(() => {
    const map = {};
    for (const r of reports) {
      if (r.exam_id) map[r.exam_id] = r.exam_title;
    }
    return Object.entries(map).map(([id, title]) => ({ id, title }));
  }, [reports]);

  return (
    <div className="page" style={{ padding: '32px', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      
      {/* Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(185,28,28,0.9) 0%, rgba(153,27,27,0.9) 50%, rgba(127,29,29,0.9) 100%)',
        borderRadius: '24px', padding: '32px', marginBottom: '32px', border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', right: '-10%', top: '-20%', width: '300px', height: '300px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', filter: 'blur(50px)', zIndex: 0 }}></div>
        
        <div style={{ position: 'relative', zIndex: 2 }}>
          <h1 style={{ fontSize: '36px', fontWeight: 900, color: 'white', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', textShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '40px' }}>🛡️</span> Hệ Thống Chống Gian Lận
          </h1>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.9)', textShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            Theo dõi hành vi bất thường, phát hiện cảnh báo và xử lý học viên vi phạm quy chế thi.
          </p>
        </div>
        
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <select 
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '14px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, outline: 'none', cursor: 'pointer', maxWidth: '300px' }}
            value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)}
          >
            <option value="all">📚 Mọi Bài Thi ({reports.length} Logs)</option>
            {uniqueExams.map(ex => (
               <option key={ex.id} value={ex.id}>📋 {ex.title}</option>
            ))}
          </select>
          <select 
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '14px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, outline: 'none', cursor: 'pointer' }}
            value={filterReview} onChange={e => setFilterReview(e.target.value)}
          >
            <option value="all">Trạng Thái Xử Lý (Tất Cả)</option>
            <option value="pending">⚠️ Chỉ Chờ Duyệt</option>
            <option value="reviewed">✅ Đã Xử Lý</option>
          </select>
          <button 
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '14px 24px', borderRadius: '12px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', backdropFilter: 'blur(10px)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={loadReports}
          >
            <span>🔄</span> Quét Lại Máy Chủ
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}><div className="spinner" style={{ transform: 'scale(1.5)', borderColor: 'rgba(239,68,68,0.2)', borderTopColor: '#ef4444' }} /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {filteredReports.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', background: 'var(--bg-secondary)', padding: '60px', borderRadius: '24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.5 }}>✨</div>
              <h3 style={{ fontSize: '20px', color: 'white', fontWeight: 800, marginBottom: '8px' }}>Ghi Nhận An Toàn</h3>
              <p style={{ color: 'var(--text-muted)' }}>Không có đối tượng gian lận nào theo bộ lọc hiện tại.</p>
            </div>
          ) : (
            filteredReports.map(r => {
              const risk = RISK_MAP[r.risk_level] || RISK_MAP.clean;
              return (
                <div key={r.id} style={{
                  background: 'var(--bg-glass)', border: `1px solid ${risk.bg}`, borderRadius: '20px', padding: '24px',
                  display: 'flex', flexDirection: 'column', transition: 'all 0.2s', boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                  position: 'relative', overflow: 'hidden'
                }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: risk.color }}></div>
                  <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '100px', height: '100px', background: risk.bg, filter: 'blur(30px)', borderRadius: '50%' }}></div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                     <div>
                       <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Học Viên</div>
                       <div style={{ fontSize: '18px', fontWeight: 800, color: 'white', marginTop: '4px' }}>{r.student_name}</div>
                     </div>
                     <div style={{ background: risk.bg, color: risk.color, padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 800, border: `1px solid ${risk.color}40` }}>
                        {risk.label}
                     </div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '16px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                     <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}><strong>Bài thi:</strong> <span style={{ color: '#60a5fa' }}>{r.exam_title}</span></div>
                     <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}><strong>Điểm hệ thống:</strong> <span style={{ color: '#4ade80', fontWeight: 800 }}>{r.score ?? 'Chưa chấm'}</span></div>
                     <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                           <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Điểm Rủi Ro (Score)</span>
                           <span style={{ fontSize: '20px', fontWeight: 900, color: risk.color }}>{r.risk_score}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                           <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Số Sự Kiện Bắt Được</span>
                           <span style={{ fontSize: '20px', fontWeight: 900, color: 'white' }}>{r.total_events}</span>
                        </div>
                     </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                     <div>
                       {r.review_action ? (
                          <span style={{ fontSize: '13px', fontWeight: 700, color: r.review_action === 'invalidated' ? '#ef4444' : r.review_action === 'warning' ? '#f59e0b' : '#22c55e' }}>
                            {REVIEW_ACTIONS.find(a => a.value === r.review_action)?.label || r.review_action}
                          </span>
                       ) : (
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Chưa xét duyệt</span>
                       )}
                     </div>
                     <button 
                       style={{ background: 'white', color: 'black', border: 'none', padding: '10px 20px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 800, transition: '0.2s' }}
                       onMouseOver={e=>e.currentTarget.style.transform='scale(1.05)'} onMouseOut={e=>e.currentTarget.style.transform='scale(1)'}
                       onClick={() => openDetail(r)}
                     >
                       MỞ HỒ SƠ 👁️
                     </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Review Modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSelected(null)}>
          <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', width: '90%', maxWidth: '800px', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            
            <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'linear-gradient(90deg, rgba(225,29,72,0.1) 0%, rgba(0,0,0,0) 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'white', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                🛡️ Báo Cáo Vi Phạm (Lượt thi số: #{selected.attempt_id})
              </h3>
              <button style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '24px', cursor: 'pointer' }} onClick={() => setSelected(null)}>✕</button>
            </div>

            <div style={{ padding: '32px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '24px' }}>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Đánh Giá Mức Độ</div>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: RISK_MAP[selected.risk_level]?.color || '#fff', marginTop: '4px' }}>{RISK_MAP[selected.risk_level]?.label || 'BÌNH THƯỜNG'}</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Điểm Bất Thường</div>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: 'white', marginTop: '4px' }}>{selected.risk_score}</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Số Lần Xảy Ra</div>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: 'white', marginTop: '4px' }}>{selected.total_events}</div>
                </div>
              </div>

              <h4 style={{ fontSize: '15px', fontWeight: 800, color: 'white', marginBottom: '12px' }}>📝 Nhật Ký Hoạt Động Của Thí Sinh</h4>
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', maxHeight: '280px', overflowY: 'auto', marginBottom: '24px' }}>
                {selected.events?.length > 0 ? selected.events.map((e, idx) => (
                  <div key={e.id} style={{ padding: '16px', borderBottom: idx === selected.events.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '16px' }}>
                    <div style={{ fontSize: '20px' }}>
                      {e.event_type.includes('blur') || e.event_type.includes('visibility') ? '👀' : e.event_type.includes('fullscreen') ? '🖥️' : e.event_type.includes('copy') ? '📋' : '⚠️'}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                         <span style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>{e.event_type}</span>
                         <span style={{ fontSize: '11px', background: 'rgba(239,68,68,0.2)', color: '#fca5a5', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>Trọng số: {e.weight}</span>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>{new Date(e.event_at).toLocaleString('vi-VN')}</div>
                      {e.detail && <div style={{ fontSize: '13px', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: '6px' }}>{e.detail}</div>}
                    </div>
                  </div>
                )) : (
                  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>Không có log chi tiết</div>
                )}
              </div>

              <h4 style={{ fontSize: '15px', fontWeight: 800, color: 'white', marginBottom: '12px' }}>⚖️ Quyết Định Của Quản Trị Viên</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) 2fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '8px' }}>BIỆN PHÁP XỬ LÝ</label>
                  <select style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '12px 16px', borderRadius: '12px', fontSize: '14px', outline: 'none' }} value={reviewAction} onChange={e => setReviewAction(e.target.value)}>
                    {REVIEW_ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '8px' }}>GHI CHÚ KỶ LUẬT</label>
                  <textarea 
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '12px 16px', borderRadius: '12px', fontSize: '14px', minHeight: '80px', outline: 'none', resize: 'vertical' }} 
                    placeholder="Nhập lý do hoặc chi tiết về quyết định kỷ luật (hoặc châm trước)..."
                    value={reviewNote} onChange={e => setReviewNote(e.target.value)} 
                  />
                </div>
              </div>
            </div>

            <div style={{ padding: '24px 32px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'flex-end', gap: '16px' }}>
              <button style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', padding: '12px 24px', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }} onClick={() => setSelected(null)}>HUỶ THAO TÁC</button>
              <button style={{ background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)', border: 'none', color: 'white', padding: '12px 32px', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 24px rgba(225,29,72,0.4)' }} onClick={submitReview}>💾 THỰC THI QUY ĐỊNH</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
