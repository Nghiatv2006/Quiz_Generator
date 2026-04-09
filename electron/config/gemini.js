/**
 * ══════════════════════════════════════════════════════════════
 *  AI Engine – Quiz Generator V2
 *  Providers: Ollama (local GPU) + Groq (ultra-fast LPU) + Gemini (cloud)
 *  Strategy : Primary → Groq fallback → secondary
 *  Auto-retry: 429 rate-limit, Ollama crash, Gemini safety block
 * ══════════════════════════════════════════════════════════════
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq   = require('groq-sdk');
const fs     = require('fs');
const path   = require('path');
require('dotenv').config();

// ── API Keys & Config ─────────────────────────────────────────
const GEMINI_API_KEY   = process.env.GEMINI_API_KEY;
const GROQ_API_KEY     = process.env.GROQ_API_KEY;
const OLLAMA_BASE_URL  = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const DEFAULT_PROVIDER = (process.env.AI_PROVIDER_DEFAULT || 'groq').toLowerCase();
const SETTINGS_PATH    = path.join(__dirname, '..', 'data', 'ai-provider-settings.json');

// ── Timeouts ──────────────────────────────────────────────────
const OLLAMA_TIMEOUT   = 180_000;   // 3 phút (local model chậm)
const GEMINI_TIMEOUT   = 60_000;    // 60s – có timeout cứng
const GROQ_TIMEOUT     = 30_000;    // 30s – Groq rất nhanh (<5s thường)

// ── GPU (Ollama) ──────────────────────────────────────────────
const OLLAMA_NUM_GPU   = parseInt(process.env.OLLAMA_NUM_GPU ?? '-1') || -1;
const OLLAMA_MAX_CHARS = 8000;  // Truncate để tránh OOM

// ── Models ────────────────────────────────────────────────────
const GEMINI_MODELS = {
  text:   process.env.GEMINI_MODEL_TEXT   || 'gemini-2.0-flash',
  chat:   process.env.GEMINI_MODEL_CHAT   || 'gemini-2.0-flash',
  vision: process.env.GEMINI_MODEL_VISION || 'gemini-2.0-flash',
};
const GEMINI_FALLBACK = {
  text: 'gemini-1.5-flash', chat: 'gemini-1.5-flash', vision: 'gemini-1.5-flash',
};

const GROQ_MODELS = {
  text:   process.env.GROQ_MODEL_TEXT   || 'llama-3.3-70b-versatile',
  chat:   process.env.GROQ_MODEL_CHAT   || 'llama-3.3-70b-versatile',
  vision: process.env.GROQ_MODEL_VISION || 'llama-3.2-11b-vision-preview',
};
const GROQ_FALLBACK = {
  text:   'llama-3.1-8b-instant',
  chat:   'llama-3.1-8b-instant',
  vision: 'llama-3.2-11b-vision-preview',
};

const OLLAMA_MODELS = {
  text:   process.env.OLLAMA_MODEL_TEXT   || 'quizai',
  chat:   process.env.OLLAMA_MODEL_CHAT   || 'quizai',
  vision: process.env.OLLAMA_MODEL_VISION || 'llava:7b',
};

// ── System Prompts ────────────────────────────────────────────
const SYSTEM_PROMPTS = {
  json: [
    'Bạn là QuizAI – AI chuyên gia giáo dục trong Quiz Generator V2.',
    'LUẬT BẮT BUỘC: Chỉ xuất ra JSON hợp lệ. Không thêm text trước/sau JSON.',
    'Không dùng markdown. Không giải thích. Không ghi chú. Chỉ JSON thuần túy.',
    'JSON phải parseable bởi JSON.parse(). Không để trailing comma.',
  ].join('\n'),
  chat: [
    'Bạn là QuizAI – gia sư AI thân thiện trong Quiz Generator V2.',
    'Luôn trả lời tiếng Việt, dễ hiểu, khuyến khích học sinh.',
    'Giải thích từng bước, dùng ví dụ. Kết thúc bằng gợi ý học tiếp.',
  ].join('\n'),
};

// ── Rate-limit State ──────────────────────────────────────────
let geminiRateLimitUntil = 0;
let geminiConsecutive429 = 0;
let groqRateLimitUntil   = 0;
let groqConsecutive429   = 0;

// ── Utils ─────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, Math.max(0, ms)));

function isRateLimitErr(err) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('429') || m.includes('quota') ||
    m.includes('rate limit') || m.includes('too many requests') ||
    m.includes('rate_limit_exceeded');
}
function isOllamaCrash(err) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('runner process has terminated') || m.includes('llama runner') ||
    (m.includes('ollama http 500') && m.includes('error'));
}
function parseRetryDelay(errMsg) {
  const m = String(errMsg || '').match(/"retryDelay":"([\d.]+)s"/);
  if (m) return Math.ceil(parseFloat(m[1]) * 1000) + 1000;
  // Groq: "Please try again in Xs"
  const g = String(errMsg || '').match(/try again in ([\d.]+)s/i);
  if (g) return Math.ceil(parseFloat(g[1]) * 1000) + 500;
  if (String(errMsg).includes('429')) return 20_000;
  return 5000;
}
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout (${ms/1000}s)`)), ms)),
  ]);
}

// ══════════════════════════════════════════════════════════════
// GEMINI
// ══════════════════════════════════════════════════════════════
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

async function generateWithGemini(prompt, modelType = 'text') {
  if (!genAI) throw new Error('GEMINI_API_KEY chưa cấu hình trong .env');
  if (Date.now() < geminiRateLimitUntil) {
    const s = Math.ceil((geminiRateLimitUntil - Date.now()) / 1000);
    throw new Error(`Gemini rate-limited còn ${s}s`);
  }

  const attempts = [
    { name: GEMINI_MODELS[modelType] || GEMINI_MODELS.text, label: 'primary' },
    { name: GEMINI_FALLBACK[modelType] || GEMINI_FALLBACK.text, label: 'fallback' },
  ];

  let lastErr;
  for (let i = 0; i < attempts.length; i++) {
    const { name, label } = attempts[i];
    try {
      const model  = genAI.getGenerativeModel({ model: name });
      const result = await withTimeout(model.generateContent(prompt), GEMINI_TIMEOUT, `Gemini/${name}`);
      const resp   = result.response;

      // Safety check
      const cands = resp.candidates || [];
      if (!cands.length || cands[0]?.finishReason === 'SAFETY') {
        throw new Error(`Gemini safety block (${cands[0]?.finishReason || 'UNKNOWN'})`);
      }
      let text;
      try { text = resp.text(); } catch (e) { throw new Error(`Gemini safety: ${e.message}`); }

      geminiConsecutive429 = 0;
      return { text, tokens: resp.usageMetadata?.totalTokenCount || null, modelUsed: `${name}(${label})`, providerUsed: 'gemini' };
    } catch (err) {
      lastErr = err;
      if (isRateLimitErr(err)) {
        geminiConsecutive429++;
        const delay = parseRetryDelay(err.message) + (geminiConsecutive429 > 3 ? 60_000 : 0);
        geminiRateLimitUntil = Date.now() + delay;
        console.warn(`⏳ Gemini 429 (${label}) – chờ ${Math.ceil(delay/1000)}s`);
        if (i < attempts.length - 1) { await sleep(Math.min(delay, 15_000)); continue; }
      }
      break;
    }
  }
  throw lastErr;
}

function getGeminiStatus() {
  const configured = !!(GEMINI_API_KEY && GEMINI_API_KEY.length > 10);
  const rateLimited = Date.now() < geminiRateLimitUntil;
  return {
    configured,
    keyPreview: configured ? `${GEMINI_API_KEY.substring(0, 12)}...` : null,
    activeModel: GEMINI_MODELS.text,
    fallbackModel: GEMINI_FALLBACK.text,
    rateLimited,
    rateLimitRemainingS: rateLimited ? Math.ceil((geminiRateLimitUntil - Date.now()) / 1000) : 0,
  };
}

// ══════════════════════════════════════════════════════════════
// GROQ (Ultra-fast LPU – OpenAI-compatible API)
// ══════════════════════════════════════════════════════════════
const groqClient = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

async function generateWithGroq(prompt, modelType = 'text') {
  if (!groqClient) throw new Error('GROQ_API_KEY chưa cấu hình trong .env');
  if (Date.now() < groqRateLimitUntil) {
    const s = Math.ceil((groqRateLimitUntil - Date.now()) / 1000);
    throw new Error(`Groq rate-limited còn ${s}s`);
  }

  const attempts = [
    { name: GROQ_MODELS[modelType] || GROQ_MODELS.text, label: 'primary' },
    { name: GROQ_FALLBACK[modelType] || GROQ_FALLBACK.text, label: 'fallback' },
  ];

  // Chuẩn bị messages (Groq dùng format OpenAI-compatible)
  const systemPrompt = modelType === 'chat' ? SYSTEM_PROMPTS.chat : SYSTEM_PROMPTS.json;
  let userContent;
  let imageContent = null;

  if (Array.isArray(prompt)) {
    // Vision: prompt có dạng [{ inlineData }, { text }]
    const textPart  = prompt.find(p => typeof p.text === 'string');
    const imagePart = prompt.find(p => p.inlineData?.data);
    userContent  = textPart?.text || '';
    imageContent = imagePart ? {
      type: 'image_url',
      image_url: { url: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}` },
    } : null;
  } else {
    userContent = String(prompt || '');
  }

  // Truncate để tránh token limit
  if (userContent.length > 12000) {
    userContent = userContent.substring(0, 12000) + '\n\n[Nội dung cắt bớt. Hãy sinh câu hỏi từ phần trên.]';
  }

  // Build messages
  const buildMessages = (isVision) => {
    const content = (isVision && imageContent)
      ? [{ type: 'text', text: userContent }, imageContent]
      : userContent;
    return [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content },
    ];
  };

  let lastErr;
  for (let i = 0; i < attempts.length; i++) {
    const { name, label } = attempts[i];
    const isVision = modelType === 'vision';
    try {
      const completionPromise = groqClient.chat.completions.create({
        model:       name,
        messages:    buildMessages(isVision),
        temperature: modelType === 'chat' ? 0.6 : 0.1,
        max_tokens:  4096,
        top_p:       0.85,
        stream:      false,
      });

      const completion = await withTimeout(completionPromise, GROQ_TIMEOUT, `Groq/${name}`);
      const text       = completion.choices?.[0]?.message?.content || '';
      const tokens     = completion.usage?.total_tokens || null;

      if (!text.trim()) throw new Error('Groq trả về response trống');

      groqConsecutive429 = 0;
      return { text, tokens, modelUsed: `${name}(${label})`, providerUsed: 'groq' };
    } catch (err) {
      lastErr = err;
      if (isRateLimitErr(err)) {
        groqConsecutive429++;
        const delay = parseRetryDelay(err.message) + (groqConsecutive429 > 3 ? 30_000 : 0);
        groqRateLimitUntil = Date.now() + delay;
        console.warn(`⏳ Groq 429 (${label}) – chờ ${Math.ceil(delay/1000)}s, thử model nhỏ hơn...`);
        if (i < attempts.length - 1) { await sleep(Math.min(delay, 10_000)); continue; }
      }
      break;
    }
  }
  throw lastErr;
}

async function getGroqStatus() {
  if (!groqClient) {
    return { configured: false, apiKey: false, models: [], rateLimited: false, rateLimitRemainingS: 0 };
  }
  const rateLimited = Date.now() < groqRateLimitUntil;
  try {
    // Groq SDK v0.x: list models via HTTP (lightweight check)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      return {
        configured: true, apiKey: true, online: false,
        error: `HTTP ${res.status}`, rateLimited, rateLimitRemainingS: 0,
        activeModel: GROQ_MODELS.text, fallbackModel: GROQ_FALLBACK.text,
      };
    }
    const data   = await res.json();
    const models = (data.data || []).map(m => m.id).filter(Boolean);
    const activeInstalled = models.includes(GROQ_MODELS.text) || models.includes(GROQ_MODELS.text.split('-').slice(0,3).join('-'));
    return {
      configured: true, apiKey: true, online: true,
      models, activeModel: GROQ_MODELS.text, fallbackModel: GROQ_FALLBACK.text,
      activeModelInstalled: activeInstalled,
      rateLimited, rateLimitRemainingS: rateLimited ? Math.ceil((groqRateLimitUntil - Date.now()) / 1000) : 0,
    };
  } catch {
    return {
      configured: true, apiKey: true, online: false,
      error: 'Không kết nối được Groq API',
      activeModel: GROQ_MODELS.text, fallbackModel: GROQ_FALLBACK.text,
      rateLimited, rateLimitRemainingS: rateLimited ? Math.ceil((groqRateLimitUntil - Date.now()) / 1000) : 0,
    };
  }
}

// ══════════════════════════════════════════════════════════════
// OLLAMA (Local GPU/CPU)
// ══════════════════════════════════════════════════════════════
async function ollamaRequest(pathName, body) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OLLAMA_TIMEOUT);
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}${pathName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Ollama HTTP ${res.status}: ${txt}`);
    }
    return res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Ollama timeout (>${OLLAMA_TIMEOUT/1000}s)`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeOllamaPrompt(prompt) {
  const text = Array.isArray(prompt) ? (prompt.find(p => p.text)?.text || '') : String(prompt || '');
  return text.length > OLLAMA_MAX_CHARS
    ? text.substring(0, OLLAMA_MAX_CHARS) + '\n\n[Nội dung cắt bớt. Hãy sinh câu hỏi từ phần trên.]'
    : text;
}
function extractVisionParts(prompt) {
  if (!Array.isArray(prompt)) return { text: String(prompt || ''), imageBase64: null, mimeType: 'image/jpeg' };
  const textPart  = prompt.find(p => typeof p.text === 'string');
  const imagePart = prompt.find(p => p.inlineData?.data);
  return {
    text: textPart?.text || '',
    imageBase64: imagePart?.inlineData?.data || null,
    mimeType: imagePart?.inlineData?.mimeType || 'image/jpeg',
  };
}

async function generateWithOllama(prompt, modelType = 'text', _retrying = false) {
  const modelName    = OLLAMA_MODELS[modelType] || OLLAMA_MODELS.text;
  const systemPrompt = modelType === 'chat' ? SYSTEM_PROMPTS.chat : SYSTEM_PROMPTS.json;

  if (modelType === 'vision') {
    const { text, imageBase64 } = extractVisionParts(prompt);
    const data = await ollamaRequest('/api/chat', {
      model: modelName, stream: false,
      options: { num_gpu: OLLAMA_NUM_GPU },
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.json },
        { role: 'user',   content: text, images: imageBase64 ? [imageBase64] : [] },
      ],
    });
    const tokens = (data?.prompt_eval_count || 0) + (data?.eval_count || 0);
    return { text: data?.message?.content || '', tokens, modelUsed: modelName, providerUsed: 'ollama' };
  }

  try {
    const data = await ollamaRequest('/api/chat', {
      model: modelName, stream: false,
      options: {
        temperature:    modelType === 'chat' ? 0.6 : 0.2,
        top_p:          0.85,
        repeat_penalty: 1.1,
        num_gpu:        OLLAMA_NUM_GPU,   // GPU acceleration
        num_ctx:        _retrying ? 2048 : 4096,
      },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: normalizeOllamaPrompt(prompt) },
      ],
    });
    const tokens = (data?.prompt_eval_count || 0) + (data?.eval_count || 0);
    return { text: data?.message?.content || '', tokens, modelUsed: modelName, providerUsed: 'ollama' };
  } catch (err) {
    if (isOllamaCrash(err) && !_retrying) {
      console.warn('⚠️ Ollama crash – retry với num_ctx=2048...');
      await sleep(3000);
      return generateWithOllama(prompt, modelType, true);
    }
    throw err;
  }
}

async function getOllamaStatus() {
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res   = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { online: false, models: [], activeModel: OLLAMA_MODELS.text, activeModelInstalled: false };
    const data   = await res.json();
    const models = (data.models || []).map(m => m.name);
    return {
      online: true, models,
      activeModel: OLLAMA_MODELS.text,
      activeModelInstalled: models.some(m =>
        m === OLLAMA_MODELS.text || m.startsWith(OLLAMA_MODELS.text.split(':')[0])
      ),
      numGpu: OLLAMA_NUM_GPU,
    };
  } catch {
    return { online: false, models: [], activeModel: OLLAMA_MODELS.text, activeModelInstalled: false, numGpu: OLLAMA_NUM_GPU };
  }
}

// ══════════════════════════════════════════════════════════════
// PROVIDER SETTINGS (per-user, saved to JSON file)
// ══════════════════════════════════════════════════════════════
const VALID_PROVIDERS = ['ollama', 'groq', 'gemini'];

function ensureSettingsStore() {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(SETTINGS_PATH))
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ providersByUser: {} }, null, 2));
}
function readSettingsStore() {
  try { ensureSettingsStore(); return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); }
  catch { return { providersByUser: {} }; }
}
function writeSettingsStore(data) {
  ensureSettingsStore();
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2));
}
function getAIProvider(userId) {
  const s = readSettingsStore();
  const p = (s.providersByUser?.[String(userId)] || DEFAULT_PROVIDER).toLowerCase();
  return VALID_PROVIDERS.includes(p) ? p : DEFAULT_PROVIDER;
}
function setAIProvider(userId, provider) {
  const p = String(provider || '').toLowerCase();
  if (!VALID_PROVIDERS.includes(p)) throw new Error(`Provider không hợp lệ. Chọn: ${VALID_PROVIDERS.join(', ')}`);
  const s = readSettingsStore();
  s.providersByUser = s.providersByUser || {};
  s.providersByUser[String(userId)] = p;
  writeSettingsStore(s);
  return p;
}

// ══════════════════════════════════════════════════════════════
// ENTRY POINT – generateContent (3-provider waterfall)
// ══════════════════════════════════════════════════════════════
/**
 * Thứ tự thử theo provider ưu tiên:
 * - ollama  → [ollama, groq, gemini]
 * - groq    → [groq, ollama, gemini]
 * - gemini  → [gemini, groq, ollama]
 *
 * Mỗi provider đã có logic retry nội bộ (429, crash).
 * Nếu tất cả fail → throw error chi tiết.
 */
async function generateContent(prompt, modelType = 'text', options = {}) {
  const startTime = Date.now();
  const provider  = getAIProvider(options?.userId);
  const allProviders = ['ollama', 'groq', 'gemini'];

  // Build order: primary first, then rest
  const order = [provider, ...allProviders.filter(p => p !== provider)];
  const errors = {};

  for (const p of order) {
    try {
      console.log(`🤖 Thử AI provider: ${p} [${modelType}]`);
      let r;
      if (p === 'ollama')  r = await generateWithOllama(prompt, modelType);
      else if (p === 'groq')   r = await generateWithGroq(prompt, modelType);
      else                     r = await generateWithGemini(prompt, modelType);

      console.log(`✅ ${p} phản hồi trong ${Date.now() - startTime}ms (${r.tokens || '?'} tokens)`);
      return { ...r, responseTimeMs: Date.now() - startTime };
    } catch (err) {
      errors[p] = err.message;
      if (isRateLimitErr(err) && p === 'groq') {
        console.warn(`⏳ Groq rate-limit → thử provider tiếp theo`);
      } else if (isRateLimitErr(err) && p === 'gemini') {
        console.warn(`⏳ Gemini rate-limit → thử provider tiếp theo`);
      } else if (isOllamaCrash(err)) {
        console.warn(`💥 Ollama crash (đã retry) → thử cloud provider`);
      } else {
        console.error(`❌ AI Error [${p}/${modelType}]:`, err.message);
      }
    }
  }

  const errMsg = Object.entries(errors).map(([p, m]) => `• ${p.toUpperCase()}: ${m}`).join('\n');
  throw new Error(
    `Không thể gọi AI (đã thử cả 3 providers):\n${errMsg}\n\n` +
    `Gợi ý:\n` +
    `- Groq: Kiểm tra GROQ_API_KEY tại console.groq.com (miễn phí)\n` +
    `- Gemini: Kiểm tra GEMINI_API_KEY hoặc chờ quota reset\n` +
    `- Ollama: Chạy "ollama serve" rồi "ollama pull quizai"`
  );
}

// ══════════════════════════════════════════════════════════════
// JSON PARSER – 5 tầng fallback (robust)
// ══════════════════════════════════════════════════════════════
function parseAIJson(text) {
  if (!text) throw new Error('AI trả về response rỗng');

  let cleaned = text.trim()
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();

  // Bước 2: Parse trực tiếp
  try { return JSON.parse(cleaned); } catch { /* tiếp tục */ }

  // Bước 3: Extract JSON bằng balanced bracket (không dùng greedy regex)
  function extractJson(str, open, close) {
    let start = str.indexOf(open);
    if (start === -1) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < str.length; i++) {
      const c = str[i];
      if (esc) { esc = false; continue; }
      if (c === '\\' && inStr) { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) return str.substring(start, i + 1); }
    }
    return null;
  }

  const aiIdx = cleaned.indexOf('['), obIdx = cleaned.indexOf('{');
  let candidate =
    aiIdx !== -1 && (obIdx === -1 || aiIdx < obIdx)
      ? (extractJson(cleaned, '[', ']') || extractJson(cleaned, '{', '}'))
      : (extractJson(cleaned, '{', '}') || extractJson(cleaned, '[', ']'));

  if (candidate) {
    try { return JSON.parse(candidate); } catch { /* tiếp tục */ }
  }

  // Bước 4: Common JSON fixes
  const fixed = (candidate || cleaned)
    .replace(/,\s*([}\]])/g, '$1')               // trailing comma
    .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')   // unquoted keys
    .replace(/:\s*'([^']*)'/g, ': "$1"');         // single-quoted values

  try { return JSON.parse(fixed); } catch { /* tiếp tục */ }

  // Bước 5: Error với preview
  throw new Error(
    `Không thể parse JSON từ AI.\nPreview:\n${cleaned.substring(0, 400)}\n\nThử lại hoặc đổi provider.`
  );
}

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════
module.exports = {
  generateContent,
  parseAIJson,
  getAIProvider,
  setAIProvider,
  getOllamaStatus,
  getGeminiStatus,
  getGroqStatus,
  VALID_PROVIDERS,
  OLLAMA_MODELS,
  GEMINI_MODELS,
  GROQ_MODELS,
  // Expose genAI for compatibility
  genAI,
};