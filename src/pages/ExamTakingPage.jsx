import React, { useState, useEffect, useRef, useCallback } from 'react';
import VoiceInputButton from './VoiceInputButton.jsx';
import { speak, stopSpeaking, isTTSSupported } from './ttsHelper.js';
const api = typeof window !== 'undefined' ? window['electronAPI'] : null;

export default function ExamTakingPage({
  attemptId, exam, questions = [], adaptiveMeta: initialAdaptiveMeta = null, enableAntiCheat, requireFullscreen,
  user, showToast, onComplete, onExit
}) {
  // ── State ──
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // { questionId: { selected, fillAnswer, flagged, timeSpent } }
  const [questionList, setQuestionList] = useState(questions);
  const [adaptiveMeta, setAdaptiveMeta] = useState(null);
  const [timeLeft, setTimeLeft] = useState((exam?.duration || exam?.duration_minutes || 60) * 60);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [showNavPanel, setShowNavPanel] = useState(true);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());

  // Anti-cheat state
  const [cheatingWarnings, setCheatingWarnings] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(!requireFullscreen);
  // Feature 9: Voice & Accessibility state
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false); // mic is actively listening
  const [userSettings, setUserSettings] = useState(null);
  const timerRef = useRef(null);
  const submittedRef = useRef(false); // prevent double submit
  const doSubmitRef = useRef(null);
  const answersRef = useRef(answers);
  const currentIndexRef = useRef(currentIndex);
  const questionStartTimeRef = useRef(questionStartTime);
  const timeLeftRef = useRef(timeLeft);
  const lastActivityRef = useRef(Date.now());
  const cheatViolationsRef = useRef(0); // Track number of tab switches/blurs
  const examStartedRef = useRef(false); // Feature 9: track if exam intro was announced
  const autoReadTimerRef = useRef(null); // Feature 9: auto-read delay timer

  // Keep refs in sync
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { questionStartTimeRef.current = questionStartTime; }, [questionStartTime]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

  useEffect(() => {
    setQuestionList(questions || []);
    setAdaptiveMeta(exam?.isAdaptive ? (
      initialAdaptiveMeta || {
        abilityScore: 0.5,
        answeredCount: 0,
        totalQuestions: exam?.totalQuestions || (questions || []).length,
      }
    ) : null);
    setCurrentIndex(0);
    setAnswers({});
    setResult(null);
    submittedRef.current = false;
    setShowNavPanel(!exam?.isAdaptive);
    setTimeLeft((exam?.duration || exam?.duration_minutes || 60) * 60);
    setQuestionStartTime(Date.now());
  }, [questions, exam?.isAdaptive, exam?.totalQuestions, exam?.duration, exam?.duration_minutes, initialAdaptiveMeta]);

  // Feature 9: Load user accessibility settings (no TDZ issue - only uses user?.id)
  useEffect(() => {
    const loadA11ySettings = async () => {
      if (!user?.id || !api) return;
      try {
        const res = await api.users.getSettings(user.id);
        if (res.success && res.settings) {
          setUserSettings(res.settings);
          setTtsEnabled(!!res.settings.enable_tts);
        }
      } catch (e) { console.warn('[ExamTaking] a11y settings error:', e); }
    };
    loadA11ySettings();
  }, [user?.id]);

  const isAdaptive = !!exam?.isAdaptive;
  const currentQ = questionList[currentIndex];
  const totalQuestions = isAdaptive
    ? (adaptiveMeta?.totalQuestions || exam?.totalQuestions || questionList.length)
    : questionList.length;  // ── Timer ──
  useEffect(() => {
    // Hide sidebar and lock navigation
    document.body.classList.add('exam-mode-active');
    
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          doSubmitRef.current?.('timeout'); // Auto submit khi hết giờ
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => {
      clearInterval(timerRef.current);
      document.body.classList.remove('exam-mode-active');
    };
  }, []);

  const exitFullscreenIfNeeded = async () => {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch (e) { /* ignore */ }
    }
  };

  // ── Submit function (uses refs to avoid stale closure) ──
  const doSubmit = useCallback(async (submitReason = 'completed') => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setShowConfirmSubmit(false);

    try {
      const currentAnswers = answersRef.current;
      const activeQ = questionList[currentIndexRef.current];
      if (activeQ) {
        const elapsed = Math.floor((Date.now() - questionStartTimeRef.current) / 1000);
        if (elapsed > 0) {
          const prevAns = currentAnswers[activeQ.id] || {};
          currentAnswers[activeQ.id] = {
            ...prevAns,
            timeSpent: (prevAns.timeSpent || 0) + elapsed,
          };
        }
      }

      if (!isAdaptive) {
        for (const q of questionList) {
          const ans = currentAnswers[q.id];
          if (ans && (ans.selected || ans.fillAnswer)) {
            try {
              await api.attempts.saveAnswer({
                attemptId,
                questionId: q.id,
                selectedOptions: ans.selected || null,
                fillAnswer: ans.fillAnswer || null,
                timeSpent: ans.timeSpent || 0,
                isFlagged: ans.flagged || false,
              });
            } catch (e) { console.warn('save answer error:', e); }
          }
        }
      } else if (activeQ) {
        const ans = currentAnswers[activeQ.id];
        if (ans && (ans.selected || ans.fillAnswer || ans.flagged)) {
          try {
            await api.attempts.saveAnswer({
              attemptId,
              questionId: activeQ.id,
              selectedOptions: ans.selected || null,
              fillAnswer: ans.fillAnswer || null,
              timeSpent: ans.timeSpent || 0,
              isFlagged: ans.flagged || false,
            });
          } catch (e) { console.warn('save answer error:', e); }
        }
      }

      const res = await api.attempts.submit(attemptId, submitReason);
      if (res.success) {
        clearInterval(timerRef.current);
        await exitFullscreenIfNeeded();

        const serverTimeTaken = Number(res?.result?.timeTaken);
        const localTimeTaken = Math.max(
          0,
          ((exam?.duration || exam?.duration_minutes || 60) * 60) - Math.max(0, Number(timeLeftRef.current || 0))
        );
        const finalTimeTaken = Number.isFinite(serverTimeTaken) && serverTimeTaken > 0
          ? serverTimeTaken
          : localTimeTaken;

        setResult({
          ...(res.result || {}),
          timeTaken: finalTimeTaken,
        });

        const xpEarned = Number(res?.result?.xpEarned || 0);
        if (xpEarned > 0) {
          showToast(`🎉 Bạn nhận +${xpEarned} XP`, 'success');
        }

        if (submitReason === 'banned') showToast('🚨 BÀI THI BỊ ĐÌNH CHỈ DO GIAN LẬN!', 'error');
        else if (submitReason === 'timeout') showToast('⏰ Hết giờ! Bài thi đã được nộp tự động.', 'warning');
        else showToast('✅ Nộp bài thành công!', 'success');
      } else {
        showToast(res.message || 'Lỗi nộp bài', 'error');
        submittedRef.current = false;
        setSubmitting(false);
      }
    } catch (e) {
      showToast('Lỗi nộp bài: ' + e.message, 'error');
      submittedRef.current = false;
      setSubmitting(false);
    }
  }, [attemptId, questionList, isAdaptive, showToast, exam?.duration, exam?.duration_minutes]); // eslint-disable-line

  useEffect(() => { doSubmitRef.current = doSubmit; }, [doSubmit]);

  // ── Anti-Cheat ──
  useEffect(() => {
    if (!enableAntiCheat) return;

    const requestFullscreen = async () => {
      if (!requireFullscreen || document.fullscreenElement) return;
      try {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } catch (e) {
        setIsFullscreen(false);
        showToast('⚠️ Bài thi yêu cầu toàn màn hình.', 'warning');
      }
    };

    const markActivity = () => { lastActivityRef.current = Date.now(); };
    let lastViolationTime = 0;

    const checkTabViolation = () => {
        cheatViolationsRef.current += 1;
        const violations = cheatViolationsRef.current;
        
        if (violations === 2) {
           showToast('🚨 CẢNH BÁO TỐI HẬU THƯ: Bạn đã rời khỏi nội dung thi 2 lần. Vi phạm 1 lần nữa HỆ THỐNG SẼ ĐÌNH CHỈ THÔNG BÁO NỘP BÀI TỰ ĐỘNG!', 'error');
        } else if (violations >= 3) {
           showToast('❌ BẠN ĐÃ BỊ HỦY THI VÀ ÉP NỘP BÀI DO RỜI CỬA SỔ QUÁ 3 LẦN!', 'error');
           doSubmitRef.current?.('banned');
        } else {
           showToast('⚠️ Cảnh báo: Không được rời khỏi màn hình hoặc chuyển tab!', 'warning');
        }
        setCheatingWarnings(prev => prev + 1);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        const now = Date.now();
        if (now - lastViolationTime < 1000) return;
        lastViolationTime = now;
        logCheatEvent('tab_switch', 'Chuyển tab trong khi thi', 3);
        checkTabViolation();
      }
    };

    const handleBlur = () => {
      const now = Date.now();
      if (now - lastViolationTime < 1000) return;
      lastViolationTime = now;
      logCheatEvent('window_blur', 'Rời khỏi cửa sổ thi', 2);
      checkTabViolation();
    };

    const handleFullscreenChange = () => {
      const inFullscreen = !!document.fullscreenElement;
      setIsFullscreen(inFullscreen || !requireFullscreen);
      if (requireFullscreen && !inFullscreen) {
        logCheatEvent('fullscreen_exit', 'Thoát toàn màn hình khi đang thi', 4);
        setCheatingWarnings(prev => prev + 1);
        showToast('⚠️ Không được thoát chế độ toàn màn hình!', 'warning');
      }
    };

    const handleCopy = (e) => {
      e.preventDefault();
      logCheatEvent('copy_paste', 'Copy nội dung bài thi', 5);
      setCheatingWarnings(prev => prev + 1);
      showToast('⚠️ Không được copy nội dung!', 'warning');
    };

    const handleContextMenu = (e) => {
      e.preventDefault();
      logCheatEvent('right_click', 'Click chuột phải', 1);
    };

    const handleKeyDown = (e) => {
      if ((e.ctrlKey && ['c', 'v', 'a', 'u'].includes(e.key.toLowerCase())) ||
          e.key === 'F12' ||
          (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i')) {
        e.preventDefault();
        logCheatEvent('suspicious_key', `Phím tắt: ${e.key}`, 2);
        showToast('⚠️ Phím tắt bị chặn!', 'warning');
      }
    };

    const idleChecker = setInterval(() => {
      const idleSeconds = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      if (idleSeconds >= 90) {
        logCheatEvent('unusual_idle', `Không thao tác ${idleSeconds}s`, 2);
        lastActivityRef.current = Date.now();
      }
    }, 30000);

    requestFullscreen();
    markActivity();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousemove', markActivity);
    document.addEventListener('click', markActivity);
    document.addEventListener('input', markActivity);

    return () => {
      clearInterval(idleChecker);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousemove', markActivity);
      document.removeEventListener('click', markActivity);
      document.removeEventListener('input', markActivity);
    };
  }, [enableAntiCheat, requireFullscreen]); // eslint-disable-line

  // ── Log cheat event to backend ──
  const logCheatEvent = useCallback(async (eventType, detail, weight = 1) => {
    if (!api) return;
    try {
      await api.cheat.logEvent({
        attemptId, eventType, detail, weight,
        questionId: questionList[currentIndexRef.current]?.id || null,
      });
    } catch (e) { console.warn('cheat log error:', e); }
  }, [attemptId, questionList]);

  // ── Track time per question ──
  const saveCurrentQuestionTime = () => {
    if (!currentQ) return null;
    const elapsed = Math.floor((Date.now() - questionStartTimeRef.current) / 1000);

    const nextAnswer = {
      ...(answersRef.current[currentQ.id] || {}),
      timeSpent: ((answersRef.current[currentQ.id]?.timeSpent || 0) + Math.max(0, elapsed)),
    };

    answersRef.current = {
      ...answersRef.current,
      [currentQ.id]: nextAnswer,
    };
    setAnswers(answersRef.current);

    return nextAnswer;
  };

  // ── Save answer to server ──
  const saveAnswerToServer = async (questionId) => {
    const ans = answersRef.current[questionId];
    if (!ans) return null;

    const payload = {
      attemptId,
      questionId,
      selectedOptions: ans.selected || null,
      fillAnswer: ans.fillAnswer || null,
      timeSpent: ans.timeSpent || 0,
      isFlagged: ans.flagged || false,
    };

    try {
      if (isAdaptive) return await api.attempts.nextAdaptiveQuestion(payload);
      await api.attempts.saveAnswer(payload);
      return { success: true };
    } catch (e) {
      console.warn('save answer error:', e);
      return { success: false, message: e.message };
    }
  };

  // ── Navigate questions ──
  const goToQuestion = async (index) => {
    if (!currentQ || submitting) return;

    const elapsed = Math.floor((Date.now() - questionStartTimeRef.current) / 1000);
    if (enableAntiCheat && elapsed > 0 && elapsed <= 2) {
      logCheatEvent('rapid_answer', `Trả lời quá nhanh (${elapsed}s)`, 2);
      showToast('⚠️ CẢNH BÁO: BẠN ĐANG LÀM QUÁ NHANH. Vui lòng đọc kỹ câu hỏi!', 'warning');
    }

    saveCurrentQuestionTime();
    lastActivityRef.current = Date.now();

    if (!isAdaptive) {
      if (index < 0 || index >= totalQuestions) return;
      if (currentQ) await saveAnswerToServer(currentQ.id);
      setCurrentIndex(index);
      setQuestionStartTime(Date.now());
      return;
    }

    const ans = answersRef.current[currentQ.id];
    if (!ans || (!ans.selected && !ans.fillAnswer)) {
      showToast('Bạn cần chọn đáp án trước khi sang câu kế tiếp.', 'warning');
      return;
    }

    setSubmitting(true);
    const adaptiveRes = await saveAnswerToServer(currentQ.id);
    if (!adaptiveRes?.success) {
      setSubmitting(false);
      showToast(adaptiveRes?.message || 'Không lấy được câu adaptive kế tiếp', 'error');
      return;
    }

    setAdaptiveMeta(adaptiveRes.adaptiveMeta || null);
    if (adaptiveRes.done || !adaptiveRes.question) {
      setSubmitting(false);
      await doSubmit('completed');
      return;
    }

    setQuestionList(prev => [...prev, adaptiveRes.question]);
    setCurrentIndex(prev => prev + 1);
    setQuestionStartTime(Date.now());
    setSubmitting(false);
  };

  // ── Select answer ──
  const selectOption = (questionId, label, isMultiple) => {
    setAnswers(prev => {
      const current = prev[questionId]?.selected || '';
      let newSelected;

      if (isMultiple) {
        const selected = current ? current.split(',') : [];
        if (selected.includes(label)) {
          newSelected = selected.filter(s => s !== label).join(',');
        } else {
          newSelected = [...selected, label].sort().join(',');
        }
      } else {
        newSelected = label;
      }

      return { ...prev, [questionId]: { ...prev[questionId], selected: newSelected } };
    });
  };

  const setFillAnswer = (questionId, value) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: { ...prev[questionId], fillAnswer: value }
    }));
  };

  const toggleFlag = (questionId) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: { ...prev[questionId], flagged: !prev[questionId]?.flagged }
    }));
  };

  // ── Format time ──
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const answeredCount = Object.values(answers).filter(a => a?.selected || a?.fillAnswer).length;
  const flaggedCount = Object.values(answers).filter(a => a?.flagged).length;

  // ═══════════════════════════════════════════════════════════
  // Feature 9: Voice Interaction System
  // Flow: Đọc câu hỏi (TTS) → Nghe giọng nói → Chọn đáp án
  // ═══════════════════════════════════════════════════════════

  const SpeechRecognition = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const voiceRecognitionRef = useRef(null);
  const waitingForSubmitConfirmRef = useRef(false); // Tracks if waiting for submit confirmation

  // ── Parse voice transcript → select answer / navigate ──
  // Uses ref to always have latest version in recognition callbacks
  const handleVoiceAnswerImpl = useCallback((transcript) => {
    if (!transcript || !currentQ) return false;
    const text = transcript.toLowerCase().trim();

    // Helper: auto-advance to next question after delay
    const autoAdvance = (delayMs = 1500) => {
      if (currentIndex < totalQuestions - 1) {
        setTimeout(() => {
          goToQuestionRef.current(currentIndex + 1);
        }, delayMs);
      } else {
        // Last question → auto prompt for submission confirmation
        if (ttsEnabled && isTTSSupported()) {
          setTimeout(() => {
            waitingForSubmitConfirmRef.current = true;
            speak('Đã trả lời xong câu cuối cùng. Bạn có xác nhận nộp bài không? Hãy nói OK để xác nhận.', {
              lang: 'vi-VN', rate: 1.0,
              onEnd: () => {
                setTimeout(() => startVoiceListeningRef.current(), 400);
              }
            });
          }, delayMs);
        }
      }
    };

    // 0) Check if waiting for submit confirmation
    if (waitingForSubmitConfirmRef.current) {
      if (text.includes('ok') || text.includes('có') || text.includes('đồng ý') || text.includes('xác nhận') || text.includes('nộp')) {
        waitingForSubmitConfirmRef.current = false;
        showToast('🎤 Đang xử lý nộp bài...', 'info');
        if (ttsEnabled && isTTSSupported()) {
          speak('Đang thu thành quả và nộp bài, vui lòng chờ trong giây lát.', { lang: 'vi-VN', rate: 1.0 });
        }
        doSubmitRef.current?.('completed');
        return true;
      } else if (text.includes('không') || text.includes('hủy') || text.includes('tiếp tục') || text.includes('chưa') || text.includes('quên')) {
        waitingForSubmitConfirmRef.current = false;
        showToast('🎤 Đã hủy thao tác nộp bài', 'info');
        if (ttsEnabled && isTTSSupported()) {
          speak('Đã hủy thao tác nộp bài. Bạn có thể tiếp tục làm bài.', { lang: 'vi-VN', rate: 1.0 });
        }
        return true;
      }
      // If something else is said, ignore or remind again
    }

    // 1) Match answer: "a", "b", "chọn a", "đáp án b", etc.
    const answerPatterns = [
      /^([a-d])$/i,
      /(?:chọn|đáp án|đáp|câu|ch[oọ]n)\s*([a-d])/i,
      /([a-d])\s*(?:nhé|đi|nha|á)?$/i,
    ];

    for (const pattern of answerPatterns) {
      const match = text.match(pattern);
      if (match) {
        // Can't select answer if we were waiting for submit confirmation (we reset it)
        waitingForSubmitConfirmRef.current = false;

        const label = (match[1] || match[2]).toUpperCase();
        const validLabels = (currentQ.options || []).map(o => o.label);
        if (validLabels.includes(label)) {
          const isMulti = currentQ.question_type === 'multiple_choice';
          selectOption(currentQ.id, label, isMulti);
          const optText = currentQ.options.find(o => o.label === label)?.text || '';
          showToast(`🎤 Đã chọn ${label}: ${optText.substring(0, 40)}${optText.length > 40 ? '...' : ''}`, 'success');

          if (ttsEnabled && isTTSSupported()) {
            if (isMulti) {
              // Multiple choice: stay on question, user may select more
              speak(`Đã chọn ${label}. Nói thêm đáp án khác hoặc nói "câu tiếp" để chuyển.`, {
                lang: 'vi-VN', rate: 1.1,
                onEnd: () => {
                  // Re-listen for more answers
                  setTimeout(() => startVoiceListeningRef.current(), 400);
                },
              });
            } else {
              // Single choice: confirm then auto-advance
              speak(`Đã chọn đáp án ${label}. Chuyển câu tiếp.`, {
                lang: 'vi-VN', rate: 1.1,
                onEnd: () => autoAdvance(300),
              });
            }
          } else {
            // TTS off but voice was used → still auto-advance for single choice
            if (!isMulti) autoAdvance(800);
          }
          return true;
        }
      }
    }

    // 2) Navigation commands
    if (text.includes('câu tiếp') || text.includes('tiếp theo') || text.includes('next')) {
      waitingForSubmitConfirmRef.current = false;
      if (currentIndex < totalQuestions - 1) {
        goToQuestionRef.current(currentIndex + 1);
        showToast('🎤 Chuyển câu tiếp', 'info');
        return true;
      }
    }
    if (text.includes('câu trước') || text.includes('quay lại') || text.includes('back')) {
      waitingForSubmitConfirmRef.current = false;
      if (currentIndex > 0) {
        goToQuestionRef.current(currentIndex - 1);
        showToast('🎤 Quay câu trước', 'info');
        return true;
      }
    }

    // 3) Read command
    if (text.includes('đọc') || text.includes('đọc lại') || text.includes('read')) {
      waitingForSubmitConfirmRef.current = false;
      handleReadQuestionRef.current();
      return true;
    }

    // 4) Submit command
    if (text.includes('nộp bài') || text.includes('submit')) {
      waitingForSubmitConfirmRef.current = true;
      showToast('🎤 Chờ xác nhận nộp bài', 'info');
      // Show confirmation dialog for sighted users too, if they want
      setShowConfirmSubmit(true);
      if (ttsEnabled && isTTSSupported()) {
        speak('Bạn có chắc muốn nộp bài không? Hãy nói OK để xác nhận.', {
          lang: 'vi-VN', rate: 1.0,
          onEnd: () => setTimeout(() => startVoiceListeningRef.current(), 400)
        });
      }
      return true;
    }

    // 5) For fill-in, use the whole transcript then auto-advance
    if (currentQ.question_type === 'fill_in') {
      setFillAnswer(currentQ.id, transcript);
      showToast(`🎤 Đã nhập: "${transcript}"`, 'success');
      if (ttsEnabled && isTTSSupported()) {
        speak(`Đã nhập: ${transcript}. Chuyển câu tiếp.`, {
          lang: 'vi-VN', rate: 1.1,
          onEnd: () => autoAdvance(300),
        });
      } else {
        autoAdvance(800);
      }
      return true;
    }

    // Nothing matched → TTS nhắc lại cho sinh viên
    showToast(`🎤 Không nhận diện: "${transcript}"`, 'warning');
    if (ttsEnabled && isTTSSupported()) {
      speak('Không nghe rõ. Hãy nói lại. A, B, C hoặc D.', {
        lang: 'vi-VN', rate: 1.0,
        onEnd: () => {
          // Auto-listen again after reminder
          setTimeout(() => startVoiceListeningRef.current(), 400);
        },
      });
    }
    return false;
  }, [currentQ, currentIndex, totalQuestions, ttsEnabled]);

  // Keep latest handleVoiceAnswer in ref (for use inside recognition callbacks)
  const handleVoiceAnswerRef = useRef(handleVoiceAnswerImpl);
  useEffect(() => { handleVoiceAnswerRef.current = handleVoiceAnswerImpl; });

  // ── Voice Listening Engine ──
  // MODE 1: Web Speech API (fast, free — but fails in Electron with 'network')
  // MODE 2: MediaRecorder + Gemini AI transcription (reliable fallback)
  const voiceTimeoutRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const voiceModeRef = useRef('auto'); // 'auto' | 'webspeech' | 'gemini'
  const RECORD_DURATION_MS = 5000; // 5 seconds recording for Gemini mode

  // ── Gemini-based voice recognition (MediaRecorder + AI transcription) ──
  const startGeminiListening = useCallback(async () => {
    console.log('[Voice] 🎤 Starting Gemini mode (MediaRecorder)...');
    setVoiceListening(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 }
      });
      mediaStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg';

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        console.log('[Voice] 🔇 Recording stopped, sending to Gemini...');

        // Clean up stream
        stream.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;

        if (chunks.length === 0) {
          showToast('🎤 Không ghi được âm thanh', 'warning');
          setVoiceListening(false);
          return;
        }

        // Convert to base64
        showToast('🎤 Đang nhận diện giọng nói...', 'info');
        const blob = new Blob(chunks, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result.split(',')[1]; // remove data:audio/...;base64,
          try {
            const res = await api.voice.transcribe({
              audio: base64,
              mimeType: mimeType.split(';')[0], // 'audio/webm'
            });

            if (res.success && res.transcript) {
              console.log('[Voice] 📝 AI transcript:', res.transcript, `(${res.provider || 'unknown'})`);
              handleVoiceAnswerRef.current(res.transcript);
            } else {
              showToast(res.message || '🎤 Không nhận diện được. Hãy nói lại.', 'warning');
            }
          } catch (err) {
            console.error('[Voice] ❌ Transcribe error:', err);
            showToast('🎤 Lỗi kết nối AI. Thử lại sau.', 'error');
          }
          setVoiceListening(false);
        };
        reader.readAsDataURL(blob);
      };

      recorder.onerror = (e) => {
        console.error('[Voice] ❌ MediaRecorder error:', e);
        stream.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setVoiceListening(false);
        showToast('🎤 Lỗi ghi âm', 'error');
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      showToast('🎤 Đang nghe... (nói trong 5 giây)', 'info');

      // Auto-stop after RECORD_DURATION_MS
      voiceTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, RECORD_DURATION_MS);

    } catch (err) {
      console.error('[Voice] ❌ getUserMedia failed:', err);
      setVoiceListening(false);
      if (err.name === 'NotAllowedError') {
        showToast('🎤 Cần cấp quyền microphone', 'error');
      } else {
        showToast('🎤 Không thể mở microphone: ' + err.message, 'error');
      }
    }
  }, []); // No deps — uses refs

  // ── Web Speech API mode (with auto-fallback to Gemini on network error) ──
  const startWebSpeechListening = useCallback(() => {
    if (!SpeechRecognition) {
      // No Web Speech API → go straight to Gemini
      startGeminiListening();
      return;
    }

    // Abort previous
    if (voiceRecognitionRef.current) {
      try { voiceRecognitionRef.current.abort(); } catch { /* ignore */ }
      voiceRecognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('[Voice] 🎤 WebSpeech started');
      setVoiceListening(true);

      voiceTimeoutRef.current = setTimeout(() => {
        if (voiceRecognitionRef.current) {
          try { voiceRecognitionRef.current.stop(); } catch { /* ignore */ }
        }
        showToast('🎤 Hết thời gian nghe. Nhấn 🎤 để nói lại.', 'info');
      }, 15000);
    };

    recognition.onresult = (event) => {
      const lastIdx = event.results.length - 1;
      const transcript = event.results[lastIdx]?.[0]?.transcript?.trim();
      console.log('[Voice] 📝 WebSpeech heard:', transcript);
      if (transcript) {
        const matched = handleVoiceAnswerRef.current(transcript);
        if (matched) {
          if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
          try { voiceRecognitionRef.current?.stop(); } catch { /* ignore */ }
        }
      }
    };

    recognition.onerror = (event) => {
      console.log('[Voice] ❌ WebSpeech error:', event.error);

      if (event.error === 'aborted') return;

      if (event.error === 'network') {
        // ★ AUTO-FALLBACK: Web Speech API can't reach Google servers
        // Switch permanently to Gemini mode for this session
        console.log('[Voice] 🔄 Network error → switching to Gemini mode');
        voiceModeRef.current = 'gemini';
        if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
        voiceRecognitionRef.current = null;
        setVoiceListening(false);
        showToast('🎤 Đang chuyển sang chế độ AI...', 'info');
        setTimeout(() => startGeminiListening(), 300);
        return;
      }

      if (event.error === 'no-speech') {
        showToast('🎤 Không nghe thấy. Nhấn 🎤 để thử lại.', 'info');
      } else if (event.error === 'not-allowed') {
        showToast('🎤 Cần cấp quyền microphone', 'error');
      } else {
        showToast(`🎤 Lỗi: ${event.error}`, 'error');
      }
    };

    recognition.onend = () => {
      console.log('[Voice] 🔇 WebSpeech ended');
      if (voiceTimeoutRef.current) {
        clearTimeout(voiceTimeoutRef.current);
        voiceTimeoutRef.current = null;
      }
      voiceRecognitionRef.current = null;
      setVoiceListening(false);
    };

    voiceRecognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error('[Voice] ❌ WebSpeech start failed:', e);
      // Fallback to Gemini
      voiceModeRef.current = 'gemini';
      startGeminiListening();
    }
  }, [SpeechRecognition, startGeminiListening]);

  // ── Main entry point: auto-pick the best mode ──
  const startVoiceListening = useCallback(() => {
    // Stop TTS if still reading
    stopSpeaking();
    setTtsSpeaking(false);

    // Clear previous state
    if (voiceTimeoutRef.current) {
      clearTimeout(voiceTimeoutRef.current);
      voiceTimeoutRef.current = null;
    }

    const mode = voiceModeRef.current;
    console.log(`[Voice] 🚀 Starting voice (mode=${mode})`);

    if (mode === 'gemini' || !SpeechRecognition) {
      startGeminiListening();
    } else {
      startWebSpeechListening();
    }
  }, [SpeechRecognition, startGeminiListening, startWebSpeechListening]);

  const stopVoiceListening = useCallback(() => {
    console.log('[Voice] 🛑 Stop requested');
    if (voiceTimeoutRef.current) {
      clearTimeout(voiceTimeoutRef.current);
      voiceTimeoutRef.current = null;
    }
    // Stop Web Speech API
    if (voiceRecognitionRef.current) {
      try { voiceRecognitionRef.current.abort(); } catch { /* ignore */ }
      voiceRecognitionRef.current = null;
    }
    // Stop MediaRecorder
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      } catch { /* ignore */ }
      mediaRecorderRef.current = null;
    }
    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    setVoiceListening(false);
  }, []);

  // ── TTS: Read question → then auto-listen for voice answer ──
  // Use ref for startVoiceListening to avoid stale closure in onEnd callback
  const startVoiceListeningRef = useRef(startVoiceListening);
  useEffect(() => { startVoiceListeningRef.current = startVoiceListening; });

  const handleReadQuestion = useCallback(() => {
    if (!currentQ || !isTTSSupported()) return;

    // If speaking, stop everything
    if (ttsSpeaking) {
      stopSpeaking();
      setTtsSpeaking(false);
      return;
    }

    // If listening, stop
    if (voiceListening) {
      stopVoiceListening();
      return;
    }

    // Build text: question + options
    let textToRead = `Câu ${currentIndex + 1}. ${currentQ.question_text}`;
    if (currentQ.question_type === 'fill_in') {
      textToRead += '. Hãy nói đáp án của bạn.';
    } else if (currentQ.options?.length) {
      textToRead += '. Các đáp án: ';
      currentQ.options.forEach(opt => {
        textToRead += `${opt.label}: ${opt.text}. `;
      });
      textToRead += 'Hãy nói A, B, C hoặc D để chọn.';
    }

    setTtsSpeaking(true);
    speak(textToRead, {
      lang: 'vi-VN',
      rate: 0.9,
      onEnd: () => {
        setTtsSpeaking(false);
        // ★ Use REF to get latest startVoiceListening (avoids stale closure)
        // ★ 600ms delay so TTS audio fully clears before mic opens
        setTimeout(() => {
          startVoiceListeningRef.current();
        }, 600);
      },
      onError: () => setTtsSpeaking(false),
    });
  }, [currentQ, currentIndex, ttsSpeaking, voiceListening, stopVoiceListening]);

  // ── Keyboard navigation ──
  const goToQuestionRef = useRef(goToQuestion);
  useEffect(() => { goToQuestionRef.current = goToQuestion; });
  const handleReadQuestionRef = useRef(handleReadQuestion);
  useEffect(() => { handleReadQuestionRef.current = handleReadQuestion; });
  const selectOptionRef = useRef(selectOption);
  useEffect(() => { selectOptionRef.current = selectOption; });

  useEffect(() => {
    const handleKeyNav = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (isAdaptive || submitting || result) return;

      if (e.key === 'ArrowRight' && currentIndex < totalQuestions - 1) {
        e.preventDefault();
        goToQuestionRef.current(currentIndex + 1);
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault();
        goToQuestionRef.current(currentIndex - 1);
      } else if (e.altKey && e.key.toLowerCase() === 's' && ttsEnabled && currentQ) {
        e.preventDefault();
        handleReadQuestionRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyNav);
    return () => document.removeEventListener('keydown', handleKeyNav);
  }, [currentIndex, totalQuestions, isAdaptive, submitting, result, ttsEnabled, currentQ]);

  // ── Feature 9: Auto-read on exam start (announce + read first question) ──
  useEffect(() => {
    if (!ttsEnabled || !isTTSSupported() || !currentQ || examStartedRef.current || result) return;
    examStartedRef.current = true;

    // Announce the exam and auto-read the first question
    const introText = `Bắt đầu bài thi: ${exam?.title || 'Bài kiểm tra'}. ` +
      `Tổng cộng ${totalQuestions} câu hỏi, thời gian ${Math.floor(timeLeft / 60)} phút. ` +
      `Hãy nghe câu hỏi và nói đáp án.`;

    setTtsSpeaking(true);
    speak(introText, {
      lang: 'vi-VN',
      rate: 0.95,
      onEnd: () => {
        setTtsSpeaking(false);
        // After intro → read the first question
        autoReadTimerRef.current = setTimeout(() => {
          handleReadQuestionRef.current();
        }, 500);
      },
      onError: () => setTtsSpeaking(false),
    });
  }, [ttsEnabled, currentQ, result]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Feature 9: Auto-read on question change ──
  // When currentIndex changes (user navigated), stop current audio then auto-read new question
  const prevIndexRef = useRef(currentIndex);
  useEffect(() => {
    // Skip first render (handled by exam-start effect above)
    if (prevIndexRef.current === currentIndex) return;
    prevIndexRef.current = currentIndex;

    // Stop everything from previous question
    stopSpeaking();
    setTtsSpeaking(false);
    if (voiceTimeoutRef.current) {
      clearTimeout(voiceTimeoutRef.current);
      voiceTimeoutRef.current = null;
    }
    if (autoReadTimerRef.current) {
      clearTimeout(autoReadTimerRef.current);
      autoReadTimerRef.current = null;
    }
    if (voiceRecognitionRef.current) {
      try { voiceRecognitionRef.current.abort(); } catch { /* ignore */ }
      voiceRecognitionRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try { if (mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop(); } catch { /* */ }
      mediaRecorderRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    setVoiceListening(false);

    // Auto-read the new question if TTS is enabled
    if (ttsEnabled && isTTSSupported() && currentQ && !result) {
      autoReadTimerRef.current = setTimeout(() => {
        handleReadQuestionRef.current();
      }, 600);
    }
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Feature 9: Auto-read exam results ──
  // ── Feature 9: Auto-read exam results ──
  useEffect(() => {
    if (result && ttsEnabled && isTTSSupported()) {
      // Delay to let the previous speech (Đang thu thành quả...) finish 
      // and prevent Chromium cancel-speak bug
      setTimeout(() => {
        const t = Math.floor(result.timeTaken || 0);
        const mins = Math.floor(t / 60);
        const secs = t % 60;
        const timeStr = mins > 0 ? `${mins} phút và ${secs} giây` : `${secs} giây`;
        
        let msg = `Đã nộp bài thành công. `;
        msg += `Bạn đạt ${result.score} điểm. `;
        msg += `Trả lời đúng ${result.correctCount} trên tổng số ${result.totalQuestions} câu. `;
        msg += `Thời gian làm bài là ${timeStr}. `;
        
        if (cheatingWarnings > 0) {
          msg += `Cảnh báo: Hệ thống ghi nhận bạn có ${cheatingWarnings} lần vi phạm trong quá trình thi. `;
        }
        
        msg += `Bấm Enter để quay về trang chủ.`;
        
        speak(msg, { lang: 'vi-VN', rate: 0.95 });
      }, 3500);
    }
  }, [result, ttsEnabled, cheatingWarnings]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
      if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
      if (autoReadTimerRef.current) clearTimeout(autoReadTimerRef.current);
      if (voiceRecognitionRef.current) {
        try { voiceRecognitionRef.current.abort(); } catch { /* ignore */ }
      }
      if (mediaRecorderRef.current) {
        try { if (mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop(); } catch { /* */ }
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // ═══════════════════════════════════════════════════════════

  // ── Result Screen ──
  if (result) {
    if (result.status === 'banned') {
      return (
        <div className="login-page" style={{ flexDirection: 'column', gap: 24 }}>
          <div className="login-card flex flex-col justify-center items-center" style={{ width: 560, textAlign: 'center', background: 'linear-gradient(145deg, rgba(159, 18, 57, 0.2) 0%, rgba(0, 0, 0, 0.4) 100%)', border: '1px solid rgba(225, 29, 72, 0.4)' }}>
            <div style={{ fontSize: 80, marginBottom: 16 }}>🚫</div>
            <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 12, color: '#f43f5e', textShadow: '0 0 20px rgba(244,63,94,0.5)' }}>
              BỊ ĐÌNH CHỈ THI
            </h2>
            <p style={{ fontSize: 16, color: '#fda4af', marginBottom: 24, padding: '0 20px' }}>
              Hệ thống giám sát (Anti-Cheat) đã cưỡng chế nộp bài do phát hiện bạn rời khỏi màn hình/tab quá ba lần. Toàn bộ điểm số bài thi này đã bị huỷ.
            </p>
            <div style={{ background: 'rgba(0,0,0,0.5)', padding: '16px', borderRadius: '12px', width: '100%', marginBottom: '24px' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Mã bài thi:</span>
                  <span style={{ fontWeight: 800 }}>{exam?.title}</span>
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Mức độ vi phạm:</span>
                  <span style={{ color: '#f43f5e', fontWeight: 900 }}>Vượt mức báo động ({cheatingWarnings} Lần)</span>
               </div>
            </div>
            <button className="btn btn--primary" style={{ background: '#e11d48', width: '100%' }} onClick={() => onComplete(result)}>
              QUAY VỀ TRANG CHỦ
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="login-page" style={{ flexDirection: 'column', gap: 24 }}>
        <div className="login-card" style={{ width: 520, textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 8 }}>
            {result.isPassed ? '🎉' : '😔'}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
            {result.isPassed ? 'Chúc mừng! Bạn đã đạt!' : 'Chưa đạt yêu cầu'}
          </h2>
          <p className="text-muted mb-24">{exam?.title}</p>

          {/* Score Circle */}
          <div style={{
            width: 140, height: 140, borderRadius: '50%', margin: '0 auto 24px',
            background: result.isPassed
              ? `conic-gradient(var(--success) 0deg, var(--success) ${result.score * 36}deg, var(--bg-glass) ${result.score * 36}deg)`
              : `conic-gradient(var(--error) 0deg, var(--error) ${result.score * 36}deg, var(--bg-glass) ${result.score * 36}deg)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: result.isPassed ? '0 0 30px rgba(34,197,94,0.3)' : '0 0 30px rgba(239,68,68,0.3)'
          }}>
            <div style={{
              width: 112, height: 112, borderRadius: '50%', background: 'var(--bg-secondary)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: result.isPassed ? 'var(--success)' : 'var(--error)' }}>
                {result.score}
              </span>
              <span className="text-sm text-muted">điểm</span>
            </div>
          </div>

          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--success)' }}>✅ {result.correctCount}</div>
              <div className="text-sm text-muted">Đúng</div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--error)' }}>❌ {result.wrongCount}</div>
              <div className="text-sm text-muted">Sai</div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-muted)' }}>⏭️ {result.unanswered}</div>
              <div className="text-sm text-muted">Bỏ qua</div>
            </div>
          </div>

          <div className="text-sm text-muted mb-24">
            {(() => {
              const safeTimeTaken = Math.max(0, Number(result.timeTaken || 0));
              const mm = Math.floor(safeTimeTaken / 60);
              const ss = safeTimeTaken % 60;
              return <>⏱️ Thời gian: {mm}:{ss.toString().padStart(2, '0')}</>;
            })()}
            {cheatingWarnings > 0 && <span className="text-error"> • ⚠️ {cheatingWarnings} cảnh báo gian lận</span>}
          </div>

          <div className="flex gap-12" style={{ justifyContent: 'center' }}>
            <button className="btn btn--primary" onClick={() => onComplete(result)}>📊 Về trang chính</button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQ) {
    return (
      <div className="page">
        <div className="empty-state">
          <div className="empty-state__icon">❌</div>
          <div className="empty-state__title">Không có câu hỏi</div>
          <div className="empty-state__text">Bài thi không có câu hỏi nào.</div>
          <button
            className="btn btn--secondary mt-16"
            onClick={async () => {
              await exitFullscreenIfNeeded();
              onExit();
            }}
          >
            ⬅️ Quay lại
          </button>
        </div>
      </div>
    );
  }

  const isMultipleChoice = currentQ.question_type === 'multiple_choice';
  const isFillIn = currentQ.question_type === 'fill_in';

  // ── Exam Taking UI ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
      {/* Top Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div className="flex items-center gap-12">
          <span style={{ fontSize: 20 }}>📝</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{exam?.title || 'Bài thi'}</div>
            <div className="text-sm text-muted">
              Câu {Math.min(currentIndex + 1, totalQuestions)}/{totalQuestions} • Đã trả lời: {answeredCount}/{totalQuestions}
              {isAdaptive && adaptiveMeta && (
                <span> • 🎯 Ability: {(adaptiveMeta.abilityScore ?? 0.5).toFixed(2)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-16">
          {enableAntiCheat && requireFullscreen && (
            <span className={`badge ${isFullscreen ? 'badge--success' : 'badge--warning'}`}>
              {isFullscreen ? '🖥️ Fullscreen' : '⚠️ Chưa fullscreen'}
            </span>
          )}
          {enableAntiCheat && cheatingWarnings > 0 && (
            <span className="badge badge--error">🛡️ {cheatingWarnings} cảnh báo</span>
          )}

          {/* Timer */}
          <div style={{
            padding: '6px 16px', borderRadius: 8, fontWeight: 800, fontSize: 18,
            fontFamily: 'monospace', letterSpacing: 2,
            background: timeLeft <= 60 ? 'var(--error-bg)' : timeLeft <= 300 ? 'var(--warning-bg)' : 'var(--bg-glass)',
            color: timeLeft <= 60 ? 'var(--error)' : timeLeft <= 300 ? 'var(--warning)' : 'var(--text-primary)',
            animation: timeLeft <= 60 ? 'pulse 1s infinite' : 'none',
          }}>
            ⏱️ {formatTime(timeLeft)}
          </div>

          {!isAdaptive && (
            <button className="btn btn--primary btn--sm" onClick={() => setShowConfirmSubmit(true)} disabled={submitting}>
              📤 Nộp bài
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Question Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          {/* Question Header */}
          <div className="flex justify-between items-center mb-16">
            <div className="flex items-center gap-8">
              <span className="badge badge--accent" style={{ fontSize: 14, padding: '6px 14px' }}>
                Câu {currentIndex + 1}
              </span>
              {currentQ.difficulty && (
                <span className={`badge badge--${currentQ.difficulty === 'easy' ? 'easy' : currentQ.difficulty === 'hard' ? 'hard' : 'medium'}`}>
                  {currentQ.difficulty === 'easy' ? '🟢 Dễ' : currentQ.difficulty === 'hard' ? '🔴 Khó' : '🟡 TB'}
                </span>
              )}
              {currentQ.points && (
                <span className="badge badge--info">💎 {currentQ.points} điểm</span>
              )}
            </div>
            <div className="flex items-center gap-8">
              {/* Feature 9: Voice Interaction Controls */}
              {ttsEnabled && isTTSSupported() && (
                <>
                  {/* Read question button */}
                  <button
                    className={`btn btn--sm ${ttsSpeaking ? 'btn--danger' : voiceListening ? 'btn--primary' : 'btn--ghost'}`}
                    onClick={handleReadQuestion}
                    aria-label={ttsSpeaking ? 'Dừng đọc' : voiceListening ? 'Dừng nghe' : 'Đọc câu hỏi rồi nghe đáp án (Alt+S)'}
                    title={ttsSpeaking ? 'Dừng đọc' : voiceListening ? 'Dừng nghe' : 'Đọc câu hỏi → Nói đáp án (Alt+S)'}
                    style={voiceListening ? { animation: 'voicePulse 1.5s infinite' } : {}}
                  >
                    {ttsSpeaking ? '⏹️ Dừng đọc'
                      : voiceListening ? '🎤 Đang nghe...'
                      : '🔊 Đọc & Trả lời'}
                  </button>

                  {/* Standalone mic button - just listen for answer */}
                  {!ttsSpeaking && !voiceListening && SpeechRecognition && (
                    <button
                      className="btn btn--sm btn--secondary"
                      onClick={startVoiceListening}
                      aria-label="Nói để chọn đáp án"
                      title="Nói: A, B, C, D hoặc 'câu tiếp'"
                    >
                      🎤 Nói chọn
                    </button>
                  )}

                  {/* Stop mic if listening standalone */}
                  {voiceListening && !ttsSpeaking && (
                    <button
                      className="btn btn--sm btn--danger"
                      onClick={stopVoiceListening}
                      aria-label="Dừng nghe"
                      style={{ animation: 'voicePulse 1.5s infinite' }}
                    >
                      ⏹️ Dừng
                    </button>
                  )}
                </>
              )}

              {/* Voice listening indicator */}
              {voiceListening && (
                <span
                  className="badge badge--error"
                  style={{ animation: 'pulse 1s infinite', fontSize: 11 }}
                  role="status"
                  aria-live="polite"
                >
                  🎤 Đang nghe — nói A, B, C hoặc D
                </span>
              )}
              <button
                className={`btn btn--sm ${answers[currentQ.id]?.flagged ? 'btn--danger' : 'btn--ghost'}`}
                onClick={() => toggleFlag(currentQ.id)}
                aria-label={answers[currentQ.id]?.flagged ? 'Bỏ đánh dấu' : 'Đánh dấu câu hỏi'}
              >
                {answers[currentQ.id]?.flagged ? '🚩 Đã đánh dấu' : '⬜ Đánh dấu'}
              </button>
            </div>
          </div>

          {/* Question Text */}
          <div className="card mb-24" style={{ padding: 24 }} role="region" aria-label={`Câu hỏi ${currentIndex + 1}`}>
            <div style={{ fontSize: 16, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {currentQ.question_text}
            </div>
            {currentQ.question_image && (
              <img src={currentQ.question_image} alt={`Hình minh họa câu hỏi ${currentIndex + 1}`}
                style={{ maxWidth: '100%', borderRadius: 8, marginTop: 16 }} />
            )}
          </div>

          {/* Answer Options */}
          {!isFillIn ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(currentQ.options || []).map((opt, oi) => {
                const selectedArr = (answers[currentQ.id]?.selected || '').split(',').filter(Boolean);
                const isSelected = selectedArr.includes(opt.label);

                return (
                  <div
                    key={oi}
                    role={isMultipleChoice ? 'checkbox' : 'radio'}
                    aria-checked={isSelected}
                    aria-label={`Đáp án ${opt.label}: ${opt.text}`}
                    tabIndex={0}
                    onClick={() => selectOption(currentQ.id, opt.label, isMultipleChoice)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectOption(currentQ.id, opt.label, isMultipleChoice);
                      }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 18px', borderRadius: 12, cursor: 'pointer',
                      background: isSelected ? 'var(--bg-accent)' : 'var(--bg-glass)',
                      border: isSelected ? '2px solid var(--accent)' : '2px solid var(--border)',
                      transition: 'all 0.15s ease',
                      outline: 'none',
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: isMultipleChoice ? 6 : '50%',
                      border: isSelected ? '2px solid var(--accent)' : '2px solid var(--text-muted)',
                      background: isSelected ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, color: 'white', fontSize: 14, fontWeight: 700,
                      transition: 'all 0.15s ease',
                    }}>
                      {isSelected && (isMultipleChoice ? '✓' : '●')}
                    </div>

                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', minWidth: 24 }}>
                      {opt.label}.
                    </span>
                    <span style={{ fontSize: 14, lineHeight: 1.6 }}>{opt.text}</span>
                  </div>
                );
              })}
              {isMultipleChoice && (
                <p className="text-sm text-muted mt-8">💡 Chọn nhiều đáp án (click để chọn/bỏ chọn)</p>
              )}
              {ttsEnabled && SpeechRecognition && (
                <p className="text-sm text-muted mt-4" style={{ opacity: 0.7 }}>
                  🎤 Bạn có thể nói: <strong>"A"</strong>, <strong>"chọn B"</strong>, <strong>"câu tiếp"</strong>, <strong>"câu trước"</strong>, <strong>"nộp bài"</strong>
                </p>
              )}
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label" id={`fill-label-${currentQ.id}`}>✍️ Nhập đáp án:</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="form-input"
                  placeholder="Nhập câu trả lời hoặc dùng 🎤 nói..."
                  value={answers[currentQ.id]?.fillAnswer || ''}
                  onChange={e => setFillAnswer(currentQ.id, e.target.value)}
                  style={{ fontSize: 16, padding: '14px 18px', flex: 1 }}
                  aria-labelledby={`fill-label-${currentQ.id}`}
                />
                {/* Feature 9: Voice input for fill-in */}
                <VoiceInputButton
                  size="md"
                  lang="vi-VN"
                  ariaLabel="Nói đáp án bằng giọng nói"
                  onResult={(transcript) => {
                    if (transcript) {
                      setFillAnswer(currentQ.id, transcript);
                      showToast(`🎤 Đã nhận: "${transcript}"`, 'success');
                    }
                  }}
                />
              </div>
              <div className="text-sm text-muted mt-4">💡 Nhấn 🎤 để nhập bằng giọng nói, hoặc dùng "🔊 Đọc & Trả lời" để nghe câu hỏi rồi trả lời</div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-24" style={{ paddingBottom: 24 }}>
            {!isAdaptive ? (
              <>
                <button className="btn btn--secondary" onClick={() => goToQuestion(currentIndex - 1)}
                  disabled={currentIndex === 0}>
                  ⬅️ Câu trước
                </button>
                <button className="btn btn--ghost" onClick={() => setShowNavPanel(!showNavPanel)}>
                  📋 {showNavPanel ? 'Ẩn' : 'Hiện'} bản đồ
                </button>
                {currentIndex < totalQuestions - 1 ? (
                  <button className="btn btn--primary" onClick={() => goToQuestion(currentIndex + 1)}>
                    Câu sau ➡️
                  </button>
                ) : (
                  <button className="btn btn--primary" onClick={() => setShowConfirmSubmit(true)} disabled={submitting}>
                    📤 Nộp bài
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="text-sm text-muted" style={{ alignSelf: 'center' }}>
                  Adaptive mode: trả lời xong mới mở câu kế tiếp
                </div>
                <button className="btn btn--primary" onClick={() => goToQuestion(currentIndex + 1)} disabled={submitting}>
                  {submitting ? '⏳ Đang xử lý...' : 'Tiếp theo ➡️'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Question Navigation Panel */}
        {showNavPanel && !isAdaptive && (
          <div style={{
            width: 240, borderLeft: '1px solid var(--border)', background: 'var(--bg-sidebar)',
            padding: 16, overflowY: 'auto', flexShrink: 0,
          }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)' }}>
              📋 Bản đồ câu hỏi
            </h4>

            {/* Legend */}
            <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span className="text-sm" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--accent)', display: 'inline-block' }}></span> Đã chọn
              </span>
              <span className="text-sm" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--error)', display: 'inline-block' }}></span> Đánh dấu
              </span>
              <span className="text-sm" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--bg-glass)', border: '1px solid var(--border)', display: 'inline-block' }}></span> Chưa làm
              </span>
            </div>

            {/* Question Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {questionList.map((q, i) => {
                const ans = answers[q.id];
                const hasAnswer = ans?.selected || ans?.fillAnswer;
                const isFlagged = ans?.flagged;
                const isCurrent = i === currentIndex;

                return (
                  <button key={i} onClick={() => goToQuestion(i)}
                    style={{
                      width: 36, height: 36, borderRadius: 6,
                      border: isCurrent ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: isFlagged ? 'var(--error-bg)' : hasAnswer ? 'var(--bg-accent)' : 'var(--bg-glass)',
                      color: hasAnswer ? 'var(--accent)' : 'var(--text-muted)',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.1s ease',
                      transform: isCurrent ? 'scale(1.1)' : 'none',
                      boxShadow: isCurrent ? 'var(--shadow-accent)' : 'none',
                    }}
                    title={`Câu ${i + 1}${hasAnswer ? ' ✅' : ''}${isFlagged ? ' 🚩' : ''}`}
                  >
                    {isFlagged ? '🚩' : i + 1}
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 20, padding: 12, background: 'var(--bg-glass)', borderRadius: 8 }}>
              <div className="text-sm mb-8">
                <span className="text-muted">Đã trả lời:</span>{' '}
                <strong style={{ color: 'var(--success)' }}>{answeredCount}</strong>/{totalQuestions}
              </div>
              <div className="progress mb-8">
                <div className="progress__bar" style={{ width: `${totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0}%` }}></div>
              </div>
              {flaggedCount > 0 && <div className="text-sm text-error">🚩 Đánh dấu: {flaggedCount}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Confirm Submit Modal */}
      {!isAdaptive && showConfirmSubmit && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 450 }}>
            <div className="modal__header">
              <h3 className="modal__title">📤 Xác nhận nộp bài</h3>
            </div>
            <div className="modal__body">
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <span style={{ fontSize: 48 }}>📋</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div className="card" style={{ padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--success)' }}>{answeredCount}</div>
                  <div className="text-sm text-muted">Đã trả lời</div>
                </div>
                <div className="card" style={{ padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--error)' }}>{totalQuestions - answeredCount}</div>
                  <div className="text-sm text-muted">Chưa trả lời</div>
                </div>
              </div>

              {totalQuestions - answeredCount > 0 && (
                <div style={{
                  background: 'var(--warning-bg)', border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: 8, padding: 12, marginBottom: 16,
                  fontSize: 13, color: 'var(--warning)', textAlign: 'center'
                }}>
                  ⚠️ Bạn còn {totalQuestions - answeredCount} câu chưa trả lời!
                </div>
              )}

              {flaggedCount > 0 && (
                <div style={{
                  background: 'var(--error-bg)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 8, padding: 12, marginBottom: 16,
                  fontSize: 13, color: 'var(--error)', textAlign: 'center'
                }}>
                  🚩 Có {flaggedCount} câu đã đánh dấu cần xem lại.
                </div>
              )}

              <p className="text-center text-sm text-muted">
                ⏱️ Thời gian còn lại: <strong>{formatTime(timeLeft)}</strong>
              </p>
            </div>
            <div className="modal__footer">
              <button className="btn btn--secondary" onClick={() => setShowConfirmSubmit(false)}>
                ⬅️ Quay lại làm bài
              </button>
              <button className="btn btn--primary" onClick={() => doSubmit('completed')} disabled={submitting}>
                {submitting ? '⏳ Đang nộp...' : '✅ Xác nhận nộp'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
