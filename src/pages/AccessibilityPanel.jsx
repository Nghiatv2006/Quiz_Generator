import React, { useState, useEffect, useCallback, useRef } from 'react';

const api = typeof window !== 'undefined' ? window['electronAPI'] : null;

/**
 * ═══════════════════════════════════════════════════════════
 *  Feature 9: AI Voice & Accessibility – Accessibility Panel
 *  Floating panel cho phép user điều chỉnh:
 *  - Font size (small / medium / large)
 *  - High contrast mode
 *  - Text-to-Speech toggle
 *  - Keyboard navigation hints
 * ═══════════════════════════════════════════════════════════
 */

const FONT_SIZE_MAP = {
  small: { label: 'Nhỏ', rootSize: '13px', icon: '🔤' },
  medium: { label: 'Vừa', rootSize: '14px', icon: '🔤' },
  large: { label: 'Lớn', rootSize: '16px', icon: '🔠' },
};

export default function AccessibilityPanel({ user, showToast }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState({
    font_size: 'medium',
    high_contrast: false,
    enable_tts: false,
  });
  const [saving, setSaving] = useState(false);
  const panelRef = useRef(null);

  // Load settings from DB
  const loadSettings = useCallback(async () => {
    if (!user?.id || !api) return;
    try {
      const res = await api.users.getSettings(user.id);
      if (res.success && res.settings) {
        setSettings({
          font_size: res.settings.font_size || 'medium',
          high_contrast: !!res.settings.high_contrast,
          enable_tts: !!res.settings.enable_tts,
        });
        applyFontSize(res.settings.font_size || 'medium');
        applyHighContrast(!!res.settings.high_contrast);
      }
    } catch (e) {
      console.warn('[AccessibilityPanel] load error:', e);
    }
  }, [user?.id]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // Close panel on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        const toggleBtn = document.getElementById('accessibility-toggle-btn');
        if (toggleBtn && toggleBtn.contains(e.target)) return;
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Keyboard shortcut: Alt+A to toggle panel
  useEffect(() => {
    const handler = (e) => {
      if (e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const applyFontSize = (size) => {
    const config = FONT_SIZE_MAP[size] || FONT_SIZE_MAP.medium;
    document.documentElement.style.fontSize = config.rootSize;
  };

  const applyHighContrast = (enabled) => {
    if (enabled) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
  };

  const saveSettings = async (newSettings) => {
    if (!user?.id || !api || saving) return;
    setSaving(true);
    try {
      // Load current full settings to avoid overwriting other fields
      const current = await api.users.getSettings(user.id);
      const existing = current.success && current.settings ? current.settings : {};

      // Merge with camelCase keys matching the handler's expected format
      const payload = {
        theme: existing.theme || 'system',
        fontSize: newSettings.font_size || existing.font_size || 'medium',
        language: existing.language || 'vi',
        enableTts: newSettings.enable_tts ?? !!existing.enable_tts,
        enableNotifications: existing.enable_notifications ?? true,
        enableSound: existing.enable_sound ?? true,
        highContrast: newSettings.high_contrast ?? !!existing.high_contrast,
        aiTutorEnabled: existing.ai_tutor_enabled ?? true,
      };

      const res = await api.users.updateSettings(user.id, payload);
      if (res.success) {
        setSettings(newSettings);
        applyFontSize(newSettings.font_size);
        applyHighContrast(newSettings.high_contrast);
        showToast('✅ Đã lưu cài đặt accessibility', 'success');
      } else {
        showToast(res.message || 'Không lưu được cài đặt', 'error');
      }
    } catch (e) {
      showToast('Lỗi: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleFontSizeChange = (size) => {
    const next = { ...settings, font_size: size };
    saveSettings(next);
  };

  const handleToggle = (key) => {
    const next = { ...settings, [key]: !settings[key] };
    saveSettings(next);
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        id="accessibility-toggle-btn"
        onClick={() => setOpen(v => !v)}
        aria-label="Mở cài đặt Accessibility"
        aria-expanded={open}
        title="Accessibility (Alt+A)"
        style={{
          position: 'fixed', left: 16, bottom: 16, zIndex: 9998,
          width: 44, height: 44, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: open ? 'var(--accent)' : 'var(--bg-glass)',
          border: `2px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          color: open ? 'white' : 'var(--text-secondary)',
          cursor: 'pointer', fontSize: 20,
          transition: 'all 0.2s ease',
          boxShadow: open ? 'var(--shadow-accent)' : 'var(--shadow)',
          backdropFilter: 'blur(12px)',
        }}
      >
        ♿
      </button>

      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Cài đặt Accessibility"
          aria-modal="false"
          style={{
            position: 'fixed', left: 16, bottom: 72, zIndex: 9998,
            width: 320, background: 'var(--bg-secondary)',
            border: '1px solid var(--border)', borderRadius: 16,
            boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
            animation: 'slideUp 0.25s ease',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 18px', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>♿</span>
              <strong style={{ fontSize: 14 }}>Accessibility</strong>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Đóng panel"
              className="btn btn--ghost btn--sm"
            >✕</button>
          </div>

          {/* Settings */}
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Font Size */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>
                🔤 Cỡ chữ
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {Object.entries(FONT_SIZE_MAP).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => handleFontSizeChange(key)}
                    aria-pressed={settings.font_size === key}
                    aria-label={`Cỡ chữ ${cfg.label}`}
                    disabled={saving}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
                      border: settings.font_size === key ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: settings.font_size === key ? 'var(--bg-accent)' : 'var(--bg-glass)',
                      color: settings.font_size === key ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: 600, fontSize: 12, transition: 'all 0.15s ease',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}
                  >
                    <span style={{ fontSize: key === 'small' ? 14 : key === 'large' ? 20 : 16 }}>Aa</span>
                    <span>{cfg.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* High Contrast */}
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', borderRadius: 10,
                background: settings.high_contrast ? 'rgba(99,102,241,0.1)' : 'var(--bg-glass)',
                border: `1px solid ${settings.high_contrast ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}
              onClick={() => handleToggle('high_contrast')}
              role="switch"
              aria-checked={settings.high_contrast}
              aria-label="Chế độ độ tương phản cao"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggle('high_contrast'); } }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>🌗 Tương phản cao</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cho người khiếm thị</div>
              </div>
              <div style={{
                width: 42, height: 24, borderRadius: 12,
                background: settings.high_contrast ? 'var(--accent)' : 'var(--bg-glass)',
                border: `2px solid ${settings.high_contrast ? 'var(--accent)' : 'var(--border)'}`,
                position: 'relative', transition: 'all 0.2s ease',
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: 'white', position: 'absolute', top: 1,
                  left: settings.high_contrast ? 20 : 1,
                  transition: 'left 0.2s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </div>
            </div>

            {/* TTS Toggle */}
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', borderRadius: 10,
                background: settings.enable_tts ? 'rgba(34,197,94,0.1)' : 'var(--bg-glass)',
                border: `1px solid ${settings.enable_tts ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}
              onClick={() => handleToggle('enable_tts')}
              role="switch"
              aria-checked={settings.enable_tts}
              aria-label="Bật đọc câu hỏi bằng giọng nói"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggle('enable_tts'); } }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>🔊 Đọc câu hỏi (TTS)</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Web Speech API – tiếng Việt</div>
              </div>
              <div style={{
                width: 42, height: 24, borderRadius: 12,
                background: settings.enable_tts ? 'var(--success)' : 'var(--bg-glass)',
                border: `2px solid ${settings.enable_tts ? 'var(--success)' : 'var(--border)'}`,
                position: 'relative', transition: 'all 0.2s ease',
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: 'white', position: 'absolute', top: 1,
                  left: settings.enable_tts ? 20 : 1,
                  transition: 'left 0.2s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </div>
            </div>

            {/* Keyboard Shortcuts */}
            <div style={{
              padding: '10px 14px', borderRadius: 10,
              background: 'var(--bg-glass)', border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
                ⌨️ Phím tắt
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  ['Alt + A', 'Mở Accessibility'],
                  ['Alt + S', 'Đọc câu hỏi → Nói đáp án'],
                  ['Tab / Shift+Tab', 'Chuyển giữa các phần tử'],
                  ['Enter / Space', 'Chọn đáp án / xác nhận'],
                  ['← →', 'Câu trước / Câu sau'],
                ].map(([key, desc]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <kbd style={{
                      background: 'var(--bg-glass-hover)', padding: '2px 6px', borderRadius: 4,
                      border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 10,
                      color: 'var(--text-primary)',
                    }}>{key}</kbd>
                    <span style={{ color: 'var(--text-muted)' }}>{desc}</span>
                  </div>
                ))}
              </div>

              {/* Voice Commands */}
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  🎤 Lệnh giọng nói (khi mic bật)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {[
                    ['"A", "B", "chọn C"', 'Chọn đáp án'],
                    ['"câu tiếp"', 'Sang câu kế'],
                    ['"câu trước"', 'Quay lại'],
                    ['"nộp bài"', 'Nộp bài thi'],
                  ].map(([voice, action]) => (
                    <div key={voice} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                      <span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>{voice}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '10px 18px', borderTop: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text-muted)', textAlign: 'center',
          }}>
            {saving ? '⏳ Đang lưu...' : '💡 Cài đặt được lưu tự động cho lần sau'}
          </div>
        </div>
      )}
    </>
  );
}
