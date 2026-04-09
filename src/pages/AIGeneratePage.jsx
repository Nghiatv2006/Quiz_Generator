import React, { useState, useEffect, useRef } from 'react';

const api = typeof window !== 'undefined' ? window['electronAPI'] : null;

const DIFF_LABELS = { easy: '🟢 Dễ', medium: '🟡 TB', hard: '🔴 Khó', mixed: '🎲 Hỗn hợp' };
const BLOOM_LABELS = {
  '': 'Tự động', remember: 'Ghi Nhớ', understand: 'Thấu Hiểu',
  apply: 'Áp Dụng', analyze: 'Phân Tích', evaluate: 'Đánh Giá', create: 'Sáng Tạo',
};
const QTYPE_LABELS = {
  single_choice: '🔘 Trắc nghiệm 1 đáp án',
  multiple_choice: '☑️ Trắc nghiệm nhiều đáp án',
  fill_in: '✍️ Điền vào chỗ trống',
};

const DEFAULT_FORM = {
  topicId: '', topicName: '', content: '',
  count: 10, difficulty: 'mixed',
  questionType: 'single_choice', bloomLevel: '',
};

function normalizeQuestion(q, index) {
  return {
    questionText: q.questionText || q.question_text || q.question || `Câu hỏi #${index + 1}`,
    questionType: q.questionType || q.question_type || q.type || 'single_choice',
    difficulty:   q.difficulty  || 'medium',
    bloomLevel:   q.bloomLevel  || q.bloom_level  || '',
    explanation:  q.explanation || '',
    estimatedTime: q.estimatedTime || q.estimated_time || 45,
    tags:         q.tags || [],
    options: (q.options || []).map((opt, i) => ({
      label:     opt.label     || String.fromCharCode(65 + i),
      text:      opt.text      || opt.optionText || opt.option_text || String(opt),
      isCorrect: !!(opt.isCorrect || opt.is_correct),
    })),
    acceptedAnswers: q.acceptedAnswers || q.accepted_answers || [],
    matchMode:       q.matchMode       || q.match_mode       || 'ignore_case',
  };
}

export default function AIGeneratePage({ user, showToast }) {
  const [topics,   setTopics]   = useState([]);
  const [form,     setForm]     = useState(DEFAULT_FORM);
  const [tab,      setTab]      = useState('text');

  const [generatedQuestions, setGeneratedQuestions] = useState([]);
  const [selectedIdxs,       setSelectedIdxs]       = useState(new Set());
  const [editingIdx,         setEditingIdx]          = useState(null); 

  const [loading,   setLoading]  = useState(false);
  const [saving,    setSaving]   = useState(false);
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 });
  const [aiStatus,  setAiStatus] = useState(null);

  useEffect(() => {
    api?.topics?.getAll({ limit: 500 })
      .then(res => { if (res?.success) setTopics(res.topics || []); })
      .catch(() => {});

    api?.ai?.checkStatus(user?.id)
      .then(res => { if (res?.success) setAiStatus(res); })
      .catch(() => {});
  }, []); 

  const setFormField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const generateFromText = async () => {
    if (!form.content.trim()) { showToast('Vui lòng nhập nội dung', 'error'); return; }
    if (!form.topicId)        { showToast('Vui lòng chọn chủ đề trước', 'error'); return; }
    setLoading(true);
    try {
      const res = await api.ai.generateQuestions({
        topic:        form.topicName || 'General',
        content:      form.content,
        count:        form.count,
        difficulty:   form.difficulty,
        bloomLevel:   form.bloomLevel  || undefined,
        questionType: form.questionType || 'single_choice',
        userId:       user.id,
      });

      if (res.success && res.questions?.length) {
        const normalized = res.questions.map(normalizeQuestion);
        setGeneratedQuestions(normalized);
        setSelectedIdxs(new Set(normalized.map((_, i) => i)));
        setEditingIdx(null);
        showToast(`✅ AI đã sinh ${normalized.length} câu hỏi! (${res.tokensUsed || 0} tokens)`, 'success');
      } else {
        showToast(res.message || 'AI không sinh được câu hỏi nào', 'error');
      }
    } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  const generateFromImage = async () => {
    if (!form.topicId) { showToast('Vui lòng chọn chủ đề trước', 'error'); return; }
    try {
      const result = await api.dialog.openFile({
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      });
      if (result.canceled || !result.filePaths.length) return;
      setLoading(true);
      const res = await api.ai.generateFromImage({
        imagePath: result.filePaths[0],
        topic:     form.topicName || 'General',
        count:     form.count,
        userId:    user.id,
      });
      if (res.success && res.questions?.length) {
        const normalized = res.questions.map(normalizeQuestion);
        setGeneratedQuestions(normalized);
        setSelectedIdxs(new Set(normalized.map((_, i) => i)));
        showToast(`✅ AI đã sinh ${normalized.length} câu từ ảnh!`, 'success');
      } else { showToast(res.message || 'Lỗi sinh từ ảnh', 'error'); }
    } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  const generateFromDocument = async () => {
    if (!form.topicId) { showToast('Vui lòng chọn chủ đề trước', 'error'); return; }
    try {
      const result = await api.dialog.openFile({
        filters: [{ name: 'Documents', extensions: ['pdf', 'txt', 'docx', 'md'] }]
      });
      if (result.canceled || !result.filePaths.length) return;
      setLoading(true);
      showToast('📄 Đang đọc tài liệu...', 'info');

      const sumRes = await api.ai.summarizeDocument({
        filePath: result.filePaths[0], userId: user.id, topicId: form.topicId || null,
      });

      if (!sumRes.success || !sumRes.summary) {
        showToast(sumRes.message || 'Không thể đọc tài liệu', 'error');
        setLoading(false);
        return;
      }

      showToast('🤖 Đang sinh câu hỏi từ tài liệu...', 'info');
      const content = sumRes.summary.overallSummary ||
        (sumRes.summary.chapters || []).map(c => c.summary).join('\n');

      const res = await api.ai.generateQuestions({
        topic:       form.topicName || 'Document',
        content:     content.substring(0, 10000),
        count:       form.count,
        difficulty:  form.difficulty,
        bloomLevel:  form.bloomLevel  || undefined,
        questionType: form.questionType || 'single_choice',
        userId:      user.id,
      });
      if (res.success && res.questions?.length) {
        const normalized = res.questions.map(normalizeQuestion);
        setGeneratedQuestions(normalized);
        setSelectedIdxs(new Set(normalized.map((_, i) => i)));
        showToast(`✅ AI đã sinh ${normalized.length} câu từ tài liệu!`, 'success');
      } else {
        showToast(res.message || 'Không sinh được câu hỏi', 'error');
      }
    } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  const saveSelected = async () => {
    const toSave = generatedQuestions
      .map((q, i) => ({ q, i }))
      .filter(({ i }) => selectedIdxs.has(i));

    if (!toSave.length) { showToast('Chọn ít nhất 1 câu để lưu', 'error'); return; }
    if (!form.topicId)  { showToast('Vui lòng chọn chủ đề', 'error'); return; }

    setSaving(true);
    setSaveProgress({ done: 0, total: toSave.length });

    let saved = 0, failed = 0;
    const failedIdxs = new Set();

    const questionsPayload = toSave.map(({ q }) => {
      const base = {
        topicId:      form.topicId,
        questionText: q.questionText,
        questionType: q.questionType,
        difficulty:   q.difficulty   || 'medium',
        bloomLevel:   q.bloomLevel   || null,
        explanation:  q.explanation  || '',
        estimatedTime: q.estimatedTime || null,
        isAiGenerated: true,
        createdBy:    user.id,
        tags:         q.tags || [],
      };
      if (q.questionType === 'fill_in') {
        return {
          ...base,
          fillAnswers: (q.acceptedAnswers.length > 0
            ? q.acceptedAnswers.map(a => ({ acceptedAnswer: a, matchMode: q.matchMode || 'ignore_case' }))
            : [{ acceptedAnswer: q.questionText.split('_').pop()?.trim() || '?', matchMode: 'ignore_case' }]),
        };
      }
      return {
        ...base,
        options: q.options.map((opt, i) => ({
          optionLabel: opt.label || String.fromCharCode(65 + i),
          optionText:  opt.text,
          isCorrect:   !!opt.isCorrect,
          sortOrder:   i + 1,
        })),
      };
    });

    try {
      const res = await api.questions.bulkImport(questionsPayload, { id: user.id, role: user.role });
      if (res.success) {
        saved = res.saved || toSave.length;
        failed = res.failed || 0;
      } else {
        for (let k = 0; k < toSave.length; k++) {
          const { q, i: origIdx } = toSave[k];
          try {
            const singleRes = await api.questions.create(questionsPayload[k], { id: user.id });
            if (singleRes.success) { saved++; }
            else { failed++; failedIdxs.add(origIdx); }
          } catch { failed++; failedIdxs.add(origIdx); }
          setSaveProgress({ done: k + 1, total: toSave.length });
        }
      }
    } catch (err) {
      showToast('Lỗi lưu: ' + err.message, 'error');
      setSaving(false);
      return;
    }

    if (saved > 0) {
      const savedOrigIdxs = toSave.filter(({ i }) => !failedIdxs.has(i)).map(({ i }) => i);
      const remainingQuestions = generatedQuestions.filter((_, i) => !selectedIdxs.has(i) || failedIdxs.has(i));
      const newSelectedIdxs = new Set();
      failedIdxs.forEach(fi => {
        const newIdx = remainingQuestions.findIndex((_, ni) => generatedQuestions.indexOf(generatedQuestions.filter((_, oi) => !selectedIdxs.has(oi) || failedIdxs.has(oi))[ni]) === fi);
        if (newIdx !== -1) newSelectedIdxs.add(newIdx);
      });

      setGeneratedQuestions(remainingQuestions);
      setSelectedIdxs(newSelectedIdxs);
      if (editingIdx !== null && savedOrigIdxs.includes(editingIdx)) setEditingIdx(null);
    }

    if (failed > 0) { showToast(`⚠️ Đã lưu ${saved}/${toSave.length} câu. ${failed} câu lỗi giữ lại để xem lại.`, 'warning'); } 
    else { showToast(`✅ Đã lưu ${saved} câu hỏi vào ngân hàng!`, 'success'); }

    setSaving(false);
    setSaveProgress({ done: 0, total: 0 });
  };

  const updateQuestion = (idx, field, value) => {
    setGeneratedQuestions(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const updateOption = (qIdx, optIdx, field, value) => {
    setGeneratedQuestions(prev => {
      const updated = [...prev];
      const opts = [...updated[qIdx].options];
      opts[optIdx] = { ...opts[optIdx], [field]: value };
      if (field === 'isCorrect' && value && updated[qIdx].questionType === 'single_choice') {
        opts.forEach((o, i) => { if (i !== optIdx) opts[i] = { ...o, isCorrect: false }; });
      }
      updated[qIdx] = { ...updated[qIdx], options: opts };
      return updated;
    });
  };

  const toggleSelect = (idx) => {
    setSelectedIdxs(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const selectAll   = () => setSelectedIdxs(new Set(generatedQuestions.map((_, i) => i)));
  const deselectAll = () => setSelectedIdxs(new Set());

  const removeQuestion = (idx) => {
    setGeneratedQuestions(prev => prev.filter((_, i) => i !== idx));
    setSelectedIdxs(prev => {
      const next = new Set();
      prev.forEach(si => { if (si < idx) next.add(si); else if (si > idx) next.add(si - 1); });
      return next;
    });
    if (editingIdx === idx) setEditingIdx(null);
    else if (editingIdx !== null && editingIdx > idx) setEditingIdx(editingIdx - 1);
  };

  const inputStyle = { background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'white', padding: '12px 16px', borderRadius: '12px', fontSize: '14px', outline: 'none' };

  return (
    <div className="page" style={{ padding: '32px', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      
      {/* Premium UI Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(79,70,229,1) 0%, rgba(124,58,237,1) 50%, rgba(147,51,234,1) 100%)',
        borderRadius: '24px', padding: '32px', marginBottom: '32px', border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden', flexWrap: 'wrap', gap: '20px'
      }}>
        {/* Glow Effects */}
        <div style={{ position: 'absolute', right: '-10%', top: '-20%', width: '300px', height: '300px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', filter: 'blur(50px)', zIndex: 0 }}></div>
        <div style={{ position: 'absolute', left: '-5%', bottom: '-20%', width: '200px', height: '200px', background: 'rgba(192,132,252,0.4)', borderRadius: '50%', filter: 'blur(60px)', zIndex: 0 }}></div>
        
        <div style={{ position: 'relative', zIndex: 2 }}>
          <h1 style={{ fontSize: '36px', fontWeight: 900, color: 'white', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', textShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '40px' }}>🤖</span> Trợ Lý AI Sinh Câu Hỏi
          </h1>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.9)', textShadow: '0 2px 8px rgba(0,0,0,0.1)', maxWidth: '600px' }}>
            Sử dụng trí tuệ nhân tạo để tự động bóc tách và tạo câu hỏi trắc nghiệm từ văn bản, hình ảnh, và tài liệu.
          </p>
        </div>
        
        {/* Connection Status Badges */}
        {aiStatus && (
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '12px 16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: aiStatus.ollama?.online ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)', padding: '6px 12px', borderRadius: '8px', border: `1px solid ${aiStatus.ollama?.online ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'}`, fontSize: '12px', fontWeight: 700, color: 'white' }}>
               🦙 Ollama: {aiStatus.ollama?.online ? `✅ ${aiStatus.ollama.activeModel}` : '❌ Offline'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: aiStatus.gemini?.configured ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)', padding: '6px 12px', borderRadius: '8px', border: `1px solid ${aiStatus.gemini?.configured ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'}`, fontSize: '12px', fontWeight: 700, color: 'white' }}>
               ✨ Gemini: {aiStatus.gemini?.configured ? '✅ Kết Nối' : '❌ Chưa Cấu Hình'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(59,130,246,0.3)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.5)', fontSize: '12px', fontWeight: 700, color: 'white' }}>
               ⚡ Nguồn: {(aiStatus.currentProvider || 'auto').toUpperCase()}
            </div>
          </div>
        )}
      </div>

      {/* Grid Layout for Configuration & Input Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 1fr) 2fr', gap: '24px', marginBottom: '32px' }}>
        
        {/* Left: Configuration Panel */}
        <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
            ⚙️ Thuộc Tính Sinh Câu Hỏi
          </h3>
          
          <div>
            <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Chủ đề áp dụng <span style={{color:'#ef4444'}}>*</span></label>
            <select style={{...inputStyle, width: '100%', borderColor: 'rgba(139,92,246,0.5)', background: 'rgba(0,0,0,0.3)'}} value={form.topicId}
              onChange={e => {
                const t = topics.find(t => String(t.id) === e.target.value);
                setFormField('topicId', e.target.value);
                setFormField('topicName', t?.name || '');
              }}>
              <option value="">— Chọn vị trí lưu trữ —</option>
              {topics.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Số Vị Trí (Câu)</label>
              <select style={{...inputStyle, width: '100%'}} value={form.count} onChange={e => setFormField('count', parseInt(e.target.value))}>
                {[5, 10, 15, 20, 30, 50].map(n => <option key={n} value={n}>{n} câu</option>)}
              </select>
            </div>
            <div>
              <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Độ Khó</label>
              <select style={{...inputStyle, width: '100%'}} value={form.difficulty} onChange={e => setFormField('difficulty', e.target.value)}>
                {Object.entries(DIFF_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          <div>
             <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Dạng Câu Hỏi</label>
             <select style={{...inputStyle, width: '100%'}} value={form.questionType} onChange={e => setFormField('questionType', e.target.value)}>
               {Object.entries(QTYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
             </select>
          </div>

          <div>
             <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>Mức Độ Nhận Thức (Bloom)</label>
             <select style={{...inputStyle, width: '100%'}} value={form.bloomLevel} onChange={e => setFormField('bloomLevel', e.target.value)}>
               {Object.entries(BLOOM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
             </select>
          </div>
        </div>

        {/* Right: Input Panel */}
        <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>
            {[ { key: 'text', icon: '📝', label: 'Văn Bản Chữ' }, { key: 'image', icon: '🖼️', label: 'Quét Hình Ảnh' }, { key: 'document', icon: '📄', label: 'Đọc Tài Liệu' } ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                flex: 1, padding: '18px 0', background: tab === t.key ? 'transparent' : 'rgba(0,0,0,0.2)', border: 'none', cursor: 'pointer',
                fontWeight: 800, fontSize: '14px', color: tab === t.key ? '#a855f7' : 'var(--text-muted)', transition: 'all 0.2s',
                borderBottom: `3px solid ${tab === t.key ? '#a855f7' : 'transparent'}`
              }}>
                <span style={{ fontSize: '18px', marginRight: '8px' }}>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>

          <div style={{ padding: '32px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            {tab === 'text' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <textarea 
                  style={{ ...inputStyle, flex: 1, minHeight: '300px', resize: 'vertical', fontSize: '15px', lineHeight: 1.6, borderColor: 'rgba(168,85,247,0.3)', background: 'rgba(0,0,0,0.3)' }}
                  placeholder="Dán nội dung giáo trình, bài báo, bài viết... để AI phân tích và nhặt số liệu/kiến thức thành câu hỏi."
                  value={form.content} onChange={e => setFormField('content', e.target.value)}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Độ dài: <strong style={{ color: 'white' }}>{form.content.length.toLocaleString()} ký tự</strong>
                    {form.content.length > 12000 && <span style={{ color: '#f59e0b', marginLeft: '12px' }}>⚠️ Chỉ phân tích 15,000 ký tự đầu</span>}
                  </span>
                  <button 
                    style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', border: 'none', color: 'white', padding: '14px 28px', borderRadius: '12px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 24px rgba(139,92,246,0.3)' }}
                    onClick={generateFromText} disabled={loading || !form.content.trim()}
                  >
                    {loading ? '⏳ AI BẮT ĐẦU CHẠY...' : '🤖 BẮT ĐẦU RÚT TRÍCH'}
                  </button>
                </div>
              </div>
            )}

            {tab === 'image' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '350px' }}>
                <div style={{ width: '120px', height: '120px', borderRadius: '32px', background: 'rgba(168,85,247,0.1)', border: '2px dashed rgba(168,85,247,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px', marginBottom: '24px' }}>📸</div>
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginBottom: '12px' }}>Tích hợp thị giác máy tính</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '32px', textAlign: 'center', maxWidth: '400px', lineHeight: 1.5 }}>Hỗ trợ sinh câu hỏi trực tiếp từ ảnh chụp màn hình bài giảng, thiết đồ, sách giáo khoa định dạng JPG, PNG, WebP.</p>
                <button 
                  style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', border: 'none', color: 'white', padding: '16px 32px', borderRadius: '16px', fontSize: '16px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 24px rgba(139,92,246,0.3)' }}
                  onClick={generateFromImage} disabled={loading}
                >
                  {loading ? '⏳ ĐANG PHÂN TÍCH ẢNH...' : '📤 TẢI ẢNH LÊN & XỬ LÝ'}
                </button>
                {!aiStatus?.ollama?.online && (
                  <p style={{ fontSize: '13px', color: '#f59e0b', marginTop: '24px', background: 'rgba(245,158,11,0.1)', padding: '8px 16px', borderRadius: '8px' }}>
                    ⚠️ Trích xuất hình ảnh tốt nhất qua API Gemini.
                  </p>
                )}
              </div>
            )}

            {tab === 'document' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '350px' }}>
                <div style={{ width: '120px', height: '120px', borderRadius: '32px', background: 'rgba(59,130,246,0.1)', border: '2px dashed rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px', marginBottom: '24px' }}>📑</div>
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginBottom: '12px' }}>Phân tách hồ sơ</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '32px', textAlign: 'center', maxWidth: '400px', lineHeight: 1.5 }}>Đọc hiểu và trích xuất câu hỏi thẳng từ tài liệu Word, PDF, văn bản Text. Thích hợp cho bộ đề quy mô lớn.</p>
                <button 
                  style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', border: 'none', color: 'white', padding: '16px 32px', borderRadius: '16px', fontSize: '16px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 24px rgba(59,130,246,0.3)' }}
                  onClick={generateFromDocument} disabled={loading}
                >
                  {loading ? '⏳ ĐANG QUÉT TÀI LIỆU...' : '📤 ĐỌC TÀI LIỆU ĐÍNH KÈM'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loading Overlay State */}
      {loading && (
        <div style={{ background: 'var(--bg-glass)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '24px', padding: '60px', textAlign: 'center', marginBottom: '32px' }}>
          <div className="spinner" style={{ margin: '0 auto 24px', transform: 'scale(1.5)' }} />
          <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#a855f7', marginBottom: '12px' }}>HỆ THỐNG AI ĐANG LÀM VIỆC...</h3>
          <p style={{ color: 'var(--text-muted)' }}>Mô hình đang phân tích ngữ cảnh, vui lòng đợi từ 10 - 60 giây.</p>
        </div>
      )}

      {/* Generated Results Panel */}
      {generatedQuestions.length > 0 && !loading && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '24px', padding: '32px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
               <h3 style={{ fontSize: '22px', fontWeight: 800, color: 'white', margin: 0 }}>✨ Kết Quả Trích Xuất</h3>
               <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>Tổng số {generatedQuestions.length} câu hỏi. Đang đánh dấu chọn {selectedIdxs.size} câu.</p>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px 16px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer' }} onClick={selectAll}>☑️ Chọn Hết</button>
              <button style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px 16px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer' }} onClick={deselectAll}>⬜ Bỏ Chọn</button>
              <button 
                style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', color: 'white', padding: '10px 24px', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 16px rgba(16,185,129,0.3)', opacity: (saving || !selectedIdxs.size) ? 0.6 : 1 }} 
                onClick={saveSelected} disabled={saving || !selectedIdxs.size}
              >
                {saving ? (saveProgress.total > 0 ? `⏳ LƯU ${saveProgress.done}/${saveProgress.total}` : '⏳ ĐANG LƯU...') : `📥 LƯU ${selectedIdxs.size} CÂU KẾT QUẢ`}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {generatedQuestions.map((q, i) => (
              <QuestionCard
                key={i} q={q} idx={i}
                selected={selectedIdxs.has(i)}
                isEditing={editingIdx === i}
                onToggle={() => toggleSelect(i)}
                onEdit={() => setEditingIdx(editingIdx === i ? null : i)}
                onRemove={() => removeQuestion(i)}
                onUpdateField={(field, val) => updateQuestion(i, field, val)}
                onUpdateOption={(optIdx, field, val) => updateOption(i, optIdx, field, val)}
              />
            ))}
          </div>
          
          {selectedIdxs.size > 0 && (
             <div style={{
               position: 'sticky', bottom: 32, marginTop: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
               background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.5)', borderRadius: '16px', padding: '16px 24px',
               boxShadow: '0 20px 40px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', zIndex: 10
             }}>
                <div>
                   <div style={{ fontSize: '15px', fontWeight: 800, color: 'white', marginBottom: '4px' }}>Chuẩn bị đưa dữ liệu vào Ngân Hàng</div>
                   <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      Sẽ lưu {selectedIdxs.size} câu hỏi vào Chủ đề: <strong style={{ color: form.topicId ? '#a855f7' : '#ef4444' }}>{form.topicName || 'CHƯA CHỌN MỤC NHẬN!'}</strong>
                   </div>
                </div>
                <button 
                  style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', border: 'none', color: 'white', padding: '14px 32px', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 16px rgba(139,92,246,0.3)', fontSize: '15px' }} 
                  onClick={saveSelected} disabled={saving}
                >
                  {saving ? '⏳ ĐANG ĐẨY DỮ LIỆU...' : `📥 XÁC NHẬN LƯU ${selectedIdxs.size} CÂU`}
                </button>
             </div>
          )}

        </div>
      )}

    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Question Card Sub-component
function QuestionCard({ q, idx, selected, isEditing, onToggle, onEdit, onRemove, onUpdateField, onUpdateOption }) {
  const DIFF_COLOR = { easy: '#4ade80', medium: '#fbbf24', hard: '#f87171' };
  const inputStyle = { background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '8px 12px', borderRadius: '8px', fontSize: '14px', outline: 'none', width: '100%' };

  return (
    <div style={{
      background: selected ? 'rgba(139,92,246,0.05)' : 'rgba(0,0,0,0.2)', border: `1px solid ${selected ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.05)'}`,
      borderRadius: '16px', overflow: 'hidden', transition: 'all 0.2s', opacity: selected ? 1 : 0.6
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px',
        background: selected ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${selected ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)'}`
      }}>
        <div onClick={onToggle} style={{
          width: '24px', height: '24px', borderRadius: '6px', cursor: 'pointer', flexShrink: 0,
          border: `2px solid ${selected ? '#a855f7' : 'var(--text-muted)'}`, background: selected ? '#a855f7' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', fontWeight: 800
        }}>
          {selected && '✓'}
        </div>

        <span style={{ fontWeight: 800, fontSize: '15px', color: 'white' }}>Câu {idx + 1}</span>

        <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, background: `${DIFF_COLOR[q.difficulty] || '#a855f7'}20`, color: DIFF_COLOR[q.difficulty] || '#a855f7' }}>
          {q.difficulty === 'easy' ? 'Dễ' : q.difficulty === 'hard' ? 'Khó' : 'Trung Bình'}
        </span>

        {q.bloomLevel && <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, background: 'rgba(59,130,246,0.1)', color: '#93c5fd' }}>{q.bloomLevel}</span>}
        <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>{QTYPE_LABELS[q.questionType] || q.questionType}</span>
        
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button style={{ background: isEditing ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)', border: 'none', padding: '6px 12px', borderRadius: '8px', color: isEditing ? '#93c5fd' : 'white', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }} onClick={onEdit}>
            {isEditing ? 'Lưu Tạm' : 'Chỉnh Sửa'}
          </button>
          <button style={{ background: 'rgba(239,68,68,0.1)', border: 'none', padding: '6px 12px', borderRadius: '8px', color: '#fca5a5', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }} onClick={onRemove}>
            Xoá Bỏ
          </button>
        </div>
      </div>

      <div style={{ padding: '20px' }}>
        {isEditing ? (
          <textarea style={{ ...inputStyle, minHeight: '100px', resize: 'vertical', marginBottom: '16px' }} value={q.questionText} onChange={e => onUpdateField('questionText', e.target.value)} />
        ) : (
          <p style={{ fontSize: '15px', color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: '20px', whiteSpace: 'pre-wrap' }}>{q.questionText}</p>
        )}

        {(q.questionType === 'single_choice' || q.questionType === 'multiple_choice') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(q.options || []).map((opt, j) => (
              <div key={j} style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderRadius: '12px',
                background: opt.isCorrect ? 'rgba(34,197,94,0.1)' : 'rgba(0,0,0,0.2)', border: `1px solid ${opt.isCorrect ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.05)'}`
              }}>
                {isEditing && (
                   <input type={q.questionType === 'multiple_choice' ? 'checkbox' : 'radio'} checked={!!opt.isCorrect} onChange={e => onUpdateOption(j, 'isCorrect', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#22c55e', cursor: 'pointer' }} />
                )}
                <div style={{ width: '28px', height: '28px', background: opt.isCorrect ? '#22c55e' : 'rgba(255,255,255,0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'white', fontSize: '13px' }}>{opt.label}</div>
                {isEditing ? (
                  <input style={{ ...inputStyle, flex: 1, padding: '6px 12px' }} value={opt.text} onChange={e => onUpdateOption(j, 'text', e.target.value)} />
                ) : (
                  <span style={{ flex: 1, fontSize: '14px', color: opt.isCorrect ? 'white' : 'var(--text-secondary)' }}>{opt.text}</span>
                )}
                {opt.isCorrect && !isEditing && <span style={{ color: '#4ade80', fontWeight: 800, fontSize: '13px' }}>✓ ĐÁP ÁN</span>}
              </div>
            ))}
          </div>
        )}

        {q.questionType === 'fill_in' && (
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px dashed rgba(34,197,94,0.3)', padding: '12px 16px', borderRadius: '12px' }}>
             <strong style={{ color: '#4ade80', fontSize: '13px', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Văn bản chấp nhận:</strong>
             {isEditing ? (
               <input style={{ ...inputStyle, borderColor: 'rgba(34,197,94,0.4)' }} value={(q.acceptedAnswers || []).join(', ')} onChange={e => onUpdateField('acceptedAnswers', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="Nhập vào cách nhau dấu phẩy..." />
             ) : (
               <span style={{ fontSize: '15px', fontWeight: 600, color: 'white' }}>{(q.acceptedAnswers || []).join(' / ') || '—'}</span>
             )}
          </div>
        )}

        {q.explanation && (
          <div style={{ marginTop: '16px', background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontWeight: 800, fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>💡 Lời giải thích</span>
            {isEditing ? (
              <textarea style={{ ...inputStyle, minHeight: '60px' }} value={q.explanation} onChange={e => onUpdateField('explanation', e.target.value)} />
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{q.explanation}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
