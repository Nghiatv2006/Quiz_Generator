/**
 * ═══════════════════════════════════════════════════════════
 *  Feature 9: Text-to-Speech Helper
 *  Sử dụng Web Speech API (SpeechSynthesis) để đọc câu hỏi
 *  và nội dung bằng giọng nói tiếng Việt.
 *
 *  BUG-F9-08 FIX: getVoices() now uses addEventListener
 *    instead of overwriting synth.onvoiceschanged, preventing
 *    memory leaks and handler conflicts.
 * ═══════════════════════════════════════════════════════════
 */

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

// Cache Vietnamese voice to avoid repeated lookups
let cachedViVoice = null;
let voicesCached = false;

function findVietnameseVoice() {
  if (voicesCached && cachedViVoice !== null) return cachedViVoice;
  if (!synth) return null;

  const voices = synth.getVoices();
  if (voices.length === 0) return null;

  cachedViVoice = voices.find(v => v.lang.startsWith('vi'))
    || voices.find(v => v.lang.includes('vi-VN'))
    || voices.find(v => v.lang === 'vi')
    || null;
  voicesCached = true;
  return cachedViVoice;
}

// Pre-cache voices when they load
if (synth && typeof synth.addEventListener === 'function') {
  synth.addEventListener('voiceschanged', () => {
    voicesCached = false; // Invalidate cache
    findVietnameseVoice(); // Re-cache
  });
}

/**
 * Speak text aloud using Web Speech API
 * @param {string} text - text to speak
 * @param {Object} [options]
 * @param {string} [options.lang='vi-VN']
 * @param {number} [options.rate=1.0] 0.5–2.0
 * @param {number} [options.pitch=1.0] 0–2
 * @param {number} [options.volume=1.0] 0–1
 * @param {Function} [options.onEnd]
 * @param {Function} [options.onError]
 * @returns {{ cancel: Function }} controller
 */
export function speak(text, options = {}) {
  const noop = { cancel: () => {} };

  if (!synth || !text?.trim()) return noop;

  // Cancel any ongoing speech
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text.trim());
  utterance.lang = options.lang || 'vi-VN';
  utterance.rate = options.rate ?? 1.0;
  utterance.pitch = options.pitch ?? 1.0;
  utterance.volume = options.volume ?? 1.0;

  // Use cached voice
  const viVoice = findVietnameseVoice();
  if (viVoice) {
    utterance.voice = viVoice;
  }

  utterance.onend = () => options.onEnd?.();
  utterance.onerror = (e) => {
    // 'canceled' is not a real error — it fires when synth.cancel() is called
    if (e.error === 'canceled') return;
    options.onError?.(e);
  };

  synth.speak(utterance);

  return {
    cancel: () => synth.cancel(),
  };
}

/**
 * Stop all speech
 */
export function stopSpeaking() {
  if (synth) synth.cancel();
}

/**
 * Check if TTS is currently speaking
 */
export function isSpeaking() {
  return synth?.speaking || false;
}

/**
 * Check if TTS is supported
 */
export function isTTSSupported() {
  return !!synth;
}

/**
 * Get available voices (async-safe, waits until voices loaded)
 * BUG-F9-08 FIX: Uses addEventListener instead of overwriting onvoiceschanged
 */
export async function getVoices() {
  if (!synth) return [];

  return new Promise((resolve) => {
    const voices = synth.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }

    // Voices may load asynchronously
    const handler = () => {
      synth.removeEventListener('voiceschanged', handler);
      resolve(synth.getVoices());
    };

    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', handler);
    } else {
      // Fallback for older browsers
      synth.onvoiceschanged = () => {
        synth.onvoiceschanged = null;
        resolve(synth.getVoices());
      };
    }

    // Fallback timeout
    setTimeout(() => {
      if (typeof synth.removeEventListener === 'function') {
        synth.removeEventListener('voiceschanged', handler);
      }
      resolve(synth.getVoices());
    }, 2000);
  });
}

export default { speak, stopSpeaking, isSpeaking, isTTSSupported, getVoices };
