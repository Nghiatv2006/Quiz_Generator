import React, { useState, useEffect, useCallback } from 'react';
import ExamTakingPage from './ExamTakingPage.jsx';

const api = typeof window !== 'undefined' ? window['electronAPI'] : null;

export default function ExamListPage({ user, showToast }) {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeExam, setActiveExam] = useState(null);
  const [accessCode, setAccessCode] = useState('');
  const [showCodeModal, setShowCodeModal] = useState(null);
  
  const [predictionByExam, setPredictionByExam] = useState({});
  const [loadingPrediction, setLoadingPrediction] = useState({});

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalExams, setTotalExams] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [filterTopic, setFilterTopic] = useState('');
  const [topics, setTopics] = useState([]);

  const LIMIT = 12;

  useEffect(() => {
    if (!api) return;
    api.topics.getAll({ limit: 100 }).then(res => {
      if (res.success) setTopics(res.topics || []);
    }).catch(console.error);
  }, []);

  const loadExams = useCallback(async (currentPage = page, search = searchText, topic = filterTopic) => {
    if (!api || !user?.id) return;
    
    setLoading(true);
    try {
      const res = await api.exams.getAll({ status: 'active', search: search || undefined, topicId: topic || undefined, page: currentPage, limit: LIMIT }, { id: user.id });
      if (res.success) {
        setExams(res.exams || []); setTotalPages(res.totalPages || Math.ceil((res.total || 0) / LIMIT)); setTotalExams(res.total || 0); setPage(currentPage);
      } else { setExams([]); showToast(res.message || 'Lỗi tải danh sách bài thi', 'error'); }
    } catch (e) {
      console.error(e); setExams([]); showToast('Lỗi kết nối: ' + e.message, 'error');
    } finally { setLoading(false); }
  }, [user?.id, showToast]);

  useEffect(() => { loadExams(1, '', ''); }, [user?.id]);

  const startExam = async (exam) => {
    setShowCodeModal(null);
    if (!api || !user?.id) return;

    try {
      const res = await api.exams.start({ examId: exam.id, userId: user.id, accessCode: accessCode?.trim() || undefined });
      if (res.success) {
        setActiveExam({
          examId: exam.id, attemptId: res.attemptId, exam: res.exam, questions: res.questions, adaptiveMeta: res.adaptiveMeta || null,
          enableAntiCheat: !!(res.exam?.enableAntiCheat ?? exam.enable_anti_cheat), requireFullscreen: !!(res.exam?.requireFullscreen ?? exam.require_fullscreen),
        });
        showToast('Bắt đầu làm bài!', 'success');
      } else {
        showToast(res.message || 'Không thể bắt đầu làm bài', 'error');
        if (res.message?.toLowerCase().includes('mã truy cập')) { setAccessCode(''); setShowCodeModal(exam); }
      }
    } catch (e) { showToast('Lỗi hệ thống: ' + e.message, 'error'); }
  };

  const predictScore = async (examId) => {
    if (!api || !user?.id || loadingPrediction[examId]) return;
    setLoadingPrediction(prev => ({ ...prev, [examId]: true }));
    try {
      const res = await api.ai.predictScore({ userId: user.id, examId });
      if (res.success) setPredictionByExam(prev => ({ ...prev, [examId]: res.prediction }));
      else showToast(res.message || 'Không thể dự đoán', 'error');
    } catch (e) { showToast('Tín hiệu AI: ' + e.message, 'error'); } 
    finally { setLoadingPrediction(prev => ({ ...prev, [examId]: false })); }
  };

  if (activeExam) {
    return (
      <ExamTakingPage attemptId={activeExam.attemptId} exam={activeExam.exam} questions={activeExam.questions} adaptiveMeta={activeExam.adaptiveMeta} enableAntiCheat={activeExam.enableAntiCheat} requireFullscreen={activeExam.requireFullscreen} user={user} showToast={showToast} onComplete={() => { setActiveExam(null); loadExams(page, searchText, filterTopic); }} onExit={() => { setActiveExam(null); loadExams(page, searchText, filterTopic); }} />
    );
  }

  const inputStyle = { background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'white', padding: '12px 16px', borderRadius: '12px', fontSize: '14px', outline: 'none' };

  return (
    <div className="page" style={{ padding: '32px', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      
      {/* Premium Hero Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(234,88,12,1) 0%, rgba(249,115,22,1) 50%, rgba(245,158,11,1) 100%)',
        borderRadius: '24px', padding: '32px', marginBottom: '32px', border: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden', flexWrap: 'wrap', gap: '20px'
      }}>
        {/* Glow Effects */}
        <div style={{ position: 'absolute', right: '-10%', top: '-20%', width: '300px', height: '300px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', filter: 'blur(50px)', zIndex: 0 }}></div>
        <div style={{ position: 'absolute', left: '-5%', bottom: '-20%', width: '200px', height: '200px', background: 'rgba(252,211,77,0.4)', borderRadius: '50%', filter: 'blur(60px)', zIndex: 0 }}></div>
        
        <div style={{ position: 'relative', zIndex: 2 }}>
          <h1 style={{ fontSize: '36px', fontWeight: 900, color: 'white', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', textShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '40px' }}>📝</span> Danh Sách Bài Thi
          </h1>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.9)', textShadow: '0 2px 8px rgba(0,0,0,0.1)', maxWidth: '600px' }}>
            Hệ thống đang mở {totalExams} bài kiểm tra chờ bạn tham gia.
          </p>
        </div>
        
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <select style={{ ...inputStyle, minWidth: '180px', background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', color: 'white' }} value={filterTopic} onChange={(e) => { setFilterTopic(e.target.value); loadExams(1, searchText, e.target.value); }}>
            <option value="" style={{color: 'black'}}>Tất Cả Chủ Đề</option>
            {topics.map(t => <option key={t.id} value={t.id} style={{color: 'black'}}>{t.icon} {t.name}</option>)}
          </select>
          <div style={{ position: 'relative', minWidth: '240px' }}>
             <span style={{ position: 'absolute', left: '16px', top: '13px', color: 'rgba(255,255,255,0.8)' }}>🔍</span>
             <input style={{ ...inputStyle, width: '100%', paddingLeft: '44px', background: 'rgba(0,0,0,0.15)', borderColor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)' }} placeholder="Tìm kiếm bài thi..." value={searchText} onChange={e=>setSearchText(e.target.value)} onKeyDown={e=>e.key==='Enter' && loadExams(1, searchText, filterTopic)} />
          </div>
          <button style={{ ...inputStyle, width: 'auto', background: 'rgba(255,255,255,0.2)', cursor: 'pointer', border: 'none', fontWeight: 800 }} onClick={() => loadExams(1, searchText, filterTopic)}>🔄 Tải Lại</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-page" style={{ height: '300px' }}><div className="spinner" /></div>
      ) : exams.length === 0 ? (
        <div style={{ background: 'var(--bg-secondary)', padding: '80px', borderRadius: '24px', textAlign: 'center', border: '1px dashed var(--border-accent)' }}>
           <div style={{ fontSize: '72px', marginBottom: '20px', filter: 'grayscale(0.5)' }}>📝</div>
           <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Không Có Bài Thi Đang Mở</div>
           <div style={{ color: 'var(--text-muted)', marginTop: '8px', marginBottom: '24px', fontSize: '15px' }}>Vui lòng thay đổi từ khóa lọc hoặc liên hệ giáo viên để tạo bài thi mới.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '24px' }}>
          {exams.map(e => {
            const isEmpty = !e.total_questions || e.total_questions <= 0;
            return (
              <div key={e.id} style={{
                background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px', position: 'relative', overflow: 'hidden', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', opacity: isEmpty ? 0.6 : 1, pointerEvents: isEmpty ? 'none' : 'auto', display: 'flex', flexDirection: 'column'
              }}
              onMouseOver={(ev) => { ev.currentTarget.style.transform = 'translateY(-6px)'; ev.currentTarget.style.boxShadow = `0 20px 40px rgba(249,115,22,0.15)`; ev.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)'; }}
              onMouseOut={(ev) => { ev.currentTarget.style.transform = 'translateY(0)'; ev.currentTarget.style.boxShadow = 'none'; ev.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                {/* Glow bar */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, rgba(234,88,12,1) 0%, rgba(250,204,21,1) 100%)' }}></div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800 }}>🟢 Đang Diễn Ra</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {e.enable_anti_cheat && <span title="Chống Gian Lận" style={{ fontSize: '16px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '4px' }}>🛡️</span>}
                    {e.require_fullscreen && <span title="Khoá Toàn Màn Hình" style={{ fontSize: '16px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '4px' }}>🖥️</span>}
                    {e.shuffle_questions && <span title="Nhiễu Động Dữ Liệu" style={{ fontSize: '16px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '4px' }}>🔀</span>}
                    {e.is_adaptive && <span title="Adaptive Học Thích Ứng" style={{ fontSize: '16px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '4px' }}>🧠</span>}
                    {e.has_access_code && <span title="Bảo Mật Bằng Passcode" style={{ fontSize: '16px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '4px', border: '1px solid #f59e0b' }}>🔑</span>}
                  </div>
                </div>

                <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginBottom: '8px', lineHeight: 1.3 }}>{e.title}</h3>
                
                <div style={{ marginBottom: '12px' }}>
                  <span style={{ background: 'rgba(249,115,22,0.1)', color: '#fdba74', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, border: '1px solid rgba(249,115,22,0.2)' }}>{e.topic_name || 'Chưa Có Chủ Đề'}</span>
                </div>
                
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', flex: 1 }}>
                  {e.description || <span style={{ opacity: 0.5 }}>Bài thi không có mô tả...</span>}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>THỜI GIAN</div>
                    <div style={{ fontSize: '16px', color: 'white', fontWeight: 800 }}>{e.duration_minutes} <span style={{fontSize: '12px', color:'var(--text-secondary)'}}>phút</span></div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>SỐ CÂU</div>
                    <div style={{ fontSize: '16px', color: isEmpty ? '#ef4444' : 'white', fontWeight: 800 }}>{e.total_questions || 0} <span style={{fontSize: '12px', color:'var(--text-secondary)'}}>câu</span></div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>ĐIỂM ĐẠT</div>
                    <div style={{ fontSize: '16px', color: 'white', fontWeight: 800 }}>{e.passing_score}/{e.max_score || 10} <span style={{fontSize: '12px', color:'var(--text-secondary)'}}>điểm</span></div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>LƯỢT THI</div>
                    <div style={{ fontSize: '16px', color: 'white', fontWeight: 800 }}>{e.attempt_count || 0} <span style={{fontSize: '12px', color:'var(--text-secondary)'}}>lần</span></div>
                  </div>
                </div>

                {predictionByExam[e.id] && (
                  <div style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.1) 0%, rgba(59,130,246,0.1) 100%)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(168,85,247,0.3)', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '18px' }}>🚀</span>
                      <strong style={{ fontSize: '14px', color: '#d8b4fe' }}>Dự Đoán Kết Quả: {predictionByExam[e.id].predictedScore}/10</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <span>Độ Chính Xác: <strong style={{ color: 'white' }}>{predictionByExam[e.id].confidence}%</strong></span>
                      <span>Xác Suất Vượt Qua: <strong style={{ color: '#4ade80' }}>{predictionByExam[e.id].passChance}%</strong></span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', marginTop: 'auto' }}>
                  <button 
                    style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 700, cursor: 'pointer', transition: '0.2s', fontSize: '13px' }}
                    onClick={() => predictScore(e.id)} disabled={!!loadingPrediction[e.id] || isEmpty} onMouseOver={ev=>ev.currentTarget.style.background='rgba(59,130,246,0.2)'} onMouseOut={ev=>ev.currentTarget.style.background='rgba(255,255,255,0.05)'}
                  >
                    {loadingPrediction[e.id] ? '⏳ PHÂN TÍCH...' : '🔮 AI DỰ ĐOÁN'}
                  </button>
                  <button 
                    style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer', transition: '0.2s', fontSize: '13px', boxShadow: '0 4px 12px rgba(234,88,12,0.4)' }}
                    disabled={isEmpty}
                    onClick={() => { if (e.has_access_code) { setAccessCode(''); setShowCodeModal(e); } else startExam(e); }}
                  >
                    {isEmpty ? '⚠️ TRỐNG' : '🚀 VÀO THI NGAY'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '32px', background: 'var(--bg-glass)', padding: '16px 24px', borderRadius: '16px', border: '1px solid var(--border)' }}>
           <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 500 }}>
             Đang hiển thị trang <strong style={{ color: 'var(--text-primary)' }}>{page}</strong> / <strong style={{ color: 'var(--accent)' }}>{totalPages}</strong>
           </span>
           <div style={{ display: 'flex', gap: '8px' }}>
             <button onClick={() => loadExams(1, searchText, filterTopic)} disabled={page === 1} style={{ ...inputStyle, width: '40px', padding: 0, textAlign: 'center', cursor: page===1?'default':'pointer', opacity: page===1?0.5:1 }}>«</button>
             <button onClick={() => loadExams(page-1, searchText, filterTopic)} disabled={page === 1} style={{ ...inputStyle, width: '40px', padding: 0, textAlign: 'center', cursor: page===1?'default':'pointer', opacity: page===1?0.5:1 }}>‹</button>
             {(() => {
               const start = Math.max(1, Math.min(page-2, totalPages-4));
               return Array.from({ length: Math.min(5, totalPages) }, (_, i) => start+i).map(pg => (
                 <button key={pg} onClick={() => loadExams(pg, searchText, filterTopic)} style={{
                   ...inputStyle, width: '40px', padding: 0, textAlign: 'center', cursor: 'pointer',
                   background: pg === page ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' : 'rgba(255,255,255,0.05)',
                   color: pg === page ? '#fff' : 'white', border: pg===page?'none':'1px solid var(--border)', fontWeight: pg===page?800:500
                 }}>{pg}</button>
               ));
             })()}
             <button onClick={() => loadExams(page+1, searchText, filterTopic)} disabled={page === totalPages} style={{ ...inputStyle, width: '40px', padding: 0, textAlign: 'center', cursor: page===totalPages?'default':'pointer', opacity: page===totalPages?0.5:1 }}>›</button>
             <button onClick={() => loadExams(totalPages, searchText, filterTopic)} disabled={page === totalPages} style={{ ...inputStyle, width: '40px', padding: 0, textAlign: 'center', cursor: page===totalPages?'default':'pointer', opacity: page===totalPages?0.5:1 }}>»</button>
           </div>
         </div>
      )}

      {/* Modern Access Code Modal */}
      {showCodeModal && (
        <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', backdropFilter:'blur(10px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }} onClick={() => setShowCodeModal(null)}>
          <div style={{ background: 'var(--bg-secondary)', width: '450px', borderRadius: '24px', border: '1px solid rgba(245,158,11,0.3)', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.8)' }} onClick={e => e.stopPropagation()}>
            <div style={{ background: 'linear-gradient(90deg, rgba(245,158,11,0.2) 0%, rgba(217,119,6,0.2) 100%)', padding: '24px', borderBottom: '1px solid rgba(245,158,11,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>🔐 Yêu Cầu Mã Xác Thực</h3>
              <button onClick={() => setShowCodeModal(null)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ padding: '32px' }}>
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 700, textTransform: 'uppercase' }}>Bài được bảo vệ:</div>
                <div style={{ fontSize: '16px', color: '#fcd34d', fontWeight: 800 }}>{showCodeModal.title}</div>
              </div>
              <label style={{ display:'block', fontSize:'13px', color:'var(--text-muted)', fontWeight:700, marginBottom:'8px', textTransform:'uppercase' }}>[ NHẬP MÃ THAM GIA ]</label>
              <input 
                style={{ ...inputStyle, width: '100%', fontSize: '18px', textAlign: 'center', letterSpacing: '4px', fontWeight: 800, borderColor: 'rgba(245,158,11,0.5)', background: 'rgba(0,0,0,0.4)', color: '#fcd34d' }}
                placeholder="••••••" 
                value={accessCode}
                onChange={e => setAccessCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && startExam(showCodeModal)} 
                autoFocus 
              />
            </div>
            <div style={{ padding: '24px 32px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '16px' }}>
              <button style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', fontWeight: 800, cursor: 'pointer' }} onClick={() => setShowCodeModal(null)}>HUỶ</button>
              <button style={{ flex: 2, padding: '14px', borderRadius: '12px', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', border: 'none', color: 'white', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }} onClick={() => startExam(showCodeModal)} disabled={!accessCode?.trim()}>
                MỞ BÀI THI 🔓
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
