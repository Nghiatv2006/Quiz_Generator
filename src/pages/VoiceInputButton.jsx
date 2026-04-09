import React, { useState, useRef, useCallback, useEffect } from 'react';

/**
 * ═══════════════════════════════════════════════════════════
 *  Feature 9: Voice Input Button
 *  Sử dụng Web Speech API (SpeechRecognition) để nhận diện
 *  giọng nói → chuyển thành text → gửi vào input.
 *  Dùng cho fill-in questions và AI chat.
 *
 *  BUG-F9-02 FIX: dùng onResultRef thay vì onResult
 *    trong useCallback dep → tránh re-create liên tục
 *  BUG-F9-03 FIX: bỏ global Alt+V shortcut, chỉ để parent
 *    điều khiển qua prop hoặc do ExamTakingPage quản lý.
 * ═══════════════════════════════════════════════════════════
 */

const SpeechRecognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

/**
 * @param {Object} props
 * @param {Function} props.onResult - callback(transcript: string) khi có kết quả
 * @param {string} [props.lang='vi-VN'] - ngôn ngữ nhận diện
 * @param {string} [props.size='md'] - 'sm' | 'md' | 'lg'
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.ariaLabel]
 */
export default function VoiceInputButton({
  onResult,
  lang = 'vi-VN',
  size = 'md',
  disabled = false,
  ariaLabel = 'Nhập bằng giọng nói',
}) {
  const [status, setStatus] = useState('idle'); // idle | listening | processing | error | unsupported
  const [errorMsg, setErrorMsg] = useState('');
  const recognitionRef = useRef(null);
  const resultRef = useRef('');
  const isActiveRef = useRef(false);
  // BUG-F9-02 FIX: store callback in ref to avoid stale closure / infinite re-create
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  // Check browser support
  useEffect(() => {
    if (!SpeechRecognition) {
      setStatus('unsupported');
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      isActiveRef.current = false;
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    setStatus('idle');
  }, []);

  // BUG-F9-02 FIX: remove onResult from deps, use onResultRef instead
  const startListening = useCallback(() => {
    if (!SpeechRecognition || disabled) return;
    if (isActiveRef.current) {
      stopListening();
      return;
    }

    // Prevent multiple instances
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
    }

    setErrorMsg('');
    resultRef.current = '';

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isActiveRef.current = true;
      setStatus('listening');
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        }
      }

      if (finalTranscript) {
        resultRef.current = finalTranscript.trim();
        setStatus('processing');
      }
    };

    recognition.onerror = (event) => {
      isActiveRef.current = false;
      recognitionRef.current = null;

      if (event.error === 'aborted') {
        setStatus('idle');
        return;
      }

      const errorMessages = {
        'no-speech': 'Không nghe thấy giọng nói',
        'audio-capture': 'Không tìm thấy microphone',
        'not-allowed': 'Cần cấp quyền microphone',
      };
      setErrorMsg(errorMessages[event.error] || `Lỗi: ${event.error}`);
      setStatus('error');

      // Auto recover after 3s
      setTimeout(() => {
        setStatus(prev => prev === 'error' ? 'idle' : prev);
        setErrorMsg('');
      }, 3000);
    };

    recognition.onend = () => {
      isActiveRef.current = false;
      recognitionRef.current = null;

      if (resultRef.current) {
        // BUG-F9-02 FIX: use ref for callback
        onResultRef.current?.(resultRef.current);
        resultRef.current = '';
      }
      setStatus('idle');
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      setErrorMsg('Không thể bắt đầu nhận diện giọng nói');
      setStatus('error');
      isActiveRef.current = false;
      recognitionRef.current = null;
    }
  }, [lang, disabled, stopListening]); // BUG-F9-02 FIX: removed onResult

  // BUG-F9-03 FIX: REMOVED global Alt+V shortcut.
  // Global shortcuts should be managed by the parent (ExamTakingPage) to avoid
  // multiple instances all firing simultaneously.

  // Cleanup on unmount
  useEffect(() => () => stopListening(), [stopListening]);

  const sizeConfig = {
    sm: { btn: 28, icon: 14, dot: 8 },
    md: { btn: 36, icon: 18, dot: 10 },
    lg: { btn: 44, icon: 22, dot: 12 },
  }[size] || { btn: 36, icon: 18, dot: 10 };

  if (status === 'unsupported') {
    return (
      <button
        disabled
        title="Trình duyệt không hỗ trợ Speech Recognition"
        aria-label="Voice input không khả dụng"
        style={{
          width: sizeConfig.btn, height: sizeConfig.btn, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--border)', background: 'var(--bg-glass)',
          color: 'var(--text-muted)', cursor: 'not-allowed', opacity: 0.4,
          fontSize: sizeConfig.icon,
        }}
      >
        🎤
      </button>
    );
  }

  const isListening = status === 'listening';
  const isError = status === 'error';

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={isListening ? stopListening : startListening}
        disabled={disabled || status === 'processing'}
        aria-label={ariaLabel}
        aria-pressed={isListening}
        title={isListening ? 'Dừng nghe' : errorMsg || 'Nói để nhập'}
        style={{
          width: sizeConfig.btn, height: sizeConfig.btn, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: sizeConfig.icon,
          background: isListening ? 'var(--error)' : isError ? 'var(--error-bg)' : 'var(--bg-glass)',
          color: isListening ? 'white' : isError ? 'var(--error)' : 'var(--text-secondary)',
          transition: 'all 0.2s ease',
          animation: isListening ? 'pulse 1.5s ease-in-out infinite' : 'none',
          boxShadow: isListening ? '0 0 0 4px rgba(239,68,68,0.25)' : 'none',
        }}
      >
        {status === 'processing' ? '⏳' : '🎤'}
      </button>

      {/* Listening indicator dot */}
      {isListening && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', top: -2, right: -2,
            width: sizeConfig.dot, height: sizeConfig.dot,
            borderRadius: '50%', background: 'var(--error)',
            animation: 'pulse 0.8s ease-in-out infinite',
            border: '2px solid var(--bg-secondary)',
          }}
        />
      )}

      {/* Status tooltip */}
      {(isListening || isError) && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute', top: '100%', left: '50%',
            transform: 'translateX(-50%)', marginTop: 6,
            whiteSpace: 'nowrap', fontSize: 10, fontWeight: 600,
            padding: '3px 8px', borderRadius: 6,
            background: isError ? 'var(--error-bg)' : 'rgba(239,68,68,0.1)',
            color: isError ? 'var(--error)' : '#ef4444',
            border: `1px solid ${isError ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.2)'}`,
            animation: 'fadeIn 0.2s ease',
            zIndex: 10,
          }}
        >
          {isError ? errorMsg : '🎤 Đang nghe...'}
        </div>
      )}
    </div>
  );
}
