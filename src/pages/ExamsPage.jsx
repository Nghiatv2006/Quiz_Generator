import React, { useState, useEffect, useCallback, useRef } from 'react';

const api = typeof window !== 'undefined' ? window['electronAPI'] : null;

// ── Constants ──────────────────────────────────────────────────
const PAGE_SIZE = 12;
const STATUS_MAP = {
  draft:  { label: 'Bản Nháp',      badge: 'border: 1px solid rgba(245,158,11,0.5)', color: '#fcd34d', bg: 'rgba(245,158,11,0.1)', icon: '📋' },
  active: { label: 'Đang Mở',   badge: 'border: 1px solid rgba(34,197,94,0.5)', color: '#86efac', bg: 'rgba(34,197,94,0.1)', icon: '🟢' },
  closed: { label: 'Đã Đóng',   badge: 'border: 1px solid rgba(239,68,68,0.5)', color: '#fca5a5', bg: 'rgba(239,68,68,0.1)', icon: '🔒' },
};
const DEFAULT_FORM = {
  title: '', description: '', topicId: '', durationMinutes: 60, passingScore: 5, maxAttempts: '', accessCode: '', status: 'draft',
  shuffleQuestions: true, shuffleOptions: false, showResult: true, showExplanation: true, allowAiExplain: true, isAdaptive: false,
  enableAntiCheat: true, requireFullscreen: false, questionIds: [],
};

export default function ExamsPage({ user, showToast }) {
  const [exams,    setExams]    = useState([]);
  const [topics,   setTopics]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters,  setFilters]  = useState({ status: '', topicId: '', search: '' });

  const [showModal,  setShowModal]  = useState(false);
  const [editExam,   setEditExam]   = useState(null);
  const [form,       setForm]       = useState(DEFAULT_FORM);
  const [saving,     setSaving]     = useState(false);
  const [deleting,   setDeleting]   = useState(null);
  const [modalTab,   setModalTab]   = useState('info'); 
  const [examAttempts, setExamAttempts] = useState([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);

  const [qSearch,   setQSearch]   = useState('');
  const [qTopic,    setQTopic]    = useState('');
  const [qResults,  setQResults]  = useState([]);
  const [qLoading,  setQLoading]  = useState(false);
  const [pickedMap, setPickedMap] = useState({}); 

  const canManage = ['admin', 'teacher'].includes(user?.role?.toLowerCase());
  const searchTimer = useRef(null);

  const loadExams = useCallback(async (pg = 1, f = filters) => {
    if (!api) return;
    setLoading(true);
    try {
      const res = await api.exams.getAll({ ...f, page: pg, limit: PAGE_SIZE }, { id: user.id });
      if (res.success) {
        setExams(res.exams || []); setTotal(res.total || 0); setTotalPages(res.totalPages || 1); setPage(pg);
      } else { showToast(res.message || 'Không tải được danh sách bài thi', 'error'); }
    } catch (err) { showToast('Lỗi kết nối: ' + err.message, 'error'); } 
    finally { setLoading(false); }
  }, []);

  const loadTopics = useCallback(async () => {
    if (!api) return;
    try { const res = await api.topics.getAll({ limit: 200 }); if (res.success) setTopics(res.topics || []); } catch { }
  }, []);

  useEffect(() => { loadTopics(); loadExams(1, filters); }, []);

  const handleFilterChange = (key, val) => { const newF = { ...filters, [key]: val }; setFilters(newF); if (key !== 'search') { setPage(1); loadExams(1, newF); } };
  const handleSearchChange = (val) => { const newF = { ...filters, search: val }; setFilters(newF); clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => loadExams(1, newF), val ? 400 : 0); };

  const goToPage = (pg) => loadExams(Math.max(1, Math.min(totalPages, pg)), filters);

  const openCreate = () => {
    const initialTopic = String(filters.topicId || '');
    setEditExam(null); setForm({ ...DEFAULT_FORM, topicId: initialTopic }); setPickedMap({}); setQSearch(''); setQTopic(initialTopic); setQResults([]); setModalTab('info'); setShowModal(true);
  };

  const openEdit = async (exam) => {
    setEditExam(exam); setModalTab('info'); setSaving(false);
    let questionIds = []; let pickedInit  = {};
    try {
      const res = await api.exams.getById(exam.id);
      if (res.success) { questionIds = (res.exam.questions || []).map(q => q.id); for (const q of res.exam.questions || []) pickedInit[q.id] = q; }
    } catch { }

    setForm({
      title: exam.title || '', description: exam.description || '', topicId: exam.topic_id || '', durationMinutes: exam.duration_minutes || 60, passingScore: exam.passing_score || 5, maxAttempts: exam.max_attempts || '', accessCode: exam.access_code || '', status: exam.status || 'draft',
      shuffleQuestions: !!exam.shuffle_questions, shuffleOptions: !!exam.shuffle_options, showResult: exam.show_result !== false && exam.show_result !== 0, showExplanation: exam.show_explanation !== false && exam.show_explanation !== 0, allowAiExplain: exam.allow_ai_explain !== false && exam.allow_ai_explain !== 0,
      isAdaptive: !!exam.is_adaptive, enableAntiCheat: exam.enable_anti_cheat !== false && exam.enable_anti_cheat !== 0, requireFullscreen: !!exam.require_fullscreen, questionIds,
    });
    setPickedMap(pickedInit); setQSearch(''); setQTopic(String(exam.topic_id || '')); setQResults([]); setShowModal(true);
  };

  const closeModal = () => { if (saving) return; setShowModal(false); setEditExam(null); };

  const handleSave = async () => {
    const title = form.title.trim();
    if (!title) { showToast('Tên bài thi không được để trống', 'error'); return; }
    if (!form.topicId) { showToast('Vui lòng chọn chủ đề', 'error'); return; }
    if (form.durationMinutes < 1) { showToast('Thời gian thi phải lớn hơn 0', 'error'); return; }

    setSaving(true);
    try {
      const payload = { ...form, title, description: form.description.trim() || null, questionIds: form.questionIds, createdBy: user.id };
      let res = editExam ? await api.exams.update(editExam.id, payload, { id: user.id, role: user.role }) : await api.exams.create(payload, { id: user.id, role: user.role });
      if (res.success) { showToast(editExam ? '✅ Cập nhật thành công!' : '✅ Tạo bài thi thành công!', 'success'); closeModal(); loadExams(editExam ? page : 1, filters); } 
      else { showToast(res.message || 'Lưu thất bại', 'error'); }
    } catch (err) { showToast('Lỗi: ' + err.message, 'error'); } 
    finally { setSaving(false); }
  };

  const handleDelete = async (exam) => {
    if (!confirm(`Bạn có chắc chắn muốn xoá bài thi "${exam.title}"?`)) return;
    setDeleting(exam.id);
    try {
      const res = await api.exams.delete(exam.id, { id: user.id, role: user.role });
      if (res.success) {
        showToast(`🗑️ Đã xóa bài thi "${exam.title}"`, 'success');
        const newTotal = total - 1; const newPages = Math.max(1, Math.ceil(newTotal / PAGE_SIZE));
        loadExams(page > newPages ? newPages : page, filters);
      } else { showToast(res.message || 'Xóa bài thi thất bại', 'error'); }
    } catch (err) { showToast('Lỗi: ' + err.message, 'error'); } 
    finally { setDeleting(null); }
  };

  const handleStatusChange = async (exam, newStatus) => {
    try {
      const res = await api.exams.update(exam.id, { status: newStatus }, { id: user.id, role: user.role });
      if (res.success) { showToast(`Cập nhật trạng thái: ${STATUS_MAP[newStatus]?.label}`, 'success'); loadExams(page, filters); } 
      else showToast(res.message || 'Cập nhật thất bại', 'error');
    } catch (err) { showToast('Lỗi: ' + err.message, 'error'); }
  };

  const searchQuestions = useCallback(async (q = qSearch, tid = qTopic) => {
    if (!api) return;
    setQLoading(true);
    try {
      const res = await api.questions.getAll({ search: (q || '').trim() || undefined, topicId: tid ? Number(tid) : undefined, page: 1, limit: 100 });
      if (res.success) setQResults(res.questions || []); else setQResults([]);
    } catch { setQResults([]); } 
    finally { setQLoading(false); }
  }, [qSearch, qTopic]);

  const loadExamAttempts = async (eId) => {
    if (!api) return;
    setLoadingAttempts(true);
    try {
      const res = await api.exams.getAttempts(eId, { id: user.id, role: user.role });
      if (res.success) setExamAttempts(res.attempts || []);
      else showToast(res.message || 'Lỗi tải danh sách người thi', 'error');
    } catch (err) { showToast('Lỗi: ' + err.message, 'error'); } 
    finally { setLoadingAttempts(false); }
  };

  useEffect(() => { if (!showModal || modalTab !== 'questions') return; searchQuestions(qSearch, qTopic); }, [showModal, modalTab]);

  useEffect(() => {
    if (showModal && modalTab === 'attempts' && editExam) {
      loadExamAttempts(editExam.id);
    }
  }, [showModal, modalTab, editExam]);

  const addQuestion = (q) => { if (pickedMap[q.id]) return; const newMap = { ...pickedMap, [q.id]: q }; setPickedMap(newMap); setForm(f => ({ ...f, questionIds: Object.keys(newMap).map(Number) })); };
  const removeQuestion = (qId) => { const newMap = { ...pickedMap }; delete newMap[qId]; setPickedMap(newMap); setForm(f => ({ ...f, questionIds: Object.keys(newMap).map(Number) })); };
  const addAllQuestions = () => {
    if (!qResults.length) return;
    const newMap = { ...pickedMap }; for (const q of qResults) { if (!newMap[q.id]) newMap[q.id] = q; }
    setPickedMap(newMap); setForm(f => ({ ...f, questionIds: Object.keys(newMap).map(Number) }));
  };

  const DIFF_COLOR = { easy: '#4ade80', medium: '#fbbf24', hard: '#f87171' };
  const inputStyle = { background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'white', padding: '12px 16px', borderRadius: '12px', fontSize: '14px', outline: 'none' };

  return (
    <div className="page" style={{ padding: '32px', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      
      {/* Premium Hero Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30,58,138,1) 0%, rgba(29,78,216,1) 100%)',
        borderRadius: '24px', padding: '32px', marginBottom: '32px', border: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden', flexWrap: 'wrap', gap: '20px'
      }}>
        {/* Glow Effects */}
        <div style={{ position: 'absolute', right: '-10%', top: '-20%', width: '300px', height: '300px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', filter: 'blur(50px)', zIndex: 0 }}></div>
        <div style={{ position: 'absolute', left: '-5%', bottom: '-20%', width: '200px', height: '200px', background: 'rgba(96,165,250,0.3)', borderRadius: '50%', filter: 'blur(60px)', zIndex: 0 }}></div>
        
        <div style={{ position: 'relative', zIndex: 2 }}>
          <h1 style={{ fontSize: '36px', fontWeight: 900, color: 'white', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', textShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '40px' }}>📝</span> Quản lý Bài thi
          </h1>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)', textShadow: '0 2px 8px rgba(0,0,0,0.1)', maxWidth: '600px' }}>
            Hệ thống đang lưu trữ và quản lý {total > 0 ? total : 0} bài kiểm tra trên dữ liệu.
          </p>
        </div>
        
        {canManage && (
          <div style={{ position: 'relative', zIndex: 2 }}>
            <button 
              onClick={openCreate}
              style={{ background: 'white', color: '#1e3a8a', padding: '16px 24px', borderRadius: '16px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px', border: 'none' }}
              onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <span style={{ fontSize: '20px' }}>➕</span> Tạo Bài Thi Mới
            </button>
          </div>
        )}
      </div>

      {/* Modern Filter Bar */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap', background: 'var(--bg-secondary)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border)', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
           <span style={{ position: 'absolute', left: '16px', top: '15px', color: 'var(--text-muted)' }}>🔍</span>
           <input
             style={{ ...inputStyle, width: '100%', paddingLeft: '44px' }}
             placeholder="Tìm kiếm bài thi..."
             value={filters.search} onChange={e => handleSearchChange(e.target.value)}
           />
        </div>

        <select style={{ ...inputStyle, width: '180px' }} value={filters.status} onChange={e => handleFilterChange('status', e.target.value)}>
          <option value="">⚙️ Mọi Trạng Thái</option>
          <option value="draft">📋 Bản Nháp</option>
          <option value="active">🟢 Đang Mở</option>
          <option value="closed">🔒 Trạng Thái Đóng</option>
        </select>

        <select style={{ ...inputStyle, width: '200px' }} value={filters.topicId} onChange={e => handleFilterChange('topicId', e.target.value)}>
          <option value="">🛰️ Mọi Chủ Đề</option>
          {topics.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
        </select>

        <button style={{ ...inputStyle, width: 'auto', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }} onClick={() => loadExams(1, filters)} title="Quét lại hệ thống">🔄</button>
      </div>

      {/* Floating Cards */}
      {loading ? (
        <div className="loading-page" style={{ height: '300px' }}><div className="spinner" /></div>
      ) : exams.length === 0 ? (
        <div style={{ background: 'var(--bg-secondary)', padding: '80px', borderRadius: '24px', textAlign: 'center', border: '1px dashed var(--border-accent)' }}>
           <div style={{ fontSize: '72px', marginBottom: '20px', filter: 'grayscale(0.5)' }}>📝</div>
           <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Chưa Có Bài Thi Điển Hình</div>
           <div style={{ color: 'var(--text-muted)', marginTop: '8px', marginBottom: '24px', fontSize: '15px' }}>Hệ thống chưa ghi nhận cấu trúc bài kiểm tra nào phù hợp thẻ lọc!</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '24px' }}>
            {exams.map(exam => {
              const st = STATUS_MAP[exam.status] || STATUS_MAP.draft;
              const isDeleting = deleting === exam.id;
              
              return (
                <div key={exam.id} style={{
                  background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px', position: 'relative', overflow: 'hidden', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', opacity: isDeleting ? 0.5 : 1, display: 'flex', flexDirection: 'column'
                }}
                onMouseOver={(ev) => { ev.currentTarget.style.transform = 'translateY(-6px)'; ev.currentTarget.style.boxShadow = `0 20px 40px rgba(59,130,246,0.1)`; ev.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)'; }}
                onMouseOut={(ev) => { ev.currentTarget.style.transform = 'translateY(0)'; ev.currentTarget.style.boxShadow = 'none'; ev.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: st.color }}></div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ background: st.bg, color: st.color, padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, border: st.badge }}>{st.icon} {st.label}</div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {exam.enable_anti_cheat && <span title="Khoá Chống Gian Lận" style={{ fontSize: '16px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '4px' }}>🛡️</span>}
                      {exam.shuffle_questions && <span title="Trộn câu hỏi" style={{ fontSize: '16px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '4px' }}>🔀</span>}
                      {exam.is_adaptive && <span title="Công nghệ AI Đề tương thích" style={{ fontSize: '16px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '4px' }}>🧠</span>}
                      {exam.access_code && <span title="Khóa bảo vệ bằng mã Access Code" style={{ fontSize: '16px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '4px' }}>🔐</span>}
                    </div>
                  </div>

                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'white', marginBottom: '8px', lineHeight: 1.4 }}>{exam.title}</h3>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {exam.description || <span style={{ opacity: 0.5 }}>Chưa có văn bản mô tả.</span>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                     <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '10px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.02)' }}>
                        <div style={{ fontSize: '16px', marginBottom: '4px' }}>⏱️</div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>{exam.duration_minutes} <span style={{fontSize:'10px', color:'gray', fontWeight:400}}>phút</span></div>
                     </div>
                     <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '10px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.02)' }}>
                        <div style={{ fontSize: '16px', marginBottom: '4px' }}>❓</div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>{exam.total_questions || 0} <span style={{fontSize:'10px', color:'gray', fontWeight:400}}>câu</span></div>
                     </div>
                     <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '10px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.02)' }}>
                        <div style={{ fontSize: '16px', marginBottom: '4px' }}>🚀</div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>{exam.passing_score} <span style={{fontSize:'10px', color:'gray', fontWeight:400}}>điểm</span></div>
                     </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                    <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', background: 'rgba(59,130,246,0.1)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.2)' }}>📁 {exam.topic_name || 'Chưa Xếp Loại'}</span>
                    <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', background: 'rgba(168,85,247,0.1)', color: '#d8b4fe', border: '1px solid rgba(168,85,247,0.2)' }}>📊 {exam.attempt_count ?? 0} Lượt Thi</span>
                    {exam.max_attempts && <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>🔁 Giới hạn {exam.max_attempts} lần</span>}
                  </div>

                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', display: 'flex', gap: '8px', alignItems: 'center', marginTop: 'auto' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', flex: 1 }}>👤 Tạo bởi: <strong style={{color:'white'}}>{exam.creator_name || 'Hệ Thống'}</strong></div>
                    
                    {canManage && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {exam.status === 'draft' && <button onClick={() => handleStatusChange(exam, 'active')} style={{ padding:'6px 12px', borderRadius:'8px', background:'rgba(34,197,94,0.15)', color:'#4ade80', border:'none', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>Mở Đề</button>}
                        {exam.status === 'active' && <button onClick={() => handleStatusChange(exam, 'closed')} style={{ padding:'6px 12px', borderRadius:'8px', background:'rgba(239,68,68,0.15)', color:'#ef4444', border:'none', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>Khoá Đề</button>}
                        
                        <button onClick={() => openEdit(exam)} disabled={isDeleting} style={{ width:'32px', height:'32px', borderRadius:'8px', background:'rgba(255,255,255,0.05)', border:'none', color:'white', display:'flex', justifyContent:'center', alignItems:'center', cursor:'pointer' }}>✏️</button>
                        <button onClick={() => handleDelete(exam)} disabled={isDeleting} style={{ width:'32px', height:'32px', borderRadius:'8px', background:'rgba(239,68,68,0.1)', border:'none', color:'#ef4444', display:'flex', justifyContent:'center', alignItems:'center', cursor:'pointer' }}>{isDeleting?'⏳':'🗑️'}</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '32px', background: 'var(--bg-glass)', padding: '16px 24px', borderRadius: '16px', border: '1px solid var(--border)' }}>
               <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 500 }}>
                 Đang hiển thị trang <strong style={{ color: 'var(--text-primary)' }}>{page}</strong> / <strong style={{ color: 'var(--accent)' }}>{totalPages}</strong>
               </span>
               <div style={{ display: 'flex', gap: '8px' }}>
                 <button onClick={() => goToPage(1)} disabled={page === 1} style={{ ...inputStyle, width: '40px', padding: 0, textAlign: 'center', cursor: page===1?'default':'pointer', opacity: page===1?0.5:1 }}>«</button>
                 <button onClick={() => goToPage(page-1)} disabled={page === 1} style={{ ...inputStyle, width: '40px', padding: 0, textAlign: 'center', cursor: page===1?'default':'pointer', opacity: page===1?0.5:1 }}>‹</button>
                 {(() => {
                   const start = Math.max(1, Math.min(page-2, totalPages-4));
                   return Array.from({ length: Math.min(5, totalPages) }, (_, i) => start+i).map(pg => (
                     <button key={pg} onClick={() => goToPage(pg)} style={{
                       ...inputStyle, width: '40px', padding: 0, textAlign: 'center', cursor: 'pointer',
                       background: pg === page ? 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)' : 'rgba(255,255,255,0.05)',
                       color: pg === page ? '#fff' : 'white', border: pg===page?'none':'1px solid var(--border)', fontWeight: pg===page?800:500
                     }}>{pg}</button>
                   ));
                 })()}
                 <button onClick={() => goToPage(page+1)} disabled={page === totalPages} style={{ ...inputStyle, width: '40px', padding: 0, textAlign: 'center', cursor: page===totalPages?'default':'pointer', opacity: page===totalPages?0.5:1 }}>›</button>
                 <button onClick={() => goToPage(totalPages)} disabled={page === totalPages} style={{ ...inputStyle, width: '40px', padding: 0, textAlign: 'center', cursor: page===totalPages?'default':'pointer', opacity: page===totalPages?0.5:1 }}>»</button>
               </div>
             </div>
          )}
        </>
      )}

      {/* Standard Form Modal */}
      {showModal && (
        <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', backdropFilter:'blur(10px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }} onClick={closeModal}>
          <div style={{ background: '#0f172a', width: '900px', maxWidth: '95vw', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh', boxShadow: '0 25px 50px rgba(0,0,0,0.8)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '24px 32px', background: 'linear-gradient(90deg, rgba(30,58,138,0.3) 0%, transparent 100%)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {editExam ? '✏️ Chỉnh Sửa Bài Thi' : '✨ Tạo Bài Thi Mới'}
              </h3>
              <button onClick={closeModal} disabled={saving} style={{ background:'transparent', border:'none', color:'white', fontSize:'20px', cursor:'pointer' }}>✕</button>
            </div>

            {/* Standard Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '0 32px', background: 'rgba(0,0,0,0.2)' }}>
              {[ 
                { key: 'info', label: 'Thông Tin Chung' }, 
                { key: 'questions', label: `Danh Sách Câu Hỏi (${form.questionIds.length})` },
                ...(editExam ? [{ key: 'attempts', label: `Học Sinh Đã Làm (${editExam?.attempt_count || 0})` }] : [])
              ].map(tab => (
                <button key={tab.key} onClick={() => setModalTab(tab.key)} style={{
                  padding: '16px 24px', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '14px', textTransform: 'uppercase', transition: '0.2s',
                  color: modalTab === tab.key ? '#60a5fa' : 'var(--text-muted)',
                  borderBottom: `3px solid ${modalTab === tab.key ? '#60a5fa' : 'transparent'}`
                }}>
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ padding: '32px', overflowY: 'auto', flex: 1 }}>
              {modalTab === 'info' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
                    <div>
                      <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Tên Bài Thi <span style={{color:'red'}}>*</span></label>
                      <input style={{...inputStyle, width: '100%', borderColor: 'rgba(96,165,250,0.4)', background: 'rgba(0,0,0,0.4)', fontWeight: 800}} placeholder="VD: Kiểm tra cuối kì Sinh Học..." maxLength={200} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} disabled={saving} autoFocus />
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Chủ Đề Áp Dụng <span style={{color:'red'}}>*</span></label>
                      <select style={{...inputStyle, width: '100%'}} value={form.topicId} onChange={e => setForm(f => ({ ...f, topicId: e.target.value }))} disabled={saving}>
                        <option value="">— Chọn Chủ đề —</option>
                        {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                     <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Mô Tả Bài Thi</label>
                     <textarea style={{...inputStyle, width: '100%', minHeight: '80px', resize: 'vertical'}} placeholder="Nhập tóm tắt hoặc căn dặn học sinh..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} disabled={saving} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                    <div>
                      <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Thời Gian (Phút) <span style={{color:'red'}}>*</span></label>
                      <input style={{...inputStyle, width: '100%'}} type="number" min={1} max={480} value={form.durationMinutes} onChange={e => setForm(f => ({ ...f, durationMinutes: parseInt(e.target.value) || 60 }))} disabled={saving} />
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Hệ Số Điểm Đạt</label>
                      <input style={{...inputStyle, width: '100%'}} type="number" min={0} max={10} step={0.5} value={form.passingScore} onChange={e => setForm(f => ({ ...f, passingScore: parseFloat(e.target.value) || 5 }))} disabled={saving} />
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Trạng Thái Hiển Thị</label>
                      <select style={{...inputStyle, width: '100%', fontWeight: 800, color: form.status==='active'?'#4ade80':form.status==='closed'?'#f87171':'#fcd34d'}} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} disabled={saving}>
                        <option value="draft">Chế Độ Bản Nháp</option>
                        <option value="active">🟢 Cho Phép Thi</option>
                        <option value="closed">🔒 Đóng Cuộc Thi</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                      <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Số Lần Thi Tối Đa (Trống = Vô Hiệu)</label>
                      <input style={{...inputStyle, width: '100%'}} type="number" min={1} placeholder="Không giới hạn" value={form.maxAttempts} onChange={e => setForm(f => ({ ...f, maxAttempts: e.target.value }))} disabled={saving} />
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Mã Bí Mật Bảo Vệ (Passcode)</label>
                      <input style={{...inputStyle, width: '100%'}} placeholder="Nhập mã vào thi..." value={form.accessCode} onChange={e => setForm(f => ({ ...f, accessCode: e.target.value }))} disabled={saving} />
                    </div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '24px', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.05)' }}>
                     <label style={{ display:'block', fontSize:'15px', color:'white', fontWeight:800, marginBottom:'16px' }}>Cài Đặt Chức Năng Bổ Sung</label>
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                       {[
                         { key: 'shuffleQuestions', label: '🔀 Trộn Thứ Tự Câu Hỏi' },
                         { key: 'shuffleOptions',   label: '🔀 Trộn Ngẫu Nhiên Đáp Án' },
                         { key: 'showResult',       label: '📊 Hiện Kết Quả Ngay Sau Khi Nộp' },
                         { key: 'showExplanation',  label: '💡 Hiện Lời Giải Chi Tiết' },
                         { key: 'allowAiExplain',   label: '🤖 Kích Hoạt Tính Năng Trợ Giảng AI' },
                         { key: 'isAdaptive',       label: '🧠 Áp Dụng Thuật Toán Phân Tích Adaptive' },
                         { key: 'enableAntiCheat',  label: '🛡️ Hệ Thống Chống Gian Lận (Focus Màn Hình)' },
                         { key: 'requireFullscreen',label: '🖥️ Yêu Cầu Chế Độ Toàn Màn Hình Khi Thi' },
                       ].map(({ key, label }) => (
                         <label key={key} style={{
                           display: 'flex', gap: '12px', alignItems: 'center', padding: '12px 16px', borderRadius: '12px', cursor: 'pointer',
                           background: form[key] ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)',
                           border: `1px solid ${form[key] ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.05)'}`, transition: 'all 0.2s',
                           boxShadow: form[key] ? 'inset 0 0 10px rgba(59,130,246,0.1)' : 'none'
                         }}>
                           <input type="checkbox" checked={!!form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} disabled={saving} style={{ accentColor: '#3b82f6', width: '18px', height: '18px' }} />
                           <span style={{ fontSize: '13px', fontWeight: 600, color: form[key]?'white':'var(--text-secondary)' }}>{label}</span>
                         </label>
                       ))}
                     </div>
                  </div>
                </div>
              )}

              {modalTab === 'questions' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', height: '100%', minHeight: '400px' }}>
                  {/* Left: Search Tool */}
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'white', marginBottom: '16px' }}>Thư Viện Câu Hỏi 🔍</div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                      <input style={{...inputStyle, flex: 1}} placeholder="Tìm kiếm nội dung..." value={qSearch} onChange={e => setQSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchQuestions(qSearch, qTopic)} />
                      <button style={{...inputStyle, width: 'auto', background: '#3b82f6', border: 'none', color: 'white', fontWeight: 800, cursor: 'pointer'}} onClick={() => searchQuestions(qSearch, qTopic)} disabled={qLoading}>{qLoading ? '⏳' : 'TÌM'}</button>
                    </div>
                    <select style={{...inputStyle, marginBottom: '20px', width: '100%'}} value={qTopic} onChange={e => { setQTopic(e.target.value); searchQuestions(qSearch, e.target.value); }}>
                      <option value="">Lọc Theo Chủ Đề</option>
                      {topics.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
                    </select>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Danh sách {qResults.length} câu tìm được</span>
                      <button style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', fontWeight: 800 }} onClick={addAllQuestions} disabled={qLoading || qResults.length === 0}>Thêm Tất Cả</button>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '8px' }}>
                      {qResults.length === 0 && !qLoading && <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px' }}>Không có câu hỏi nào khớp từ khóa.</div>}
                      {qResults.map(q => {
                        const picked = !!pickedMap[q.id];
                        return (
                          <div key={q.id} style={{
                            padding: '12px', borderRadius: '10px', background: picked ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${picked ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.05)'}`,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: '0.2s', gap: '12px'
                          }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flex: 1, overflow: 'hidden' }}>
                              <span style={{ color: DIFF_COLOR[q.difficulty] }}>●</span>
                              <span style={{ fontSize: '13px', color: picked ? 'white' : 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>{q.question_text}</span>
                            </div>
                            <button style={{ whiteSpace: 'nowrap', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, cursor: picked?'default':'pointer', border: 'none', background: picked ? '#22c55e' : 'rgba(255,255,255,0.1)', color: 'white' }} onClick={() => !picked && addQuestion(q)} disabled={picked}>
                              {picked ? 'ĐÃ THÊM' : 'CHỌN'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right: Selected Arsenal */}
                  <div style={{ background: 'rgba(34,197,94,0.05)', padding: '20px', borderRadius: '16px', border: '1px dashed rgba(34,197,94,0.3)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#4ade80', marginBottom: '16px' }}>Danh Sách Đã Chọn ({form.questionIds.length})</div>
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '8px' }}>
                      {form.questionIds.length === 0 ? (
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px' }}>Chưa có câu hỏi nào. Bạn hãy chọn từ danh sách bên cạnh.</div>
                      ) : (
                        form.questionIds.map((qId, idx) => {
                          const q = pickedMap[qId];
                          return (
                            <div key={qId} style={{
                              padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)',
                              display: 'flex', alignItems: 'center', gap: '12px'
                            }}>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: '#4ade80' }}>{idx + 1}.</span>
                              <span style={{ color: DIFF_COLOR[q?.difficulty] }}>●</span>
                              <div style={{ flex: 1, fontSize: '13px', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }} title={q?.question_text || `Câu #${qId}`}>{q?.question_text || `Câu #${qId}`}</div>
                              <button style={{ padding: '6px', borderRadius: '6px', cursor: 'pointer', border: 'none', background: 'rgba(239,68,68,0.2)', color: '#ef4444', fontWeight: 800 }} onClick={() => removeQuestion(qId)} title="Bỏ Chọn">✕</button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {modalTab === 'attempts' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', minHeight: '400px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: 'white', marginBottom: '8px' }}>Danh sách người làm bài thi: <span style={{ color: '#60a5fa' }}>{editExam?.title}</span></div>
                  
                  {loadingAttempts ? (
                    <div style={{ padding: '60px', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto', borderColor: 'rgba(59,130,246,0.3)', borderTopColor: '#3b82f6', transform: 'scale(1.5)' }}></div></div>
                  ) : examAttempts.length === 0 ? (
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '60px', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.05)', textAlign: 'center' }}>
                      <div style={{ fontSize: '48px', filter: 'grayscale(1)', opacity: 0.3, marginBottom: '16px' }}>📭</div>
                      <div style={{ color: 'white', fontWeight: 800, fontSize: '18px', marginBottom: '8px' }}>Chưa có bản ghi thi</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Chưa có sinh viên nào tham gia bài kiểm tra này.</div>
                    </div>
                  ) : (
                    <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.4)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(10px)', zIndex: 2 }}>
                          <tr style={{ color: 'var(--text-muted)' }}>
                            <th style={{ padding: '16px 20px', fontSize: '12px', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '1px' }}>Học Viên</th>
                            <th style={{ padding: '16px 20px', fontSize: '12px', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '1px', textAlign: 'center' }}>Tổng Điểm</th>
                            <th style={{ padding: '16px 20px', fontSize: '12px', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '1px', textAlign: 'center' }}>Đúng/Sai</th>
                            <th style={{ padding: '16px 20px', fontSize: '12px', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '1px', textAlign: 'center' }}>Thời Gian</th>
                            <th style={{ padding: '16px 20px', fontSize: '12px', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '1px' }}>Trạng Thái</th>
                            <th style={{ padding: '16px 20px', fontSize: '12px', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '1px', textAlign: 'right' }}>Ngày Thực Thi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {examAttempts.map(a => (
                            <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: a.is_passed ? 'rgba(34,197,94,0.03)' : 'transparent', transition: '0.2s' }} onMouseOver={e=>e.currentTarget.style.background='rgba(59,130,246,0.05)'} onMouseOut={e=>e.currentTarget.style.background=a.is_passed ? 'rgba(34,197,94,0.03)' : 'transparent'}>
                              <td style={{ padding: '16px 20px' }}>
                                 <div style={{ color: 'white', fontWeight: 800, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                   {a.full_name} 
                                   <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '4px' }}>@{a.username}</span>
                                 </div>
                                 <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>{a.email}</div>
                              </td>
                              <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                                 {a.score != null ? (
                                    <span style={{ fontWeight: 900, fontSize: '18px', color: a.is_passed ? '#34d399' : '#f87171' }}>{a.score}</span>
                                 ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                              </td>
                              <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                                 {['completed', 'timed_out', 'banned'].includes(a.status) ? (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                       <span style={{ color: '#34d399', fontWeight: 800 }}>{a.correct_count||0}</span>
                                       <span style={{ color: 'var(--text-muted)' }}>/</span>
                                       <span style={{ color: '#f87171', fontWeight: 800 }}>{a.wrong_count||0}</span>
                                    </div>
                                 ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                              </td>
                              <td style={{ padding: '16px 20px', textAlign: 'center', color: 'white', fontWeight: 600, fontSize: '13px' }}>
                                 {Math.floor((a.time_taken_seconds||0)/60)}:{((a.time_taken_seconds||0)%60).toString().padStart(2, '0')}
                              </td>
                              <td style={{ padding: '16px 20px' }}>
                                 {a.status === 'completed' ? (
                                    <span style={{ color: '#10b981', fontSize: '11px', fontWeight: 800, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', padding: '4px 10px', borderRadius: '12px' }}>Đã Nộp Bài</span>
                                 ) : a.status === 'in_progress' ? (
                                    <span style={{ color: '#f59e0b', fontSize: '11px', fontWeight: 800, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', padding: '4px 10px', borderRadius: '12px' }}>Đang Làm...</span>
                                 ) : a.status === 'banned' ? (
                                    <span style={{ color: '#f43f5e', fontSize: '11px', fontWeight: 800, background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', padding: '4px 10px', borderRadius: '12px' }}>Đình Chỉ Thi</span>
                                 ) : (
                                    <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: 800, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', padding: '4px 10px', borderRadius: '12px' }}>Hết Giờ</span>
                                 )}
                              </td>
                              <td style={{ padding: '16px 20px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600 }}>
                                {new Date(a.started_at).toLocaleString('vi-VN')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ padding: '24px 32px', background: 'rgba(0,0,0,0.5)', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button style={{ padding: '14px 24px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: '14px' }} onClick={closeModal} disabled={saving}>HUỶ BỎ</button>
              <div style={{ display: 'flex', gap: '16px' }}>
                {modalTab === 'info' && <button style={{ padding: '14px 24px', borderRadius: '12px', background: 'rgba(30,58,138,0.6)', border: '1px solid rgba(96,165,250,0.3)', color: '#60a5fa', fontWeight: 800, cursor: 'pointer', fontSize: '14px' }} onClick={() => setModalTab('questions')}>BƯỚC 2: THÊM CÂU HỎI</button>}
                <button style={{ padding: '14px 32px', borderRadius: '12px', background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', border: 'none', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: '14px', boxShadow: '0 8px 24px rgba(37,99,235,0.4)' }} onClick={handleSave} disabled={saving}>
                  {saving ? '⏳ ĐANG LƯU...' : `💾 LƯU BÀI THI`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
