/**
 * ═══════════════════════════════════════════════════════════
 *  Feature 9: AI Voice & Accessibility – IPC Handlers
 *  Handles voice command processing via Gemini AI:
 *  - voice:processCommand  → Parse voice transcript into action
 *  - voice:textToIntent    → Convert text to structured intent
 *  - voice:summarize       → AI-generate a spoken summary
 *
 *  BUG-F9-05/06 FIX: Null-safe destructuring with defaults
 * ═══════════════════════════════════════════════════════════
 */

const { query, insert } = require('../config/db');
const { generateContent } = require('../config/gemini');

module.exports = function (ipcMain) {

  // ── Process voice command ─────────────────────────────
  // Takes a raw transcript and returns a structured action
  ipcMain.handle('voice:processCommand', async (event, data) => {
    const startTime = Date.now();
    // BUG-F9-05 FIX: null-safe destructuring
    const userId = data?.userId;
    const transcript = data?.transcript;
    try {
      if (!transcript?.trim()) {
        return { success: false, message: 'Không nhận được giọng nói' };
      }

      const prompt = `Bạn là trợ lý AI cho ứng dụng Quiz Generator. Người dùng vừa nói: "${transcript}"

Hãy phân tích câu nói và trả về JSON với format:
{
  "intent": "navigate|answer|read|help|unknown",
  "action": "mô tả ngắn hành động",
  "params": { ... },
  "response": "câu trả lời bằng tiếng Việt cho người dùng"
}

Các intent có thể:
- "navigate": điều hướng trang (params: { page: "dashboard|settings|exams|..." })
- "answer": chọn đáp án (params: { option: "A|B|C|D" })
- "read": đọc nội dung hiện tại (params: {})
- "help": hỏi trợ giúp (params: {})
- "unknown": không hiểu câu nói

CHỈ trả về JSON, không thêm text khác.`;

      const result = await generateContent(prompt, { userId });
      const responseTime = Date.now() - startTime;

      // Parse AI response
      let parsed;
      try {
        const jsonStr = (result.text || '').replace(/```json\n?|\n?```/g, '').trim();
        parsed = JSON.parse(jsonStr);
      } catch {
        parsed = {
          intent: 'unknown',
          action: 'parse_error',
          params: {},
          response: 'Xin lỗi, tôi không hiểu câu nói của bạn. Hãy thử lại.',
        };
      }

      // Log AI usage
      if (userId) {
        try {
          await insert(
            `INSERT INTO ai_logs (user_id, action_type, input_summary, output_summary,
             model_used, response_time_ms, is_success)
             VALUES (?, 'chat', ?, ?, ?, ?, 1)`,
            [userId, `Voice command: ${transcript.substring(0, 200)}`,
             JSON.stringify(parsed).substring(0, 500),
             result.model || 'gemini', responseTime]
          );
          await query('UPDATE users SET total_ai_usage = total_ai_usage + 1 WHERE id = ?', [userId]);
        } catch (logErr) {
          console.warn('[voiceHandlers] log error:', logErr.message);
        }
      }

      return {
        success: true,
        intent: parsed.intent,
        action: parsed.action,
        params: parsed.params || {},
        response: parsed.response,
        responseTimeMs: responseTime,
      };
    } catch (err) {
      console.error('[voice:processCommand] error:', err);

      // Log failure (only if userId exists)
      if (userId) {
        try {
          await insert(
            `INSERT INTO ai_logs (user_id, action_type, input_summary, error_message,
             model_used, response_time_ms, is_success)
             VALUES (?, 'chat', ?, ?, 'gemini', ?, 0)`,
            [userId, `Voice command: ${(transcript || '').substring(0, 200)}`,
             err.message, Date.now() - startTime]
          );
        } catch { /* silent */ }
      }

      return {
        success: false,
        message: err.message || 'Lỗi xử lý giọng nói',
        response: 'Xin lỗi, đã có lỗi xảy ra khi xử lý giọng nói. Hãy thử lại.',
      };
    }
  });

  // ── Text to Intent (lightweight, no AI call) ──────────
  // Simple keyword-based matching for common voice commands
  ipcMain.handle('voice:textToIntent', async (event, data) => {
    try {
      // BUG-F9-06 FIX: null-safe destructuring
      const transcript = data?.transcript;
      if (!transcript?.trim()) {
        return { success: false, message: 'Không có nội dung' };
      }

      const text = transcript.toLowerCase().trim();
      let intent = 'unknown';
      let params = {};
      let response = '';

      // Navigation keywords
      const navMap = {
        'trang chủ': 'dashboard', 'dashboard': 'dashboard',
        'cài đặt': 'settings', 'settings': 'settings',
        'bài thi': 'exam-take', 'thi': 'exam-take',
        'lịch sử': 'history', 'kết quả': 'history',
        'bảng xếp hạng': 'leaderboard', 'xếp hạng': 'leaderboard',
        'chủ đề': 'topics', 'topics': 'topics',
        'ai chat': 'ai-chat', 'trò chuyện': 'ai-chat',
      };

      for (const [keyword, page] of Object.entries(navMap)) {
        if (text.includes(keyword)) {
          intent = 'navigate';
          params = { page };
          response = `Đang chuyển đến trang ${keyword}`;
          break;
        }
      }

      // Answer selection (only if no nav match)
      if (intent === 'unknown') {
        const answerMatch = text.match(/(?:chọn|đáp án|câu)\s*([a-d])/i);
        if (answerMatch) {
          intent = 'answer';
          params = { option: answerMatch[1].toUpperCase() };
          response = `Đã chọn đáp án ${params.option}`;
        }
      }

      // Read command
      if (intent === 'unknown' && (text.includes('đọc') || text.includes('read'))) {
        intent = 'read';
        response = 'Đang đọc nội dung hiện tại';
      }

      // Help
      if (intent === 'unknown' && (text.includes('giúp') || text.includes('help') || text.includes('trợ giúp'))) {
        intent = 'help';
        response = 'Bạn có thể nói: "chọn A", "câu tiếp", "đọc câu hỏi", "trang chủ"...';
      }

      if (intent === 'unknown') {
        response = 'Không nhận diện được lệnh. Hãy nói rõ hơn.';
      }

      return { success: true, intent, params, response };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // ── AI Summarize for TTS ──────────────────────────────
  // Generate a concise spoken summary of content
  ipcMain.handle('voice:summarize', async (event, data) => {
    try {
      // BUG-F9-06 FIX: null-safe destructuring
      const userId = data?.userId;
      const content = data?.content;
      const type = data?.type || 'question';

      if (!content?.trim()) {
        return { success: false, message: 'Không có nội dung để tóm tắt' };
      }

      const typePrompts = {
        question: 'Tóm tắt ngắn gọn câu hỏi sau bằng tiếng Việt, phù hợp để đọc to:',
        result: 'Tóm tắt kết quả thi sau bằng tiếng Việt, phù hợp để đọc to:',
        explanation: 'Giải thích ngắn gọn đáp án sau bằng tiếng Việt, phù hợp để đọc to:',
      };

      const prompt = `${typePrompts[type] || typePrompts.question}\n\n${content}\n\nChỉ trả về nội dung tóm tắt, không thêm gì khác.`;

      const result = await generateContent(prompt, { userId });

      return {
        success: true,
        summary: result.text?.trim() || content,
      };
    } catch (err) {
      console.error('[voice:summarize] error:', err);
      return {
        success: false,
        message: err.message,
        summary: data?.content || '', // Fallback to original content
      };
    }
  });

  // ── Transcribe audio via AI (Groq Whisper → Gemini fallback) ──
  // Replaces Web Speech API which fails in Electron with 'network' error
  // Waterfall: Groq Whisper (fast) → Gemini 2.0 Flash → Gemini 1.5 Flash
  ipcMain.handle('voice:transcribe', async (event, data) => {
    const audioBase64 = data?.audio;
    const mimeType = data?.mimeType || 'audio/webm';

    if (!audioBase64) {
      return { success: false, message: 'Không có dữ liệu âm thanh' };
    }

    const audioSizeKB = Math.round(audioBase64.length / 1024);
    console.log(`[voice:transcribe] Received ${audioSizeKB}KB audio (${mimeType})`);

    const errors = [];

    // ── Method 1: Groq Whisper (fastest, dedicated STT model) ──
    try {
      const Groq = require('groq-sdk');
      const groqApiKey = process.env.GROQ_API_KEY;
      if (groqApiKey) {
        console.log('[voice:transcribe] Trying Groq Whisper...');
        const groq = new Groq({ apiKey: groqApiKey });

        // Convert base64 to buffer → create File-like object
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('ogg') ? 'ogg' : 'wav';
        const file = new File([audioBuffer], `audio.${ext}`, { type: mimeType });

        const transcription = await groq.audio.transcriptions.create({
          file: file,
          model: 'whisper-large-v3-turbo',
          language: 'vi',
          response_format: 'text',
        });

        const transcript = (typeof transcription === 'string' ? transcription : transcription?.text || '').trim();
        console.log(`[voice:transcribe] Groq Whisper: "${transcript}"`);

        if (transcript && transcript !== '' && !transcript.includes('[BLANK_AUDIO]')) {
          return { success: true, transcript, provider: 'groq-whisper' };
        }
        return { success: false, message: 'Không nghe thấy giọng nói' };
      }
    } catch (err) {
      console.warn('[voice:transcribe] Groq Whisper failed:', err.message?.substring(0, 100));
      errors.push(`Groq: ${err.message?.substring(0, 60)}`);
    }

    // ── Method 2: Gemini multimodal (audio + text prompt) ──
    const { genAI } = require('../config/gemini');
    if (genAI) {
      const geminiModels = ['gemini-2.0-flash', 'gemini-1.5-flash'];
      for (const modelName of geminiModels) {
        try {
          console.log(`[voice:transcribe] Trying Gemini ${modelName}...`);
          const model = genAI.getGenerativeModel({ model: modelName });

          const prompt = [
            {
              inlineData: { mimeType, data: audioBase64 },
            },
            {
              text: `Nghe đoạn audio tiếng Việt này và trả về đúng những gì người dùng nói.
Quy tắc: Chỉ trả về transcript thuần, KHÔNG thêm gì khác.
Nếu nói chữ cái (A, B, C, D), trả về chữ cái đó.
Nếu im lặng, trả về: [silence]`,
            },
          ];

          const result = await model.generateContent(prompt);
          const transcript = result.response.text()?.trim();
          console.log(`[voice:transcribe] Gemini ${modelName}: "${transcript}"`);

          if (transcript && !transcript.toLowerCase().includes('[silence]')) {
            return { success: true, transcript, provider: `gemini-${modelName}` };
          }
          return { success: false, message: 'Không nghe thấy giọng nói' };
        } catch (err) {
          console.warn(`[voice:transcribe] Gemini ${modelName} failed:`, err.message?.substring(0, 100));
          errors.push(`Gemini(${modelName}): ${err.message?.substring(0, 60)}`);
        }
      }
    }

    // All failed
    const isRateLimit = errors.some(e => e.includes('429') || e.includes('quota') || e.includes('rate'));
    const friendlyMsg = isRateLimit
      ? '🎤 API hết quota tạm thời. Vui lòng chờ 1 phút rồi thử lại.'
      : '🎤 Không thể nhận diện giọng nói. Kiểm tra API key trong .env.';

    console.error('[voice:transcribe] All providers failed:', errors.join(' | '));
    return { success: false, message: friendlyMsg };
  });
};
