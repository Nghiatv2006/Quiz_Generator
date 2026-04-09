import React, { useState, useEffect, useRef } from 'react';

const api = typeof window !== 'undefined' ? window['electronAPI'] : null;

export default function AIChatPage({ user, showToast }) {
  const [sessions,      setSessions]      = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [messages,      setMessages]      = useState([]);
  const [input,         setInput]         = useState('');
  const [sending,       setSending]       = useState(false);
  const [suggestions,   setSuggestions]   = useState([]);
  const [topicName,     setTopicName]     = useState('');
  const [aiProvider,    setAiProvider]    = useState('AI');
  const [sidebarWidth,  setSidebarWidth]  = useState(260);
  const chatEndRef = useRef(null);
  const inputRef   = useRef(null);

  useEffect(() => {
    document.body.dataset.page = 'ai-chat';
    return () => { delete document.body.dataset.page; };
  }, []);

  useEffect(() => {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setSidebarWidth(e.contentRect.width);
    });
    ro.observe(sidebar);
    setSidebarWidth(sidebar.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { loadSessions(); loadProvider(); }, []); 
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadProvider = async () => {
    try {
      const res = await api?.ai?.checkStatus(user?.id);
      if (res?.success) {
        const labels = { groq: '⚡ Groq (Sấm Sét)', ollama: '🦙 Ollama (Cục Bộ)', gemini: '✨ Gemini (Google)' };
        setAiProvider(labels[res.currentProvider] || 'Neural Network');
      }
    } catch (_) {}
  };

  const loadSessions = async () => {
    try {
      const res = await api?.ai?.chatSessions(user?.id);
      if (res?.success) setSessions(res.sessions || []);
    } catch (_) {}
  };

  const loadMessages = async (sid) => {
    setActiveSession(sid);
    setMessages([]);
    setSuggestions([]);
    try {
      const res = await api?.ai?.chatHistory(sid);
      if (res?.success) setMessages(res.messages || []);
    } catch (e) { console.error(e); }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (text.length > 2000) { showToast('Tin nhắn quá dài (tối đa 2000 ký tự)', 'error'); return; }

    setInput('');
    setSending(true);
    inputRef.current?.focus();

    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, { id: tempId, sender_role: 'user', content: text }]);

    try {
      const res = await api.ai.chatSend({ sessionId: activeSession, message: text, userId: user.id });
      if (res.success) {
        if (!activeSession) { setActiveSession(res.sessionId); loadSessions(); }
        setMessages(prev => [...prev, {
          id: `ai-${Date.now()}`, sender_role: 'assistant', content: res.reply
        }]);
        setSuggestions(res.suggestions || []);
        if (res.topicName) setTopicName(res.topicName);
      } else {
        showToast(res.message || 'Hệ thống AI không phản hồi', 'error');
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    } catch (e) {
      showToast(`Lỗi thuật toán: ${e.message}`, 'error');
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  const startNewChat = () => {
    setActiveSession(null); setMessages([]); setSuggestions([]); setTopicName('');
  };

  const QUICK = ['Giải thích khái niệm Định Lý Pitago', 'Cấu trúc của một bài văn Mẫu', 'Hàm tuần hoàn là gì?'];

  return (
    <>
      <div style={{
        position: 'fixed', top: 'var(--titlebar-height, 36px)', left: sidebarWidth, right: 0, bottom: 0,
        display: 'flex', background: 'var(--bg-primary)', zIndex: 1, transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>

        {/* ── Sidebar Phiên Trò Chuyện ── */}
        <div style={{
          width: '280px', minWidth: '280px', borderRight: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', flexDirection: 'column', background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(10px)'
        }}>
          <div style={{ padding: '24px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <button
              style={{
                width: '100%', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: 'white',
                border: 'none', padding: '14px', borderRadius: '12px', fontWeight: 800, fontSize: '15px', cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(59,130,246,0.3)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
              onClick={startNewChat}
              onMouseOver={e=>e.currentTarget.style.transform='translateY(-2px)'} onMouseOut={e=>e.currentTarget.style.transform='none'}
            >
              <span>✨</span> TẠO PHIÊN MỚI
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {sessions.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px', filter: 'grayscale(1)' }}>🗄️</div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>Chưa có phiên hỏi đáp nào lưu trong bộ nhớ.</div>
              </div>
            )}
            {sessions.map(s => (
              <div
                key={s.id} onClick={() => loadMessages(s.id)}
                style={{
                  padding: '12px 16px', borderRadius: '12px', cursor: 'pointer',
                  background: activeSession === s.id ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${activeSession === s.id ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.05)'}`,
                  marginBottom: '10px', transition: 'all 0.2s', position: 'relative', overflow: 'hidden'
                }}
                onMouseOver={e => { if (activeSession !== s.id) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseOut={e => { if (activeSession !== s.id) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
              >
                {activeSession === s.id && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: '#3b82f6' }}></div>}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ fontSize: '18px', background: activeSession === s.id ? 'rgba(59,130,246,0.2)' : 'rgba(0,0,0,0.3)', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{activeSession === s.id ? '💬' : '📜'}</div>
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    <div style={{
                      fontSize: '14px', fontWeight: activeSession === s.id ? 800 : 500, color: activeSession === s.id ? '#93c5fd' : 'white',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px'
                    }}>
                      {s.title || `Báo cáo phân tích #${s.id}`}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                      Khối lượng: {s.message_count || 0} tín hiệu
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Khu Vực Phản Hồi Chính ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
          
          <div style={{ position: 'absolute', top: '-20%', left: '20%', width: '300px', height: '300px', background: 'rgba(59,130,246,0.1)', filter: 'blur(80px)', borderRadius: '50%', pointerEvents: 'none' }}></div>

          {/* Header Khu Vực Chat */}
          <div style={{
            padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(10px)', flexShrink: 0
          }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '16px', background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', boxShadow: '0 4px 12px rgba(59,130,246,0.4)', border: '1px solid rgba(147,197,253,0.3)'
            }}>🤖</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: '20px', color: 'white', letterSpacing: '0.5px' }}>Trợ Giảng AI Tiên Tiến</div>
              <div style={{ fontSize: '13px', color: '#93c5fd', fontWeight: 600 }}>Lõi xử lý đang kích hoạt: {aiProvider}</div>
            </div>
            {topicName && (
              <div style={{ fontSize: '12px', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', padding: '6px 12px', borderRadius: '8px', color: '#bfdbfe', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ animation: 'pulse 2s infinite' }}>📡</span> Mục tiêu: {topicName}
              </div>
            )}
          </div>

          {/* Khu Vực Nước Cờ (Messages) */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '32px', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {messages.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', margin: 'auto' }}>
                <div style={{ width: '120px', height: '120px', background: 'rgba(59,130,246,0.1)', border: '2px dashed rgba(59,130,246,0.3)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px', boxShadow: '0 0 50px rgba(59,130,246,0.1)' }}>🔮</div>
                <div style={{ fontWeight: 900, fontSize: '24px', color: 'white' }}>Tâm Trí AI Đã Sẵn Sàng</div>
                <div style={{ fontSize: '15px', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '400px', lineHeight: 1.5 }}>
                  Truyền đạt câu hỏi, khái niệm hoặc nội dung mà bạn cần cắt nghĩa. Thuật toán sẽ phản hồi bằng văn bản dễ hiểu nhất.
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '16px' }}>
                  {QUICK.map(t => (
                    <button key={t} onClick={() => { setInput(t); inputRef.current?.focus(); }}
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: '0.2s' }}
                      onMouseOver={e=>e.currentTarget.style.background='rgba(59,130,246,0.2)'} onMouseOut={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'}
                    >
                      💡 {t}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={m.id || i} style={{
                  display: 'flex', gap: '16px', marginBottom: '24px',
                  flexDirection: m.sender_role === 'user' ? 'row-reverse' : 'row',
                  opacity: String(m.id).startsWith('temp-') ? 0.5 : 1, transition: 'opacity 0.3s'
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                    background: m.sender_role === 'user' ? 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
                  }}>
                    {m.sender_role === 'user' ? '🧑‍🎓' : '🤖'}
                  </div>
                  <div style={{
                    maxWidth: '80%', padding: '16px 20px', borderRadius: '16px',
                    background: m.sender_role === 'user' ? 'rgba(147,51,234,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${m.sender_role === 'user' ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.05)'}`,
                    fontSize: '15px', lineHeight: 1.7, color: 'white',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    borderTopRightRadius: m.sender_role === 'user' ? '4px' : '16px',
                    borderTopLeftRadius: m.sender_role === 'user' ? '16px' : '4px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}>
                    {m.content}
                  </div>
                </div>
              ))
            )}

            {/* Khối tín hiệu chờ */}
            {sending && (
              <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
                }}>🤖</div>
                <div style={{
                  padding: '16px 20px', borderRadius: '16px', background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)',
                  display: 'flex', alignItems: 'center', gap: '12px', borderTopLeftRadius: '4px'
                }}>
                  <span style={{ fontSize: '13px', color: '#93c5fd', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>HỆ THỐNG ĐANG SUY LUẬN</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#60a5fa', animation: `pulse 1s ${i * 0.2}s ease-in-out infinite` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* ── Bảng Điều Khiển Đầu Vào ── */}
          <div style={{
            flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(15,23,42,0.95)', padding: '20px 32px', backdropFilter: 'blur(20px)'
          }}>
            
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {suggestions.slice(0, 3).map((s, i) => (
                  <button key={i} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    style={{ background: 'rgba(147,197,253,0.1)', border: '1px solid rgba(147,197,253,0.2)', color: '#bfdbfe', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: '0.2s' }}
                    onMouseOver={e=>e.currentTarget.style.background='rgba(147,197,253,0.2)'} onMouseOut={e=>e.currentTarget.style.background='rgba(147,197,253,0.1)'}
                  >
                    🏷️ {s}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <textarea
                ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Truyền lệnh vào hệ thống (Nhấn Enter để gửi, Shift+Enter xuống dòng)..."
                disabled={sending} maxLength={2000}
                style={{
                  flex: 1, minHeight: '44px', maxHeight: '150px', padding: '12px 16px', borderRadius: '16px', border: 'none', background: 'transparent',
                  color: 'white', fontSize: '15px', outline: 'none', resize: 'none', lineHeight: 1.5, fontFamily: 'inherit'
                }}
              />
              <button
                onClick={handleSend} disabled={sending || !input.trim()}
                style={{
                  flexShrink: 0, height: '44px', width: '44px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: sending || !input.trim() ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: sending || !input.trim() ? 'var(--text-muted)' : 'white', border: 'none', cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s', boxShadow: sending || !input.trim() ? 'none' : '0 4px 16px rgba(59,130,246,0.4)', fontSize: '20px'
                }}
              >
                {sending ? <span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : '🚀'}
              </button>
            </div>
            {input.length > 1500 && (
              <div style={{ fontSize: '11px', color: input.length > 1900 ? '#ef4444' : 'var(--text-muted)', textAlign: 'right', marginTop: '8px', paddingRight: '12px', fontWeight: 600 }}>Cảnh báo tràn luồng xuất: {input.length}/2000</div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { transform: scale(0.6); opacity: 0.3; } 50% { transform: scale(1.2); opacity: 1; box-shadow: 0 0 10px rgba(96,165,250,0.5); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
