import React, { useState, useEffect } from 'react';
const api = typeof window !== 'undefined' ? window['electronAPI'] : null;

export default function ExamResultPage({ attemptId, user, showToast, onBack }) {
  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiExplanation, setAiExplanation] = useState({});
  const [loadingExplanation, setLoadingExplanation] = useState({});
  const [learningPath, setLearningPath] = useState(null);
  const [loadingLearningPath, setLoadingLearningPath] = useState(false);
  const [examEvaluation, setExamEvaluation] = useState(null);
  const [loadingEvaluation, setLoadingEvaluation] = useState(false);

  useEffect(() => { loadResult(); }, [attemptId]);

  const loadResult = async () => {
    setLoading(true);
    try {
      const res = await api.attempts.getResult(attemptId);
      if (res.success) setAttempt(res.attempt);
      else showToast(res.message, 'error');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  const explainAnswer = async (answer) => {
    if (!api) return;
    const qid = answer.question_id;
    if (loadingExplanation[qid]) return;
    
    setLoadingExplanation(prev => ({ ...prev, [qid]: true }));
    try {
      const correctOpt = (answer.options || []).find(o => o.is_correct);
      const selectedLabels = (answer.selected_options || '').split(',');
      const selectedOpt = (answer.options || []).find(o => selectedLabels.includes(o.option_label));

      const res = await api.ai.explainAnswer({
        questionText: answer.question_text,
        selectedAnswer: selectedOpt?.option_text || answer.fill_answer || 'Không trả lời',
        correctAnswer: correctOpt?.option_text || 'N/A',
        userId: user.id,
      });
      if (res.success) setAiExplanation(prev => ({ ...prev, [qid]: res.explanation }));
      else showToast(res.message, 'error');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoadingExplanation(prev => ({ ...prev, [qid]: false })); }
  };

  const requestLearningPath = async () => {
    if (!api || loadingLearningPath) return;
    setLoadingLearningPath(true);
    try {
      const res = await api.ai.learningPath({ attemptId, userId: user.id });
      if (res.success) setLearningPath(res.learningPath);
      else showToast(res.message || 'Hệ thống AI quá tải, không thiết lập được lộ trình', 'error');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoadingLearningPath(false); }
  };

  const requestExamEvaluation = async () => {
    if (!api || loadingEvaluation) return;
    setLoadingEvaluation(true);
    try {
      const res = await api.ai.evaluateExam({ examId: attempt?.exam_id, userId: user.id });
      if (res.success) setExamEvaluation(res.evaluation);
      else showToast(res.message || 'Mạng lưới AI từ chối đánh giá', 'error');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoadingEvaluation(false); }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '20px' }}>
        <div className="spinner" style={{ transform: 'scale(1.5)', borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
        <h2 style={{ color: 'var(--text-muted)' }}>Đang trích xuất báo cáo phân tích...</h2>
      </div>
    );
  }
  
  if (!attempt) {
    return (
      <div style={{ padding: '100px', textAlign: 'center', background: 'var(--bg-glass)', borderRadius: '24px', border: '1px dashed rgba(255,255,255,0.1)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ Math: '64px', marginBottom: '16px', opacity: 0.5, filter: 'grayscale(1)' }}>❌</div>
        <h4 style={{ color: 'white', fontSize: '20px', fontWeight: 900 }}>Bản Ghi Bị Hủy</h4>
        <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>Dữ liệu lưu trữ cho phiên thi không được tìm thấy hoặc đã bị ghi đè.</p>
        <button onClick={onBack} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '10px 24px', borderRadius: '12px', fontWeight: 800, marginTop: '20px', cursor: 'pointer' }}>Quay trở lại</button>
      </div>
    );
  }

  return (
    <div className="page" style={{ padding: '32px', background: 'var(--bg-primary)', minHeight: '100vh', maxWidth: '100%', margin: '0 auto' }}>
      
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h2 style={{ fontSize: '32px', fontWeight: 900, color: 'white', display: 'flex', alignItems: 'center', gap: '12px' }}>
            📑 Giám Định Chi Tiết
          </h2>
          <div style={{ fontSize: '15px', color: 'var(--text-muted)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 700, color: '#93c5fd' }}>Mã lệnh: {attempt.exam_title}</span>
            <span>•</span>
            <span>Môn: {attempt.topic_name}</span>
          </div>
        </div>
        <button 
          onClick={onBack} 
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: '0.2s', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}
          onMouseOver={e=>e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseOut={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'}
        >
          <span>⬅️</span> RỜI KHỎI BÁO CÁO
        </button>
      </div>

      {/* Summary Stats Grid */}
      <div style={{
        background: attempt.is_passed ? 'linear-gradient(135deg, rgba(6,78,59,0.9) 0%, rgba(15,23,42,0.9) 100%)' : 'linear-gradient(135deg, rgba(127,29,29,0.9) 0%, rgba(15,23,42,0.9) 100%)',
        border: `1px solid ${attempt.is_passed ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`, borderRadius: '24px', padding: '32px', marginBottom: '32px',
        boxShadow: `0 20px 40px ${attempt.is_passed ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}`, position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '300px', height: '300px', background: attempt.is_passed ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', borderRadius: '50%', filter: 'blur(50px)', pointerEvents: 'none' }}></div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '24px', position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: '48px', fontWeight: 900, color: attempt.is_passed ? '#10b981' : '#ef4444', textShadow: `0 0 20px ${attempt.is_passed ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'}` }}>{attempt.score}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '1px' }}>Thành Tích</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: '32px', fontWeight: 900, color: '#34d399' }}>{attempt.correct_count}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '1px' }}>Chính Xác</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: '32px', fontWeight: 900, color: '#f87171' }}>{attempt.wrong_count}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '1px' }}>Sai Lệch</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text-muted)' }}>{attempt.unanswered_count}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '1px' }}>Vô Trị</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: '32px', fontWeight: 900, color: '#e2e8f0' }}>{Math.floor((attempt.time_taken_seconds || 0) / 60)}:{((attempt.time_taken_seconds || 0) % 60).toString().padStart(2, '0')}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '1px' }}>Tiêu Hao G.ian</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
             <div style={{ fontSize: '32px', fontWeight: 900, color: '#facc15', textShadow: '0 0 10px rgba(250,204,21,0.4)' }}>+{Number(attempt.xp_earned || 0)}</div>
             <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '1px' }}>Tích Lũy XP</div>
          </div>
        </div>
      </div>

      {/* AI Assistant Blocks */}
      <div style={{ display: 'grid', gap: '24px', marginBottom: '40px' }}>
        <div style={{ background: 'var(--bg-glass)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>🤖 Mạng Lưới AI Phân Tích</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>Áp dụng mô hình ngôn ngữ lớn để khai phá lỗ hổng kiến thức và đề xuất giải pháp.</div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={requestExamEvaluation} disabled={loadingEvaluation} style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd', padding: '12px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: 800, cursor: loadingEvaluation ? 'not-allowed' : 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyItems: 'center' }}>
                {loadingEvaluation ? <><span className="spinner" style={{ width: '14px', height: '14px', marginRight: '8px', borderTopColor: '#93c5fd' }} /> ĐANG KHAI THÁC...</> : '📊 AI BÁO CÁO CỤC BỘ'}
              </button>
              <button onClick={requestLearningPath} disabled={loadingLearningPath} style={{ background: 'linear-gradient(135deg, #a855f7, #7e22ce)', border: 'none', color: 'white', padding: '12px 24px', borderRadius: '12px', fontSize: '13px', fontWeight: 800, cursor: loadingLearningPath ? 'not-allowed' : 'pointer', transition: '0.2s', boxShadow: '0 8px 24px rgba(168,85,247,0.3)', display: 'flex', alignItems: 'center', justifyItems: 'center' }}>
                {loadingLearningPath ? <><span className="spinner" style={{ width: '14px', height: '14px', marginRight: '8px', borderTopColor: '#fff' }} /> ĐANG LƯA LUẬN...</> : '🎓 TẠO LỘ TRÌNH ĐỘT PHÁ'}
              </button>
            </div>
          </div>

          {(examEvaluation || learningPath) && <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }}></div>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
            {examEvaluation && (
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '16px', padding: '24px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }}></div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#93c5fd', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>📊 Khám Nghiệm Hiện Trường Tâm Trí</div>
                
                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.9)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: '16px' }}>{examEvaluation.overallAssessment}</div>
                
                <div style={{ display: 'flex', gap: '16px', background: 'rgba(255,255,255,0.05)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '16px' }}>
                   <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Mức Đạt Ước Tính</div><div style={{ fontSize: '18px', fontWeight: 900, color: '#34d399' }}>{examEvaluation.passRate}%</div></div>
                   <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                   <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sai Lệch Thống Kê</div><div style={{ fontSize: '18px', fontWeight: 900, color: '#f87171' }}>{examEvaluation.failRate}%</div></div>
                </div>

                {examEvaluation.recommendations?.length > 0 && (
                  <div>
                    <strong style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cảnh Báo Kỹ Năng:</strong>
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '24px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {examEvaluation.recommendations.map((item, idx) => <li key={idx} style={{ marginBottom: '6px' }}>{item}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {learningPath && (
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '16px', padding: '24px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #a855f7, #d946ef)' }}></div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#d8b4fe', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>🎓 Bản Đồ Học Thuật Thay Thế</div>
                
                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.9)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: '16px' }}>{learningPath.overallAssessment}</div>
                
                {learningPath.weakAreas?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '12px', color: '#fca5a5', fontWeight: 800 }}>NGUY CƠ LỖ HỔNG:</span>
                    {learningPath.weakAreas.map((w, idx) => <span key={idx} style={{ fontSize: '11px', background: 'rgba(239,68,68,0.1)', color: '#fca5a5', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(239,68,68,0.2)' }}>{w.area}</span>)}
                  </div>
                )}

                {learningPath.steps?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                    {learningPath.steps.slice(0, 3).map((step, idx) => (
                      <div key={idx} style={{ background: 'rgba(255,255,255,0.05)', padding: '12px 16px', borderRadius: '12px', borderLeft: '2px solid rgba(168,85,247,0.5)' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'white', marginBottom: '4px' }}>BƯỚC {idx+1}: {step.title}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{step.description}</div>
                      </div>
                    ))}
                  </div>
                )}

                {learningPath.motivationalNote && (
                  <div style={{ fontSize: '13px', color: '#fcd34d', padding: '12px', background: 'rgba(250,204,21,0.1)', borderRadius: '8px', border: '1px dashed rgba(250,204,21,0.3)', fontStyle: 'italic' }}>
                    " {learningPath.motivationalNote} "
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Answers Detail List */}
      <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'white', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        👁️ Hồ Sơ Phẫu Thuật Đáp Án
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {(attempt.answers || []).map((ans, i) => {
          const selectedLabels = (ans.selected_options || '').split(',').filter(Boolean);
          
          let lineBg = 'var(--text-muted)';
          let statusLabel = 'Vô Phạt';
          let statusColor = '#94a3b8';
          
          if (ans.is_correct === 1) { lineBg = '#10b981'; statusLabel = 'CHUẨN XÁC'; statusColor = '#10b981'; }
          else if (ans.is_correct === 0) { lineBg = '#ef4444'; statusLabel = 'SAI TRỌNG TÂM'; statusColor = '#ef4444'; }

          return (
            <div key={i} style={{
              background: 'var(--bg-glass)', borderRadius: '20px', padding: '24px', border: '1px solid rgba(255,255,255,0.05)',
              position: 'relative', overflow: 'hidden'
            }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '4px', background: lineBg, boxShadow: `0 0 10px ${lineBg}` }}></div>
              
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '4px 12px', borderRadius: '12px', fontWeight: 800 }}>Chỉ thị {ans.question_order || i + 1}</span>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: statusColor, textTransform: 'uppercase' }}>{statusLabel}</span>
                  <span style={{ fontSize: '11px', background: ans.difficulty === 'easy' ? 'rgba(16,185,129,0.1)' : ans.difficulty === 'hard' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', color: ans.difficulty === 'easy' ? '#6ee7b7' : ans.difficulty === 'hard' ? '#fca5a5' : '#fcd34d', padding: '2px 8px', borderRadius: '8px', border: `1px solid ${ans.difficulty === 'easy' ? 'rgba(16,185,129,0.2)' : ans.difficulty === 'hard' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`, fontWeight: 700, textTransform: 'uppercase' }}>{ans.difficulty || 'medium'}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {ans.time_spent_seconds ? `⏱️ Bốc hơi: ${ans.time_spent_seconds}s` : ''}
                  <span style={{ margin: '0 8px' }}>•</span>
                  <span style={{ color: ans.points_earned > 0 ? '#facc15' : 'var(--text-muted)' }}>XP: {ans.points_earned}</span>
                </div>
              </div>

              {/* Question Text */}
              <div style={{ fontSize: '16px', color: 'white', lineHeight: 1.6, marginBottom: '20px', fontWeight: 500 }}>
                {ans.question_text}
              </div>

              {/* Options */}
              {ans.question_type !== 'fill_in' && ans.options && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                  {ans.options.map((opt, j) => {
                    const isSelected = selectedLabels.includes(opt.option_label);
                    const isCorrect = opt.is_correct;
                    
                    let bg = 'rgba(0,0,0,0.3)';
                    let border = '1px solid rgba(255,255,255,0.05)';
                    
                    if (isCorrect) { bg = 'rgba(16,185,129,0.1)'; border = '1px solid #10b981'; }
                    else if (isSelected && !isCorrect) { bg = 'rgba(239,68,68,0.1)'; border = '1px solid #ef4444'; }

                    return (
                      <div key={j} style={{
                        padding: '12px 16px', borderRadius: '12px', background: bg, border: border, display: 'flex', alignItems: 'center', gap: '12px', transition: '0.2s', position: 'relative'
                      }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: isCorrect ? '#10b981' : isSelected ? '#ef4444' : 'rgba(255,255,255,0.1)', color: isCorrect || isSelected ? 'white' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800 }}>{opt.option_label}</div>
                        <div style={{ flex: 1, fontSize: '14px', color: isCorrect ? '#6ee7b7' : isSelected ? '#fca5a5' : 'var(--text-secondary)' }}>{opt.option_text}</div>
                        
                        {isCorrect && <div style={{ fontSize: '20px' }}>✅</div>}
                        {isSelected && !isCorrect && <div style={{ fontSize: '20px' }}>❌</div>}
                        
                        {isSelected && <div style={{ position: 'absolute', top: '-10px', right: '16px', fontSize: '10px', background: isCorrect ? '#10b981' : '#ef4444', color: 'white', padding: '2px 8px', borderRadius: '10px', fontWeight: 800 }}>LỰA CHỌN CỦA BẠN</div>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Fill-in Answer */}
              {ans.question_type === 'fill_in' && (
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px' }}>Tham Số Ghi Vào Hệ Thống:</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: ans.is_correct ? '#34d399' : '#f87171' }}>
                    {ans.fill_answer || '[ DỮ LIỆU TRỐNG ]'}
                  </div>
                </div>
              )}

              {/* Static Explanation */}
              {attempt.show_explanation && ans.explanation && (
                <div style={{ padding: '16px', background: 'rgba(14,165,233,0.1)', borderRadius: '12px', border: '1px solid rgba(14,165,233,0.2)', display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ fontSize: '20px' }}>💡</div>
                  <div>
                     <div style={{ fontSize: '13px', fontWeight: 800, color: '#38bdf8', marginBottom: '4px' }}>Chỉ Dẫn Hệ Thống Hỗ Trợ</div>
                     <div style={{ fontSize: '14px', color: '#bae6fd', lineHeight: 1.5 }}>{ans.explanation}</div>
                  </div>
                </div>
              )}

              {/* Dynamic AI Explanation */}
              <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '16px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                {aiExplanation[ans.question_id] ? (
                  <div style={{ width: '100%', padding: '16px', background: 'rgba(168,85,247,0.1)', borderRadius: '12px', border: '1px solid rgba(168,85,247,0.2)', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: '20px' }}>🤖</div>
                    <div style={{ flex: 1 }}>
                       <div style={{ fontSize: '13px', fontWeight: 800, color: '#c084fc', marginBottom: '6px' }}>Kiến Thức Tích Phân Từ Mạng AI</div>
                       <div style={{ fontSize: '14px', color: '#e9d5ff', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{aiExplanation[ans.question_id]}</div>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => explainAnswer(ans)} disabled={loadingExplanation[ans.question_id]} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', padding: '10px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: loadingExplanation[ans.question_id] ? 'not-allowed' : 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center' }} onMouseOver={e=>e.currentTarget.style.color='#c084fc'} onMouseOut={e=>e.currentTarget.style.color='var(--text-muted)'}>
                    {loadingExplanation[ans.question_id] ? <><span className="spinner" style={{ width: '14px', height: '14px', marginRight: '8px', borderTopColor: '#c084fc' }} /> ĐANG CẮT NGHĨA...</> : '🧠 YÊU CẦU AI PHÂN TÍCH NHẬP LIỆU NÀY'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
