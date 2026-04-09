import React, { useState } from 'react';
import DashboardPage from '../pages/DashboardPage.jsx';
import TopicsPage from '../pages/TopicsPage.jsx';
import QuestionsPage from '../pages/QuestionsPage.jsx';
import ExamsPage from '../pages/ExamsPage.jsx';
import ExamListPage from '../pages/ExamListPage.jsx';
import ExamResultPage from '../pages/ExamResultPage.jsx';
import AIGeneratePage from '../pages/AIGeneratePage.jsx';
import AIChatPage from '../pages/AIChatPage.jsx';
import HistoryPage from '../pages/HistoryPage.jsx';
import LeaderboardPage from '../pages/LeaderboardPage.jsx';
import CheatingReportsPage from '../pages/CheatingReportsPage.jsx';
import UsersPage from '../pages/UsersPage.jsx';
import SettingsPage from '../pages/SettingsPage.jsx';
import GamificationPage from '../pages/GamificationPage.jsx';
import logoImg from '../assets/logo.png';

const api = typeof window !== 'undefined' ? window['electronAPI'] : null;

const MENU = [
  { section: 'Tổng quan' },
  { key: 'dashboard', label: 'Dashboard', icon: '📊', roles: ['admin', 'teacher', 'student'] },

  { section: 'Quản lý' },
  { key: 'users', label: 'Người dùng', icon: '👥', roles: ['admin'] },
  { key: 'topics', label: 'Chủ đề', icon: '📁', roles: ['admin', 'teacher'] },
  { key: 'questions', label: 'Câu hỏi', icon: '❓', roles: ['admin', 'teacher'] },
  { key: 'exams', label: 'Bài thi', icon: '📝', roles: ['admin', 'teacher'] },
  { key: 'exam-take', label: 'Vào thi', icon: '🎯', roles: ['student'] },

  { section: 'Hỗ trợ Học tập' },
  { key: 'ai-generate', label: 'AI Sinh đề', icon: '🤖', roles: ['admin', 'teacher'] },
  { key: 'ai-chat', label: 'AI Tutor', icon: '💬', roles: ['student'] },

  { section: 'Không gian Sinh viên' },
  { key: 'leaderboard', label: 'Bảng xếp hạng', icon: '🏆', roles: ['student'] },
  { key: 'gamification', label: 'Gamification', icon: '🎮', roles: ['student'] },
  { key: 'history', label: 'Lịch sử thi', icon: '📈', roles: ['student'] },

  { section: 'Hệ thống' },
  { key: 'settings', label: 'Cài đặt', icon: '⚙️', roles: ['admin', 'teacher', 'student'] },
  { key: 'cheating-reports', label: 'Anti-cheat Reports', icon: '🛡️', roles: ['admin'] },
];

export default function MainLayout({ user, onLogout, showToast }) {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pageParams, setPageParams] = useState({}); // for passing data between pages

  const role = (user?.role || 'student').toLowerCase();
  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';

  const handleMinimize = () => api?.window?.minimize();
  const handleMaximize = () => api?.window?.maximize();
  const handleClose = () => api?.window?.close();

  const canAccessPage = (pageKey) => {
    const menuItem = MENU.find(i => i.key === pageKey);
    if (!menuItem || !menuItem.roles) return true;
    return menuItem.roles.includes(role);
  };

  const navigateTo = (page, params = {}) => {
    if (!canAccessPage(page) && page !== 'exam-result') {
      showToast('Bạn không có quyền truy cập chức năng này', 'warning');
      return;
    }
    setCurrentPage(page);
    setPageParams(params);
  };

  const renderPage = () => {
    if (!canAccessPage(currentPage) && currentPage !== 'exam-result') {
      return (
        <div className="page">
          <div className="empty-state">
            <div className="empty-state__icon">🔒</div>
            <div className="empty-state__title">Không có quyền truy cập</div>
            <div className="empty-state__text">Vui lòng liên hệ quản trị viên để được cấp quyền.</div>
          </div>
        </div>
      );
    }

    switch (currentPage) {
      case 'dashboard': return <DashboardPage user={user} showToast={showToast} navigateTo={navigateTo} />;
      case 'users': return <UsersPage user={user} showToast={showToast} />;
      case 'topics': return <TopicsPage user={user} showToast={showToast} />;
      case 'questions': return <QuestionsPage user={user} showToast={showToast} />;
      case 'exams': return <ExamsPage user={user} showToast={showToast} />;
      case 'exam-take': return <ExamListPage user={user} showToast={showToast} />;
      case 'exam-result': return <ExamResultPage attemptId={pageParams.attemptId} user={user} showToast={showToast} onBack={() => navigateTo('history')} />;
      case 'ai-generate': return <AIGeneratePage user={user} showToast={showToast} />;
      case 'ai-chat': return <AIChatPage user={user} showToast={showToast} />;
      case 'leaderboard': return <LeaderboardPage user={user} showToast={showToast} />;
      case 'gamification': return <GamificationPage user={user} showToast={showToast} />;
      case 'history': return <HistoryPage user={user} showToast={showToast} navigateTo={navigateTo} />;
      case 'settings': return <SettingsPage user={user} showToast={showToast} />;
      case 'cheating-reports': return <CheatingReportsPage user={user} showToast={showToast} />;
      default: return (
        <div className="page">
          <div className="empty-state">
            <div className="empty-state__icon">🚧</div>
            <div className="empty-state__title">Đang phát triển</div>
            <div className="empty-state__text">Tính năng này đang được xây dựng.</div>
          </div>
        </div>
      );
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
  };

  return (
    <>
      {/* Custom Titlebar */}
      <div className="titlebar">
        <div className="titlebar__title">QUIZ GENERATOR V2</div>
        <div className="titlebar__controls">
          <button className="titlebar__btn" onClick={handleMinimize}>—</button>
          <button className="titlebar__btn" onClick={handleMaximize}>□</button>
          <button className="titlebar__btn titlebar__btn--close" onClick={handleClose}>✕</button>
        </div>
      </div>

      {/* Feature 9: Skip-to-content link for screen readers */}
      <a href="#main-content" className="skip-link">Chuyển đến nội dung chính</a>

      {/* Main Layout */}
      <div className="app-layout" role="application">
        {/* Sidebar */}
        <aside className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''}`} role="navigation" aria-label="Menu chính">
          {/* Logo */}
          <div className="sidebar__logo" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={{ cursor: 'pointer' }}>
            <div className="sidebar__logo-icon" style={{ padding: 0, overflow: 'hidden', background: 'transparent' }}>
              <img src={logoImg} alt="Quiz Gen Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            {!sidebarCollapsed && (
              <div className="sidebar__logo-text">
                <h1>QUIZ GEN 2</h1>
                <span>v2.0 • AI Powered</span>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="sidebar__nav">
            {MENU.map((item, i) => {
              if (item.section) {
                if (sidebarCollapsed) return null;
                
                // Check if this section has any visible items for the current role
                let hasVisibleItems = false;
                for (let j = i + 1; j < MENU.length; j++) {
                  if (MENU[j].section) break; // Next section starts
                  if (!MENU[j].roles || MENU[j].roles.includes(role)) {
                    hasVisibleItems = true;
                    break;
                  }
                }
                
                if (!hasVisibleItems) return null;
                return <div key={i} className="sidebar__section-label">{item.section}</div>;
              }

              if (item.roles && !item.roles.includes(role)) return null;

              return (
                <div
                  key={item.key}
                  className={`sidebar__item ${currentPage === item.key ? 'sidebar__item--active' : ''}`}
                  onClick={() => navigateTo(item.key)}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <span className="sidebar__item-icon" aria-hidden="true">{item.icon}</span>
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </div>
              );
            })}
          </nav>

          {/* User */}
          <div className="sidebar__user">
            <div className="sidebar__avatar">{getInitials(user?.fullName)}</div>
            {!sidebarCollapsed && (
              <div className="sidebar__user-info" style={{ flex: 1 }}>
                <div className="sidebar__user-name">{user?.fullName}</div>
                <div className="sidebar__user-role">
                  {isAdmin ? 'admin' : isTeacher ? 'teacher' : isStudent ? 'student' : user?.role}
                  {isStudent ? ` • Lv.${user?.level || 1}` : ''}
                </div>
              </div>
            )}
            {!sidebarCollapsed && (
              <button className="btn btn--ghost btn--sm" onClick={onLogout} title="Đăng xuất">
                🚪
              </button>
            )}
          </div>
        </aside>

        {/* Page Content */}
        <main className="main-content" id="main-content" role="main" aria-label="Nội dung chính">
          {renderPage()}
        </main>
      </div>
    </>
  );
}

