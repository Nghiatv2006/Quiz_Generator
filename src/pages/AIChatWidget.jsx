import React, { useEffect, useRef, useState } from 'react';
import VoiceInputButton from './VoiceInputButton.jsx';

// BUG-CHAT-02 FIX: null guard đúng chuẩn – window.electronAPI có thể undefined
const api = typeof window !== 'undefined' ? window['electronAPI'] : null;
const STORAGE_KEY = 'ai_chat_widget_session_id';


export default function AIChatWidget({ user, showToast }) {
  const [open,        setOpen]        = useState(false);
  // BUG: Number('abc')=NaN → NaN||null=null OK, nhưng Number('0')=0 → 0||null=null (mất id=0)
  // FIX: dùng parseInt + explicit null check thay vì || null
  const [sessionId,   setSessionId]   = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = parseInt(stored, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  });
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState('');
  const [sending,     setSending]     = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!open || !sessionId || !api) return;
      try {
        const res = await api.ai.chatHistory(sessionId);
        if (res.success) setMessages(res.messages || []);
      } catch (e) { console.error('[AIChatWidget] load history:', e); }
    };
    loadHistory();
  }, [open, sessionId]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !api) return;

    // BUG-CHAT: validate length client-side
    if (text.length > 2000) {
      showToast('Tin nhắn quá dài (tối đa 2000 ký tự)', 'error');
      return;
    }

    setInput('');
    setSending(true);
    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, { id: tempId, sender_role: 'user', content: text }]);

    try {
      const res = await api.ai.chatSend({ sessionId, message: text, userId: user?.id });
      if (!res.success) throw new Error(res.message || 'Chat lỗi');
      if (!sessionId && res.sessionId) {
        setSessionId(res.sessionId);
        localStorage.setItem(STORAGE_KEY, String(res.sessionId));
      }
      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        sender_role: 'assistant',
        content: res.reply
      }]);
      setSuggestions(res.suggestions || []);
    } catch (e) {
      showToast(`AI Tutor lỗi: ${e.message}`, 'error');
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  const startNew = () => {
    setSessionId(null);
    setMessages([]);
    setSuggestions([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <>
      {/* Không hiển thị khi đang ở trang AI Chat để tránh che nút Gửi */}
      {open && document.body.dataset.page !== 'ai-chat' && (
        <div style={{
          position: 'fixed', right: 16, bottom: 84, width: 360, height: 500, zIndex: 9999,
          background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12,
          display: 'flex', flexDirection: 'column', boxShadow: '0 12px 30px rgba(0,0,0,0.25)'
        }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
            <strong>🤖 AI Tutor</strong>
            <div className="flex gap-8">
              <button className="btn btn--ghost btn--sm" onClick={startNew}>Mới</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>✕</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {messages.length === 0 && <div className="text-sm text-muted">Hỏi mình bất kỳ điều gì về bài học nhé 👋</div>}
            {messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 10, display: 'flex', justifyContent: m.sender_role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '80%', padding: '8px 10px', borderRadius: 10, whiteSpace: 'pre-wrap',
                  background: m.sender_role === 'user' ? 'var(--bg-accent)' : 'var(--bg-glass)', border: '1px solid var(--border)' }}>
                  {m.content}
                </div>
              </div>
            ))}
            {sending && <div className="text-sm text-muted">AI đang trả lời...</div>}
            <div ref={endRef} />
          </div>

          {suggestions.length > 0 && (
            <div style={{ padding: '0 12px 8px' }}>
              <div className="text-xs text-muted mb-8">Gợi ý hỏi thêm:</div>
              <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                {suggestions.slice(0, 2).map((s, i) => (
                  <button key={i} className="btn btn--secondary btn--sm" onClick={() => setInput(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="form-input" style={{ flex: 1 }} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Nhập câu hỏi hoặc 🎤 nói..."
              disabled={sending}
              aria-label="Nhập tin nhắn cho AI Tutor" />
            <VoiceInputButton
              size="sm"
              lang="vi-VN"
              ariaLabel="Nói tin nhắn cho AI Tutor"
              onResult={(transcript) => {
                if (transcript) setInput(prev => prev ? prev + ' ' + transcript : transcript);
              }}
            />
            <button className="btn btn--primary btn--sm" onClick={send} disabled={sending || !input.trim()}
              aria-label="Gửi tin nhắn">Gửi</button>
          </div>
        </div>
      )}

      {/* Ẩn nút FAB khi đang ở trang AI Chat (tránh che nút Gửi) */}
      {document.body.dataset.page !== 'ai-chat' && (
        <button
          onClick={() => setOpen(v => !v)}
          style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 9999, borderRadius: 999, padding: '12px 14px' }}
          className="btn btn--primary"
        >
          💬 AI Tutor
        </button>
      )}
    </>
  );
}
