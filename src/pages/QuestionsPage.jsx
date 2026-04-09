import React, { useState, useEffect, useCallback, useRef } from 'react';

const api = typeof window !== 'undefined' ? window['electronAPI'] : null;

// ── Constants ─────────────────────────────────────────────────
const PAGE_SIZE   = 20;
const LABELS      = { A: 0, B: 1, C: 2, D: 3, E: 4 };
const DIFF_COLOR  = { easy: 'success', medium: 'warning', hard: 'error' };
const DIFF_LABEL  = { easy: '🟢 Dễ', medium: '🟡 TB', hard: '🔴 Khó' };
const TYPE_LABEL  = { single_choice: 'Một đáp án', multiple_choice: 'Nhiều đáp án', fill_in: 'Điền từ' };
const BLOOM_OPTS  = ['remember','understand','apply','analyze','evaluate','create'];
const BLOOM_VI    = { remember:'Ghi nhớ', understand:'Hiểu', apply:'Áp dụng', analyze:'Phân tích', evaluate:'Đánh giá', create:'Sáng tạo' };

const DEFAULT_OPT = () => ({ label: '', text: '', isCorrect: false });
const DEFAULT_FORM = {
  topicId: '', questionText: '', questionType: 'single_choice',
  difficulty: 'medium', bloomLevel: 'remember', estimatedTime: 45,
  explanation: '',
  options: [
    { label: 'A', text: '', isCorrect: false },
    { label: 'B', text: '', isCorrect: false },
    { label: 'C', text: '', isCorrect: false },
    { label: 'D', text: '', isCorrect: false },
  ],
  fillAnswers: [{ answer: '', isPrimary: true, matchMode: 'exact' }],
};

function relabelOptions(opts) {
  return opts.map((o, i) => ({ ...o, label: String.fromCharCode(65 + i) }));
}

export default function QuestionsPage({ user, showToast }) {
  const [questions, setQuestions] = useState([]);
  const [topics,    setTopics]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [filters, setFilters] = useState({ topicId: '', difficulty: '', questionType: '', search: '' });

  const [showModal,   setShowModal]   = useState(false);
  const [editQuestion, setEditQuestion] = useState(null);
  const [viewQuestion, setViewQuestion] = useState(null);
  const [form,   setForm]   = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const [semanticQuery,    setSemanticQuery]    = useState('');
  const [semanticLoading,  setSemanticLoading]  = useState(false);
  const [semanticAnalysis, setSemanticAnalysis] = useState(null);
  const [isSemanticMode,   setIsSemanticMode]   = useState(false);

  const canManage = ['admin','teacher'].includes(user?.role?.toLowerCase());
  const searchTimer = useRef(null);

  const loadQuestions = useCallback(async (pg = 1, f = filters) => {
    if (!api) return;
    setLoading(true);
    setIsSemanticMode(false);
    setSemanticAnalysis(null);
    try {
      const res = await api.questions.getAll({ ...f, page: pg, limit: PAGE_SIZE });
      if (res.success) {
        setQuestions(res.questions || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
        setPage(pg);
      } else {
        showToast(res.message || 'Không tải được câu hỏi', 'error');
      }
    } catch (err) { showToast('Lỗi kết nối: ' + err.message, 'error'); } 
    finally { setLoading(false); }
  }, []);

  const loadTopics = useCallback(async () => {
    if (!api) return;
    try {
      const res = await api.topics.getAll({ limit: 200 });
      if (res.success) setTopics(res.topics || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadTopics(); loadQuestions(1, filters); }, []);

  const handleFilterChange = (key, val) => {
    const newF = { ...filters, [key]: val };
    setFilters(newF);
    if (key !== 'search') { setPage(1); loadQuestions(1, newF); }
  };

  const handleSearchChange = (val) => {
    const newF = { ...filters, search: val };
    setFilters(newF);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadQuestions(1, newF), val === '' ? 0 : 400);
  };

  const goToPage = (pg) => loadQuestions(Math.max(1, Math.min(totalPages, pg)), filters);

  const runSemanticSearch = async () => {
    if (!semanticQuery.trim()) { showToast('Nhập nội dung tìm kiếm', 'error'); return; }
    setSemanticLoading(true);
    try {
      const res = await api.ai.semanticSearch({ query: semanticQuery, topicId: filters.topicId || null, requestUser: { id: user.id } });
      if (res.success) {
        setQuestions(res.questions || []);
        setTotal(res.questions?.length || 0);
        setTotalPages(1); setPage(1); setIsSemanticMode(true); setSemanticAnalysis(res.analysis || null);
        showToast(`Tìm được ${res.questions?.length || 0} câu hỏi`, 'success');
      } else { showToast(res.message || 'Lỗi tìm kiếm AI', 'error'); }
    } catch (err) { showToast(err.message, 'error'); } 
    finally { setSemanticLoading(false); }
  };

  const clearSemantic = () => { setSemanticQuery(''); setSemanticAnalysis(null); setIsSemanticMode(false); loadQuestions(1, filters); };

  const openCreate = () => {
    setEditQuestion(null);
    setForm({ ...DEFAULT_FORM, topicId: filters.topicId || '', difficulty: filters.difficulty || 'medium' });
    setShowModal(true);
  };

  const openEdit = async (q) => {
    setEditQuestion(q);
    let detail = q;
    if (!q.options || q.options.length === 0) {
      try { const res = await api.questions.getById(q.id); if (res.success) detail = res.question; } catch { }
    }
    setForm({
      topicId: detail.topic_id || '', questionText: detail.question_text || '', questionType: detail.question_type || 'single_choice',
      difficulty: detail.difficulty || 'medium', bloomLevel: detail.bloom_level || 'remember', estimatedTime: detail.estimated_time || 45,
      explanation: detail.explanation || '',
      options: detail.options?.length ? detail.options.map(o => ({ label: o.option_label, text: o.option_text, isCorrect: !!o.is_correct })) : DEFAULT_FORM.options,
      fillAnswers: detail.fillAnswers?.length ? detail.fillAnswers.map(a => ({ answer: a.accepted_answer, isPrimary: !!a.is_primary, matchMode: a.match_mode || 'exact' })) : [{ answer: '', isPrimary: true, matchMode: 'exact' }],
    });
    setShowModal(true);
  };

  const closeModal = () => { if (saving) return; setShowModal(false); setEditQuestion(null); };

  const handleSave = async () => {
    const text = form.questionText.trim();
    if (!text) return showToast('Nội dung không được để trống', 'error');
    if (!form.topicId) return showToast('Chọn chủ đề', 'error');
    if (form.questionType === 'single_choice' && form.options.filter(o => o.isCorrect).length !== 1) return showToast('Phải chọn đúng 1 đáp án', 'error');
    if ((form.questionType === 'single_choice' || form.questionType === 'multiple_choice') && form.options.some(o => !o.text.trim())) return showToast('Điền đầy đủ nội dung đáp án', 'error');
    if (form.questionType === 'fill_in' && !form.fillAnswers.some(a => a.answer.trim())) return showToast('Cần ít nhất 1 đáp án', 'error');

    setSaving(true);
    try {
      const payload = { ...form, questionText: text, explanation: form.explanation.trim() || null, createdBy: user.id, options: form.questionType !== 'fill_in' ? form.options : [], fillAnswers: form.questionType === 'fill_in' ? form.fillAnswers.filter(a => a.answer.trim()) : [] };
      const res = editQuestion ? await api.questions.update(editQuestion.id, payload, { id: user.id, role: user.role }) : await api.questions.create(payload, { id: user.id, role: user.role });
      if (res.success) { showToast('Lưu thành công', 'success'); closeModal(); loadQuestions(editQuestion ? page : 1, filters); } 
      else showToast(res.message, 'error');
    } catch (err) { showToast('Lỗi: ' + err.message, 'error'); } 
    finally { setSaving(false); }
  };

  const handleDelete = async (q) => {
    if (!confirm(`Xoá câu hỏi này khỏi ngân hàng?`)) return;
    setDeleting(q.id);
    try {
      const res = await api.questions.delete(q.id, { id: user.id, role: user.role });
      if (res.success) {
        showToast('Đã xoá câu hỏi thành công', 'success');
        loadQuestions(page > Math.max(1, Math.ceil((total - 1) / PAGE_SIZE)) ? Math.max(1, Math.ceil((total - 1) / PAGE_SIZE)) : page, filters);
      } else showToast(res.message, 'error');
    } catch (err) { showToast(err.message, 'error'); } 
    finally { setDeleting(null); }
  };

  const rowNum = (i) => (page - 1) * PAGE_SIZE + i + 1;

  const inputStyle = { background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '12px 16px', borderRadius: '12px', fontSize: '14px', outline: 'none' };
  
  return (
    <div className="page" style={{ padding: '32px', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      
      {/* Premium Hero Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(236,72,153,1) 0%, rgba(244,63,94,1) 50%, rgba(225,29,72,1) 100%)',
        borderRadius: '24px', padding: '32px', marginBottom: '32px', border: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden'
      }}>
        {/* Glow Effects */}
        <div style={{ position: 'absolute', right: '-10%', top: '-20%', width: '300px', height: '300px', background: 'rgba(255,255,255,0.15)', borderRadius: '50%', filter: 'blur(50px)', zIndex: 0 }}></div>
        <div style={{ position: 'absolute', left: '-5%', bottom: '-20%', width: '200px', height: '200px', background: 'rgba(251,191,36,0.3)', borderRadius: '50%', filter: 'blur(60px)', zIndex: 0 }}></div>
        
        <div style={{ position: 'relative', zIndex: 2 }}>
          <h1 style={{ fontSize: '36px', fontWeight: 900, color: 'white', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', textShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '40px' }}>❓</span> Ngân Hàng Câu Hỏi
          </h1>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.9)', textShadow: '0 2px 8px rgba(0,0,0,0.1)', maxWidth: '600px' }}>
            {isSemanticMode ? `Kết quả phân tích Semantic AI: ${total} câu hỏi được tìm thấy.` : `Hệ thống đang sở hữu tổng cộng ${total > 0 ? total : 0} câu hỏi trong ngân hàng.`}
          </p>
        </div>
        
        {canManage && (
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', gap: '16px' }}>
            <button 
              onClick={() => showToast('Tính năng Import chưa kích hoạt','info')}
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '16px 24px', borderRadius: '16px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', backdropFilter: 'blur(10px)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            >
              <span>📥</span> Nhập Excel / Word
            </button>
            <button 
              onClick={openCreate}
              style={{ background: 'white', color: '#e11d48', padding: '16px 24px', borderRadius: '16px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px', border: 'none' }}
              onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <span style={{ fontSize: '20px' }}>➕</span> Tạo Câu Hỏi
            </button>
          </div>
        )}
      </div>

      {/* Semantic AI Search Bar */}
      <div style={{ 
        background: 'linear-gradient(90deg, rgba(79,70,229,0.15) 0%, rgba(147,51,234,0.15) 100%)', 
        border: '1px solid rgba(139,92,246,0.3)', borderRadius: '16px', padding: '24px', marginBottom: '24px', position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', right: 0, top: 0, width: '150px', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.1))' }}></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', zIndex: 2, position: 'relative', flexWrap: 'wrap' }}>
          <div style={{ padding: '8px 16px', background: 'rgba(124,58,237,0.2)', borderRadius: '12px', border: '1px solid rgba(124,58,237,0.4)', color: '#d8b4fe', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ animation: 'pulse 2s infinite' }}>🧠</span> TÌM KIẾM AI
          </div>
          <input
            style={{ ...inputStyle, flex: 1, minWidth: '240px', background: 'rgba(0,0,0,0.3)', borderColor: 'rgba(124,58,237,0.3)', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)' }}
            placeholder="Tìm theo nội dung bao quát (VD: Câu hỏi về chu trình hô hấp...)"
            value={semanticQuery} onChange={e => setSemanticQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSemanticSearch()}
          />
          <button 
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #c026d3 100%)', border: 'none', color: 'white', padding: '14px 28px', borderRadius: '12px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 24px rgba(124,58,237,0.4)', transition: 'all 0.2s', display: 'flex', gap: '8px' }}
            onClick={runSemanticSearch} disabled={semanticLoading}
          >
            {semanticLoading ? '⏳ ĐANG PHÂN TÍCH...' : '🔎 TÌM THÔNG MINH'}
          </button>
          {isSemanticMode && (
            <button style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', padding: '14px 20px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s' }} onClick={clearSemantic}>✕ Bỏ Lọc AI</button>
          )}
        </div>
        
        {semanticAnalysis && (
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '16px', padding: '12px 20px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px dashed rgba(168,85,247,0.3)' }}>
            <span style={{ color: '#d8b4fe', fontSize: '13px' }}><b style={{ color: 'white' }}>🎯 Phân tích Ngữ nghĩa:</b> {semanticAnalysis.intent || '—'}</span>
            <span style={{ color: '#d8b4fe', fontSize: '13px' }}><b style={{ color: 'white' }}>🔑 Từ khoá nhận diện:</b> {(semanticAnalysis.keywords || []).join(', ') || '—'}</span>
            {semanticAnalysis.synonyms?.length > 0 && (
              <span style={{ color: '#d8b4fe', fontSize: '13px' }}><b style={{ color: 'white' }}>🔗 Từ khoá tương tự:</b> {semanticAnalysis.synonyms.join(', ')}</span>
            )}
          </div>
        )}
      </div>

      {/* Modern Filter Bar */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap', background: 'var(--bg-secondary)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border)', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
           <span style={{ position: 'absolute', left: '16px', top: '15px', color: 'var(--text-muted)' }}>🔍</span>
           <input
             style={{ ...inputStyle, width: '100%', paddingLeft: '44px' }}
             placeholder="Tìm kiếm nội dung..."
             value={filters.search} onChange={e => handleSearchChange(e.target.value)}
           />
        </div>

        <select style={{ ...inputStyle, width: '200px' }} value={filters.topicId} onChange={e => handleFilterChange('topicId', e.target.value)}>
          <option value="">Tất cả chủ đề</option>
          {topics.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
        </select>

        <select style={{ ...inputStyle, width: '180px' }} value={filters.difficulty} onChange={e => handleFilterChange('difficulty', e.target.value)}>
          <option value="">Tất cả độ khó</option>
          <option value="easy">🟢 Dễ</option>
          <option value="medium">🟡 Trung Bình</option>
          <option value="hard">🔴 Khó</option>
        </select>

        <select style={{ ...inputStyle, width: '180px' }} value={filters.questionType} onChange={e => handleFilterChange('questionType', e.target.value)}>
          <option value="">Tất cả thể loại</option>
          <option value="single_choice">🔵 Một đáp án</option>
          <option value="multiple_choice">🔲 Nhiều đáp án</option>
          <option value="fill_in">✏️ Điền từ/Tự luận</option>
        </select>

        <button style={{ ...inputStyle, width: 'auto', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => loadQuestions(1, filters)} title="Đồng bộ hóa lại">🔄</button>
      </div>

      {/* Floating Table Rows */}
      {loading ? (
        <div className="loading-page" style={{ height: '300px' }}><div className="spinner" /></div>
      ) : questions.length === 0 ? (
        <div style={{ background: 'var(--bg-secondary)', padding: '80px', borderRadius: '24px', textAlign: 'center', border: '1px dashed var(--border-accent)' }}>
          <div style={{ fontSize: '72px', marginBottom: '20px', filter: 'grayscale(0.5)' }}>🕸️</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Không Cớ Câu Hỏi Nào</div>
          <div style={{ color: 'var(--text-muted)', marginTop: '8px', marginBottom: '24px', fontSize: '15px' }}>Không có câu hỏi nào khớp với các bộ lọc hiện tại của bạn.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Table Header (Hidden visually but structural) */}
          <div style={{ display: 'flex', padding: '0 24px', color: 'var(--text-muted)', fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px' }}>
             <div style={{ width: '50px' }}>STT</div>
             <div style={{ flex: 1 }}>Nội Dung Câu Hỏi</div>
             <div style={{ width: '130px' }}>Chủ Đề</div>
             <div style={{ width: '140px' }}>Loại Hình</div>
             <div style={{ width: '100px' }}>Độ Khó</div>
             <div style={{ width: '70px', textAlign: 'center' }}>Nguồn</div>
             {canManage && <div style={{ width: '150px', textAlign: 'right' }}>Thao Tác</div>}
          </div>

          {/* Table Rows as Glass Cards */}
          {questions.map((q, i) => (
            <div key={q.id} style={{
              background: 'var(--bg-glass)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px 24px',
              display: 'flex', alignItems: 'center', transition: 'all 0.2s', opacity: deleting === q.id ? 0.4 : 1,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
            onMouseOver={e=>{ e.currentTarget.style.transform='translateX(8px)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.2)'; e.currentTarget.style.background='rgba(255,255,255,0.05)' }}
            onMouseOut={e=>{ e.currentTarget.style.transform='translateX(0)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.05)'; e.currentTarget.style.background='var(--bg-glass)' }}
            >
              <div style={{ width: '50px', color: 'var(--text-muted)', fontWeight: 800, fontSize: '15px' }}>{rowNum(i)}</div>
              <div style={{ flex: 1, paddingRight: '20px' }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', cursor: 'pointer' }} onClick={() => setViewQuestion(q)}>
                  {q.question_text}
                </div>
              </div>
              
              <div style={{ width: '130px' }}>
                 <div style={{ background: 'rgba(59,130,246,0.1)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.2)', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                   {q.topic_name || 'Chưa Xếp Loại'}
                 </div>
              </div>
              
              <div style={{ width: '140px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {TYPE_LABEL[q.question_type] || q.question_type}
              </div>

              <div style={{ width: '100px' }}>
                <div style={{ 
                  background: q.difficulty==='hard'?'rgba(239,68,68,0.1)':q.difficulty==='medium'?'rgba(245,158,11,0.1)':'rgba(34,197,94,0.1)',
                  color: q.difficulty==='hard'?'#fca5a5':q.difficulty==='medium'?'#fcd34d':'#86efac',
                  padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, display: 'inline-block'
                }}>
                  {DIFF_LABEL[q.difficulty] || q.difficulty}
                </div>
              </div>

              <div style={{ width: '70px', textAlign: 'center', fontSize: '22px' }}>
                {q.is_ai_generated ? <span title="Tạo Tự Động bằng AI">🤖</span> : <span title="Nhập thủ công">✍️</span>}
              </div>

              {canManage && (
                <div style={{ width: '150px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setViewQuestion(q)} style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', transition: '0.2s', fontSize: '18px' }} onMouseOver={e=>e.currentTarget.style.background='rgba(59,130,246,0.2)'} onMouseOut={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'} title="Xem Chi Tiết">👁️</button>
                  <button onClick={() => openEdit(q)} disabled={deleting === q.id} style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', transition: '0.2s', fontSize: '18px' }} onMouseOver={e=>e.currentTarget.style.background='rgba(245,158,11,0.2)'} onMouseOut={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'} title="Sửa Câu Hỏi">🖍️</button>
                  <button onClick={() => handleDelete(q)} disabled={deleting === q.id} style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', transition: '0.2s', fontSize: '18px' }} onMouseOver={e=>e.currentTarget.style.background='rgba(239,68,68,0.3)'} onMouseOut={e=>e.currentTarget.style.background='rgba(239,68,68,0.1)'} title="Xoá Bỏ">🗑️</button>
                </div>
              )}
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', background: 'var(--bg-glass)', padding: '16px 24px', borderRadius: '16px', border: '1px solid var(--border)' }}>
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
                       background: pg === page ? 'var(--gradient-accent)' : 'rgba(255,255,255,0.05)',
                       color: pg === page ? '#fff' : 'var(--text-primary)', border: pg===page?'none':'1px solid var(--border)', fontWeight: pg===page?800:500
                     }}>{pg}</button>
                   ));
                 })()}
                 <button onClick={() => goToPage(page+1)} disabled={page === totalPages} style={{ ...inputStyle, width: '40px', padding: 0, textAlign: 'center', cursor: page===totalPages?'default':'pointer', opacity: page===totalPages?0.5:1 }}>›</button>
                 <button onClick={() => goToPage(totalPages)} disabled={page === totalPages} style={{ ...inputStyle, width: '40px', padding: 0, textAlign: 'center', cursor: page===totalPages?'default':'pointer', opacity: page===totalPages?0.5:1 }}>»</button>
               </div>
             </div>
          )}
        </div>
      )}

      {/* Modern Creation Modal */}
      {showModal && <QuestionModal editQuestion={editQuestion} form={form} setForm={setForm} topics={topics} saving={saving} onSave={handleSave} onClose={closeModal} />}
      
      {/* View Modal */}
      {viewQuestion && <QuestionDetailPanel question={viewQuestion} onClose={() => setViewQuestion(null)} onEdit={canManage ? () => { setViewQuestion(null); openEdit(viewQuestion); } : null} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
function QuestionModal({ editQuestion, form, setForm, topics, saving, onSave, onClose }) {
  const f = form;
  const isMulti  = f.questionType === 'multiple_choice';
  const isFill   = f.questionType === 'fill_in';
  const isSingle = f.questionType === 'single_choice';

  const setField = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleTypeChange = (newType) => {
    let newForm = { ...form, questionType: newType };
    if (newType === 'fill_in') newForm.fillAnswers = [{ answer: '', isPrimary: true, matchMode: 'exact' }];
    else if (newType === 'single_choice') newForm.options = (form.options.length>=4?form.options.map((o,i)=>({...o,isCorrect:i===0})):DEFAULT_FORM.options);
    else newForm.options = (form.options.length>=2?form.options:DEFAULT_FORM.options);
    setForm(newForm);
  };

  const setOptionField = (idx, key, val) => {
    const opts = [...f.options];
    if (key === 'isCorrect' && isSingle && val) opts.forEach((o, i) => { opts[i] = { ...opts[i], isCorrect: i === idx }; });
    else opts[idx] = { ...opts[idx], [key]: val };
    setField('options', opts);
  };
  const addOption = () => { if (f.options.length < 6) setField('options', relabelOptions([...f.options, DEFAULT_OPT()])); };
  const removeOption = (idx) => { if (f.options.length > 2) setField('options', relabelOptions(f.options.filter((_, i) => i !== idx))); };

  const setFillField = (idx, key, val) => { const ans = [...f.fillAnswers]; ans[idx] = { ...ans[idx], [key]: val }; setField('fillAnswers', ans); };
  const addFillAnswer = () => setField('fillAnswers', [...f.fillAnswers, { answer: '', isPrimary: false, matchMode: 'exact' }]);
  const removeFillAnswer = (idx) => { if (f.fillAnswers.length > 1) setField('fillAnswers', f.fillAnswers.filter((_, i) => i !== idx)); };

  const inputCss = { background: 'rgba(0,0,0,0.2)', border: '2px solid rgba(255,255,255,0.05)', color: 'white', padding: '12px 16px', borderRadius: '12px', width: '100%', outline: 'none' };

  return (
    <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(10px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }} onClick={onClose}>
      <div style={{ background: '#111827', width: '800px', maxWidth: '95vw', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '24px 32px', background: 'linear-gradient(90deg, rgba(225,29,72,0.2) 0%, rgba(159,18,57,0.2) 100%)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {editQuestion ? '🖍️ Sửa Câu Hỏi' : '✨ Tạo Câu Hỏi Mới'}
          </h3>
          <button onClick={onClose} disabled={saving} style={{ background:'transparent', border:'none', color:'white', fontSize:'20px', cursor:'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(200px, 1fr)', gap: '20px' }}>
             <div>
               <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Chủ Đề <span style={{color:'red'}}>*</span></label>
               <select style={inputCss} value={f.topicId} onChange={e => setField('topicId', e.target.value)} disabled={saving}>
                 <option value="">— Chọn một chủ đề —</option>
                 {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
               </select>
             </div>
             <div>
               <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Loại Câu Hỏi <span style={{color:'red'}}>*</span></label>
               <select style={inputCss} value={f.questionType} onChange={e => handleTypeChange(e.target.value)} disabled={saving || !!editQuestion}>
                 <option value="single_choice">Một đáp án đúng</option>
                 <option value="multiple_choice">Nhiều đáp án đúng</option>
                 <option value="fill_in">Điền từ/Tự luận ngắn</option>
               </select>
             </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
             <div>
               <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Độ Khó</label>
               <select style={inputCss} value={f.difficulty} onChange={e => setField('difficulty', e.target.value)} disabled={saving}>
                 <option value="easy">Cấp Dễ</option>
                 <option value="medium">Cấp Trung Bình</option>
                 <option value="hard">Cấp Khó</option>
               </select>
             </div>
             <div>
               <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Mức Độ Nhận Thức (Bloom)</label>
               <select style={inputCss} value={f.bloomLevel} onChange={e => setField('bloomLevel', e.target.value)} disabled={saving}>
                 {BLOOM_OPTS.map(b => <option key={b} value={b}>{BLOOM_VI[b]}</option>)}
               </select>
             </div>
             <div>
               <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Thời Gian Khuyến Nghị (giây)</label>
               <input style={inputCss} type="number" min={10} max={300} value={f.estimatedTime} onChange={e => setField('estimatedTime', parseInt(e.target.value) || 45)} disabled={saving} />
             </div>
          </div>

          <div>
             <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Nội Dung Câu Hỏi <span style={{color:'red'}}>*</span></label>
             <textarea style={{...inputCss, minHeight: '120px', resize: 'vertical'}} placeholder="Nhập nội dung đề bài..." value={f.questionText} onChange={e => setField('questionText', e.target.value)} disabled={saving} />
          </div>

          {!isFill && (
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '24px', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
              <label style={{ display:'block', fontSize:'14px', color:'white', fontWeight:800, marginBottom:'16px' }}>
                Các Đáp Án {isSingle ? '(Chỉ chọn 1 đáp án đúng)' : '(Tích chọn các đáp án đúng)'} <span style={{color:'red'}}>*</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {f.options.map((opt, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: opt.isCorrect ? 'rgba(34,197,94,0.1)' : 'transparent', padding: '12px', borderRadius: '12px', border: `1px solid ${opt.isCorrect?'#22c55e':'rgba(255,255,255,0.05)'}` }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: opt.isCorrect ? '#22c55e' : 'rgba(255,255,255,0.1)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }} onClick={() => setOptionField(idx, 'isCorrect', !opt.isCorrect)}>
                      {opt.label}
                    </div>
                    <input style={{ ...inputCss, flex: 1, padding: '8px 16px', background: 'transparent', border: 'none' }} placeholder="Nhập nội dung đáp án..." value={opt.text} onChange={e => setOptionField(idx, 'text', e.target.value)} disabled={saving} />
                    <button style={{ background:'transparent', border:'none', color: opt.isCorrect ? '#22c55e' : 'var(--text-muted)', fontSize: '24px', cursor: 'pointer', outline: 'none' }} onClick={() => setOptionField(idx, 'isCorrect', !opt.isCorrect)}>
                      {opt.isCorrect ? '✅' : '⬛'}
                    </button>
                    {f.options.length > 2 && <button onClick={() => removeOption(idx)} style={{ background:'transparent', border:'none', color:'#ef4444', cursor:'pointer', fontSize:'18px' }}>✕</button>}
                  </div>
                ))}
              </div>
              {f.options.length < 6 && <button onClick={addOption} style={{ marginTop: '16px', padding: '10px 16px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700 }}>+ Thêm đáp án</button>}
            </div>
          )}

          {isFill && (
             <div style={{ background: 'rgba(0,0,0,0.2)', padding: '24px', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
               <label style={{ display:'block', fontSize:'14px', color:'white', fontWeight:800, marginBottom:'16px' }}>Các Đáp Án Chấp Nhận (Điền từ) <span style={{color:'red'}}>*</span></label>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                 {f.fillAnswers.map((ans, idx) => (
                   <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                     <input style={{...inputCss, flex: 1}} placeholder="Nhập đáp án đúng..." value={ans.answer} onChange={e => setFillField(idx, 'answer', e.target.value)} disabled={saving} />
                     <select style={{...inputCss, width: '150px'}} value={ans.matchMode} onChange={e => setFillField(idx, 'matchMode', e.target.value)} disabled={saving}>
                       <option value="exact">Khớp tuyệt đối</option>
                       <option value="contains">Chứa từ khóa</option>
                       <option value="ignore_case">Không phân biệt Hoa/Thường</option>
                     </select>
                     <div style={{ display:'flex', alignItems:'center', gap:'8px', color: ans.isPrimary ? '#22c55e' : 'var(--text-muted)' }}>
                        <input type="checkbox" checked={ans.isPrimary} onChange={e => setFillField(idx, 'isPrimary', e.target.checked)} style={{ width: '20px', height:'20px', cursor:'pointer' }} />
                        <span style={{ fontWeight: 800, fontSize: '13px' }}>Chính</span>
                     </div>
                     {f.fillAnswers.length > 1 && <button onClick={() => removeFillAnswer(idx)} style={{ background:'transparent', border:'none', color:'#ef4444', cursor:'pointer', fontSize:'20px' }}>✕</button>}
                   </div>
                 ))}
               </div>
               <button onClick={addFillAnswer} style={{ marginTop: '16px', padding: '10px 16px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700 }}>+ Thêm đáp án khác</button>
             </div>
          )}

          <div>
             <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Giải Thích Kèm Theo (Tùy chọn)</label>
             <textarea style={{...inputCss, minHeight: '60px', resize: 'vertical'}} placeholder="Giải thích chi tiết tại sao lại chọn đáp án này..." value={f.explanation} onChange={e => setField('explanation', e.target.value)} disabled={saving} />
          </div>

        </div>

        <div style={{ padding: '24px 32px', background: 'rgba(0,0,0,0.5)', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '16px' }}>
          <button style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: '15px' }} onClick={onClose} disabled={saving}>Hủy</button>
          <button style={{ flex: 2, padding: '14px', borderRadius: '12px', background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)', border: 'none', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: '15px', boxShadow: '0 8px 24px rgba(225,29,72,0.4)' }} onClick={onSave} disabled={saving}>{saving ? '⏳ ĐANG LƯU...' : (editQuestion ? '💾 ÁP DỤNG THAY ĐỔI' : '🚀 TẠO CÂU HỎI')}</button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
function QuestionDetailPanel({ question: q, onClose, onEdit }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!api || !q?.id) { setLoading(false); return; }
    api.questions.getById(q.id).then(res => { if (res.success) setDetail(res.question); setLoading(false); }).catch(() => setLoading(false));
  }, [q?.id]);

  const data = detail || q;

  return (
    <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(5px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-secondary)', width: '640px', maxWidth: '95vw', borderRadius: '24px', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '85vh', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>👁️ Chi Tiết Câu Hỏi</h3>
          <div style={{ display: 'flex', gap: '12px' }}>
            {onEdit && <button onClick={onEdit} style={{ background: 'rgba(59,130,246,0.1)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.2)', padding: '6px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>Chỉnh Sửa</button>}
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '32px', overflowY: 'auto' }}>
          {loading ? ( <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div> ) : (
            <>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
                <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, background: data.difficulty==='hard'?'rgba(239,68,68,0.1)':data.difficulty==='medium'?'rgba(245,158,11,0.1)':'rgba(34,197,94,0.1)', color: data.difficulty==='hard'?'#fca5a5':data.difficulty==='medium'?'#fcd34d':'#86efac' }}>{DIFF_LABEL[data.difficulty]}</span>
                <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, background: 'rgba(168,85,247,0.1)', color: '#d8b4fe' }}>{TYPE_LABEL[data.question_type]}</span>
                <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, background: 'rgba(59,130,246,0.1)', color: '#93c5fd' }}>{data.topic_name || 'Chưa Xếp Loại'}</span>
                {data.bloom_level && <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>{BLOOM_VI[data.bloom_level] || data.bloom_level}</span>}
                {data.is_ai_generated ? <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, background: 'rgba(236,72,153,0.1)', color: '#f9a8d4' }}>🤖 Tạo tự động (AI)</span> : <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>✍️ Tạo thủ công</span>}
                {data.estimated_time && <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>⏱️ {data.estimated_time}s</span>}
              </div>

              <div style={{ fontSize: '18px', fontWeight: 800, lineHeight: 1.6, color: 'white', marginBottom: '24px' }}>
                {data.question_text}
              </div>

              {data.question_type !== 'fill_in' && data.options?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                  {data.options.map((opt, i) => (
                    <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'center', background: opt.is_correct ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: `1px solid ${opt.is_correct ? '#22c55e' : 'rgba(255,255,255,0.05)'}` }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: opt.is_correct ? '#22c55e' : 'rgba(255,255,255,0.1)', color: 'white', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{opt.option_label || opt.label}</div>
                      <div style={{ flex: 1, fontSize: '15px', color: opt.is_correct ? 'white' : 'var(--text-secondary)' }}>{opt.option_text || opt.text}</div>
                      {opt.is_correct && <div style={{ color: '#22c55e', fontSize: '20px' }}>✓</div>}
                    </div>
                  ))}
                </div>
              )}

              {data.question_type === 'fill_in' && data.fillAnswers?.length > 0 && (
                <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>Đáp án được chấp nhận</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {data.fillAnswers.map((ans, i) => (
                      <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                         <div style={{ padding: '6px 12px', background: 'rgba(34,197,94,0.1)', color: '#4ade80', borderRadius: '8px', fontWeight: 700, fontSize: '14px', fontFamily: 'monospace' }}>{ans.accepted_answer || ans.answer}</div>
                         <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Chế Độ Khớp: [{ans.match_mode || ans.matchMode || 'exact'}]</div>
                         {(ans.is_primary || ans.isPrimary) && <div style={{ fontSize: '12px', color: '#fcd34d', fontWeight: 800 }}>• Đáp án chính</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.explanation && (
                <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(99,102,241,0.02) 100%)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: '#818cf8', textTransform: 'uppercase', marginBottom: '8px' }}>💡 Giải Thích Chuyên Sâu</div>
                  <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{data.explanation}</div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '32px', marginTop: '32px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Tỷ Lệ Trả Lời Đúng</div><div style={{ fontSize: '16px', color: 'white', fontWeight: 800 }}>{data.correct_rate != null ? `${Math.round(data.correct_rate)}%` : 'Chưa có dữ liệu thi'}</div></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Người Tạo</div><div style={{ fontSize: '16px', color: 'white', fontWeight: 800 }}>{data.creator_name || 'Không Rõ'}</div></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Ngày Tạo</div><div style={{ fontSize: '16px', color: 'white', fontWeight: 800 }}>{data.created_at ? new Date(data.created_at).toLocaleDateString('vi') : '—'}</div></div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
