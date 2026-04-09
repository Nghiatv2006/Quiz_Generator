import React, { useState, useEffect } from 'react';
import LoginPage from './pages/LoginPage.jsx';
import MainLayout from './layouts/MainLayout.jsx';
import AIChatWidget from './pages/AIChatWidget.jsx';
import AccessibilityPanel from './pages/AccessibilityPanel.jsx';

// Lấy Electron API (null nếu chạy trên browser)
const api = typeof window !== 'undefined' ? window['electronAPI'] : null;

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);

  // Auto verify token on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && api) {
      api.auth.verify(token).then(res => {
        if (res.success) setUser(res.user);
        setLoading(false);
      }).catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const handleLogin = async (email, password) => {
    if (!api) {
      showToast('⚠️ Vui lòng mở qua Electron (npm run dev). Không thể chạy trên browser.', 'warning');
      return;
    }
    try {
      const res = await api.auth.login({ email, password });
      if (res.success) {
        localStorage.setItem('token', res.token);
        setUser(res.user);
        showToast(`Chào mừng ${res.user.fullName}!`, 'success');
      } else {
        showToast(res.message || 'Đăng nhập thất bại', 'error');
      }
    } catch (err) {
      showToast('Lỗi kết nối: ' + err.message, 'error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    showToast('Đã đăng xuất', 'info');
  };

  if (loading) {
    return (
      <div className="login-page">
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto' }}></div>
          <p className="mt-16 text-muted">Đang khởi tạo...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast--${t.type}`}>
              <span>{t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : t.type === 'warning' ? '⚠️' : 'ℹ️'}</span>
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Warning banner khi chạy trên browser */}
      {!api && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
          background: 'linear-gradient(90deg, #f59e0b, #d97706)',
          color: '#000', padding: '8px 16px', textAlign: 'center',
          fontSize: '13px', fontWeight: 600
        }}>
          ⚠️ Đang chạy trên Browser. Hãy dùng <code style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: 4 }}>npm run dev</code> để mở trong Electron.
        </div>
      )}

      {!user ? (
        <LoginPage onLogin={handleLogin} isElectron={!!api} />
      ) : (
        <>
          <MainLayout user={user} onLogout={handleLogout} showToast={showToast} />
          <AIChatWidget user={user} showToast={showToast} />
          <AccessibilityPanel user={user} showToast={showToast} />
        </>
      )}
    </>
  );
}
