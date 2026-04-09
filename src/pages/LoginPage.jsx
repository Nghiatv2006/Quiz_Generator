import React, { useState } from 'react';

export default function LoginPage({ onLogin, isElectron }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    await onLogin(email, password);
    setLoading(false);
  };

  const quickLogin = (qEmail, qPassword) => {
    setEmail(qEmail);
    setPassword(qPassword);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__logo">
          <span className="login-card__logo-icon">🧠</span>
          <h2>Quiz Generator V2</h2>
          <p>Hệ thống thi trắc nghiệm tích hợp AI</p>
        </div>

        {!isElectron && (
          <div style={{
            background: 'var(--warning-bg)', border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 20,
            fontSize: 12, color: 'var(--warning)', lineHeight: 1.5
          }}>
            ⚠️ Bạn đang mở trên Browser. Hãy chạy <strong>npm run dev</strong> để mở trong Electron và dùng được đầy đủ tính năng.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">
              📧 Email<span className="form-required">*</span>
            </label>
            <input
              type="email"
              className="form-input"
              placeholder="admin@quizgen.vn"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              🔒 Mật khẩu<span className="form-required">*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="Nhập mật khẩu"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ paddingRight: '45px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px',
                  color: 'var(--text-muted)'
                }}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn--primary btn--lg w-full mt-8" disabled={loading}>
            {loading ? (
              <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></span> Đang đăng nhập...</>
            ) : (
              <>🚀 Đăng nhập</>
            )}
          </button>
        </form>

        {/* Quick login buttons */}
        <div className="mt-24" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <p className="text-sm text-muted text-center mb-16">🔑 Đăng nhập nhanh:</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button type="button" className="btn btn--secondary btn--sm w-full"
              onClick={() => quickLogin('admin@quizgen.vn', 'admin123')}>
              👑 Admin
            </button>
            <button type="button" className="btn btn--secondary btn--sm w-full"
              onClick={() => quickLogin('sv01@quizgen.vn', 'user123')}>
              🎓 Student 1
            </button>
            <button type="button" className="btn btn--secondary btn--sm w-full"
              onClick={() => quickLogin('sv02@quizgen.vn', 'user123')}>
              🎓 Student 2
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
