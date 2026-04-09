import React, { useState, useEffect, useCallback, useRef } from 'react';

const api = typeof window !== 'undefined' ? window['electronAPI'] : null;

const ICONS = ['📚','📐','💻','🧪','📊','🎨','🌍','⚙️','🧠','📝','🔬','🎯','🏛️','⚡','🌱','🔢'];
const COLORS = ['#6366F1','#8B5CF6','#EC4899','#EF4444','#F59E0B','#10B981','#3B82F6','#14B8A6'];
const PAGE_SIZE = 20;

const DEFAULT_FORM = { name: '', description: '', icon: '📚', color: '#6366F1' };

export default function TopicsPage({ user, showToast }) {
  const [topics, setTopics]         = useState([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [editTopic, setEditTopic]   = useState(null);
  const [form, setForm]             = useState(DEFAULT_FORM);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(null);
  const searchTimer = useRef(null);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const canManage  = ['admin', 'teacher'].includes(user?.role?.toLowerCase());

  // ── Load danh sách ────────────────────────────────────────────
  const loadTopics = useCallback(async (pg = page, q = search) => {
    if (!api) return;
    setLoading(true);
    try {
      const res = await api.topics.getAll({ search: q, page: pg, limit: PAGE_SIZE });
      if (res.success) {
        setTopics(res.topics || []);
        setTotal(res.total || 0);
      } else {
        showToast(res.message || 'Không thể tải danh sách chủ đề', 'error');
      }
    } catch (err) {
      showToast('Lỗi kết nối: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { loadTopics(1, ''); }, []);

  const handleSearchChange = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    const delay = val === '' ? 0 : 400;
    searchTimer.current = setTimeout(() => {
      setPage(1);
      loadTopics(1, val);
    }, delay);
  };

  const handleSearchEnter = (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimer.current);
      setPage(1);
      loadTopics(1, search);
    }
  };

  const goToPage = (pg) => {
    const p = Math.max(1, Math.min(totalPages, pg));
    setPage(p);
    loadTopics(p, search);
  };

  const openCreate = () => {
    setEditTopic(null);
    setForm(DEFAULT_FORM);
    setShowModal(true);
  };

  const openEdit = (t) => {
    setEditTopic(t);
    setForm({
      name:        t.name        || '',
      description: t.description || '',
      icon:        t.icon        || '📚',
      color:       t.color       || '#6366F1',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
    setEditTopic(null);
  };

  const handleSave = async () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      showToast('Vui lòng định danh chủ đề', 'error');
      return;
    }
    if (trimmedName.length > 100) {
      showToast('Tên chủ đề không được vượt quá 100 ký tự', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editTopic) {
        const res = await api.topics.update(
          editTopic.id,
          { ...form, name: trimmedName },
          { id: user.id, role: user.role }
        );
        if (res.success) {
          showToast('✨ Cơ sở dữ liệu chủ đề đã được cập nhật!', 'success');
          closeModal();
          loadTopics(page, search);
        } else {
          showToast(res.message || 'Cập nhật thất bại', 'error');
        }
      } else {
        const res = await api.topics.create(
          { ...form, name: trimmedName, createdBy: user.id },
          { id: user.id, role: user.role }
        );
        if (res.success) {
          showToast('🌟 Đã kiến tạo chủ đề mới!', 'success');
          closeModal();
          setPage(1);
          loadTopics(1, search);
        } else {
          showToast(res.message || 'Khởi tạo thất bại', 'error');
        }
      }
    } catch (err) {
      showToast('Lỗi hệ thống: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (topic) => {
    if (!confirm(
      `CẢNH BÁO: Phá hủy chủ đề "${topic.name}"?\n\nDữ liệu sẽ bị xóa vĩnh viễn khỏi hệ thống.`
    )) return;

    setDeleting(topic.id);
    try {
      const res = await api.topics.delete(topic.id, { id: user.id, role: user.role });
      if (res.success) {
        showToast(`💥 Đã tiêu hủy chủ đề "${topic.name}"`, 'success');
        const newTotal    = total - 1;
        const newTotalPgs = Math.ceil(newTotal / PAGE_SIZE);
        const newPage     = page > newTotalPgs && newTotalPgs > 0 ? newTotalPgs : page;
        setPage(newPage);
        loadTopics(newPage, search);
      } else {
        showToast(res.message || 'Hủy diệt thất bại', 'error');
      }
    } catch (err) {
      showToast('Lỗi mạng: ' + err.message, 'error');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="page" style={{ padding: '32px', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      {/* Premium Hero Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(8,145,178,1) 0%, rgba(13,148,136,1) 100%)',
        borderRadius: '24px', padding: '32px', marginBottom: '32px',
        border: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
        position: 'relative', overflow: 'hidden'
      }}>
        {/* Decorative elements */}
        <div style={{ position: 'absolute', right: '-10%', top: '-20%', width: '300px', height: '300px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', filter: 'blur(40px)' }}></div>
        
        <div style={{ position: 'relative', zIndex: 2 }}>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: 'white', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '36px' }}>📁</span> Thư Viện Kiến Thức
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.8)' }}>
            Nơi phân loại, quy hoạch và quản lý cấu trúc môn học/chuyên mục của toàn nền tảng.
          </p>
        </div>
        
        {canManage && (
          <div style={{ position: 'relative', zIndex: 2 }}>
            <button 
              onClick={openCreate}
              style={{
                background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)',
                color: 'white', padding: '16px 24px', borderRadius: '16px', fontSize: '15px', fontWeight: 800,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)', backdropFilter: 'blur(10px)', transition: 'all 0.2s'
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#0f766e'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'white'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              <span style={{ fontSize: '20px' }}>✨</span> Khởi Tạo Chuyên Mục
            </button>
          </div>
        )}
      </div>

      {/* Modern Search & Action Bar */}
      <div style={{ 
        display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap',
        background: 'var(--bg-secondary)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border)'
      }}>
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={{ position: 'absolute', left: '16px', fontSize: '18px', color: 'var(--text-muted)' }}>🔍</span>
          <input
            style={{ 
              width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', 
              color: 'var(--text-primary)', padding: '12px 16px 12px 48px', borderRadius: '12px',
              fontSize: '15px', outline: 'none', transition: 'border 0.2s'
            }}
            placeholder="Tìm kiếm danh mục theo tên hoặc mô tả định danh..."
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
            onKeyDown={handleSearchEnter}
          />
          {search && (
            <button onClick={() => handleSearchChange('')} style={{
              position: 'absolute', right: '16px', background: 'rgba(255,255,255,0.1)', border: 'none',
              color: 'var(--text-primary)', width: '24px', height: '24px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              fontSize: '12px', transition: 'background 0.2s'
            }} onMouseOver={e=>e.currentTarget.style.background='rgba(255,255,255,0.2)'} onMouseOut={e=>e.currentTarget.style.background='rgba(255,255,255,0.1)'}>✕</button>
          )}
        </div>
        <button 
          style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border)', color: 'var(--text-primary)',
            padding: '0 24px', borderRadius: '12px', fontSize: '15px', fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
            transition: 'background 0.2s'
          }}
          onClick={() => { setPage(1); loadTopics(1, search); }}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onMouseOut={e => e.currentTarget.style.background = 'var(--bg-glass)'}
        >
          🔄 Làm mới
        </button>
      </div>

      {/* Content Grid */}
      {loading ? (
        <div className="loading-page" style={{ height: '400px' }}><div className="spinner" /></div>
      ) : topics.length === 0 ? (
        <div style={{ background: 'var(--bg-secondary)', padding: '60px', borderRadius: '24px', textAlign: 'center', border: '1px dashed var(--border-accent)' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>🛸</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Không có chuyên mục nào khả dụng</div>
          <div style={{ color: 'var(--text-muted)', marginTop: '8px', marginBottom: '24px' }}>Hãy đảm bảo thuật toán tìm kiếm của bạn chính xác hoặc tạo một khối kiến thức mới.</div>
          {!search && canManage && (
            <button className="btn btn--primary" onClick={openCreate} style={{ padding: '12px 32px', borderRadius: '12px' }}>✨ Tạo Phân Khu Mới</button>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
            {topics.map(t => (
              <TopicCard
                key={t.id}
                topic={t}
                canManage={canManage}
                isDeleting={deleting === t.id}
                onEdit={() => openEdit(t)}
                onDelete={() => handleDelete(t)}
              />
            ))}
          </div>

          {/* Futuristic Pagination */}
          {totalPages > 1 && (
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '32px', background: 'var(--bg-glass)', padding: '16px 24px', borderRadius: '16px', border: '1px solid var(--border)' }}>
               <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 500 }}>
                 Đang hiển thị chương <strong style={{ color: 'var(--text-primary)' }}>{page}</strong> trên tổng số <strong style={{ color: 'var(--accent)' }}>{totalPages}</strong>
               </span>
               <div style={{ display: 'flex', gap: '8px' }}>
                 <button onClick={() => goToPage(1)} disabled={page === 1} style={{ background: page===1?'transparent':'rgba(255,255,255,0.05)', color: page===1?'var(--text-muted)':'var(--text-primary)', border: '1px solid var(--border)', width: '40px', height: '40px', borderRadius: '10px', cursor: page===1?'default':'pointer' }}>«</button>
                 <button onClick={() => goToPage(page-1)} disabled={page === 1} style={{ background: page===1?'transparent':'rgba(255,255,255,0.05)', color: page===1?'var(--text-muted)':'var(--text-primary)', border: '1px solid var(--border)', width: '40px', height: '40px', borderRadius: '10px', cursor: page===1?'default':'pointer' }}>‹</button>
                 {(() => {
                   const start = Math.max(1, Math.min(page-2, totalPages-4));
                   return Array.from({ length: Math.min(5, totalPages) }, (_, i) => start+i).map(pg => (
                     <button key={pg} onClick={() => goToPage(pg)} style={{
                       background: pg === page ? 'var(--gradient-accent)' : 'rgba(255,255,255,0.05)',
                       color: pg === page ? '#fff' : 'var(--text-primary)',
                       border: pg === page ? 'none' : '1px solid var(--border)',
                       width: '40px', height: '40px', borderRadius: '10px', fontWeight: pg === page ? 800 : 500, cursor: 'pointer',
                       boxShadow: pg === page ? '0 4px 12px rgba(99,102,241,0.4)' : 'none'
                     }}>{pg}</button>
                   ));
                 })()}
                 <button onClick={() => goToPage(page+1)} disabled={page === totalPages} style={{ background: page===totalPages?'transparent':'rgba(255,255,255,0.05)', color: page===totalPages?'var(--text-muted)':'var(--text-primary)', border: '1px solid var(--border)', width: '40px', height: '40px', borderRadius: '10px', cursor: page===totalPages?'default':'pointer' }}>›</button>
                 <button onClick={() => goToPage(totalPages)} disabled={page === totalPages} style={{ background: page===totalPages?'transparent':'rgba(255,255,255,0.05)', color: page===totalPages?'var(--text-muted)':'var(--text-primary)', border: '1px solid var(--border)', width: '40px', height: '40px', borderRadius: '10px', cursor: page===totalPages?'default':'pointer' }}>»</button>
               </div>
             </div>
          )}
        </>
      )}

      {/* Modern Modal Sửa/Tạo */}
      {showModal && (
        <TopicModal
          editTopic={editTopic}
          form={form}
          setForm={setForm}
          saving={saving}
          onSave={handleSave}
          onClose={closeModal}
          ICONS={ICONS}
          COLORS={COLORS}
        />
      )}
    </div>
  );
}

// ── Floating Topic Card ──────────────────────────────────────────────────
function TopicCard({ topic: t, canManage, isDeleting, onEdit, onDelete }) {
  const tColor = t.color || '#6366F1';
  
  return (
    <div
      style={{
        background: 'var(--bg-glass)',
        border: '1px solid var(--border)',
        borderRadius: '20px',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: isDeleting ? 0.5 : 1,
        pointerEvents: isDeleting ? 'none' : 'auto',
        display: 'flex', flexDirection: 'column'
      }}
      onMouseOver={(e) => { 
        e.currentTarget.style.transform = 'translateY(-4px)'; 
        e.currentTarget.style.boxShadow = `0 12px 32px ${tColor}30`;
        e.currentTarget.style.borderColor = `${tColor}50`;
      }}
      onMouseOut={(e) => { 
        e.currentTarget.style.transform = 'translateY(0)'; 
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      {/* Top Accent Line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: tColor }}></div>
      {/* Glow Blur Effect */}
      <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: tColor, opacity: 0.1, borderRadius: '50%', filter: 'blur(30px)' }}></div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px', position: 'relative', zIndex: 2 }}>
        <div style={{ 
          width: '56px', height: '56px', borderRadius: '16px', 
          background: `linear-gradient(135deg, ${tColor}30, ${tColor}10)`,
          border: `1px solid ${tColor}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '28px', flexShrink: 0
        }}>
          {t.icon || '📚'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', wordBreak: 'break-word', lineHeight: 1.3, marginBottom: '4px' }}>
            {t.name}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Tạo bởi: {t.creator_name || 'Hệ thống'}</div>
        </div>
      </div>

      <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, flex: 1, marginBottom: '24px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {t.description || <span style={{ fontStyle: 'italic', opacity: 0.5 }}>Chưa có chuỗi mô tả định dạng nào được cung cấp.</span>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>❓</span> {t.question_count ?? 0} Câu
          </div>
          <div style={{ background: 'rgba(168,85,247,0.1)', color: '#d8b4fe', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>📝</span> {t.exam_count ?? 0} Đề
          </div>
        </div>

        {canManage && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onEdit}
              style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--text-primary)', width: '36px', height: '36px', borderRadius: '10px', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s' }}
              title="Cấu hình hạng mục"
              onMouseOver={e=>e.currentTarget.style.background='rgba(59,130,246,0.2)'}
              onMouseOut={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'}
            >✏️</button>
            <button
              onClick={onDelete}
              title={
                (t.question_count > 0 || t.exam_count > 0)
                  ? `Khối này đang chứa ${t.question_count} ngự liệu và ${t.exam_count} phân rã đề thi rễ nhánh, nên thanh toán trước.`
                  : 'Tiêu hủy hạng mục'
              }
              style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#ef4444', width: '36px', height: '36px', borderRadius: '10px', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s' }}
              onMouseOver={e=>e.currentTarget.style.background='rgba(239,68,68,0.2)'}
              onMouseOut={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'}
            >
              {isDeleting ? '⏳' : '🗑️'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Glassmorphism Topic Modal ─────────────────────────────────────────────────
function TopicModal({ editTopic, form, setForm, saving, onSave, onClose, ICONS, COLORS }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && !saving) {
      onSave();
    }
    if (e.key === 'Escape') onClose();
  };

  const currentColor = form.color || '#6366F1';

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={onClose} onKeyDown={handleKeyDown}>
      <div style={{ background: '#111827', width: '560px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        
        {/* Dynamic Header */}
        <div style={{ background: `linear-gradient(135deg, ${currentColor}55, ${currentColor}10)`, padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
           <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 2 }}>
            {editTopic ? '✏️ Cấu Hình Chuyên Mục' : '✨ Kiến Tạo Không Gian Mới'}
          </h3>
          <button onClick={onClose} disabled={saving} style={{ background: 'rgba(0,0,0,0.3)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2 }}>✕</button>
        </div>

        <div style={{ padding: '32px' }}>
          {/* Tên */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
              Danh xưng định dạng <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)', color: 'white', padding: '14px 16px', borderRadius: '12px', fontSize: '15px', outline: 'none', transition: 'border 0.2s', fontWeight: 600 }}
              value={form.name}
              maxLength={100}
              autoFocus
              onChange={e => setForm({ ...form, name: e.target.value })}
              onFocus={e => e.target.style.borderColor = currentColor}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              placeholder="Ví dụ: Cấu trúc Dữ liệu cơ sở..."
              disabled={saving}
            />
          </div>

          {/* Mô tả */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Mô tả tham chiếu</label>
            <textarea
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)', color: 'white', padding: '14px 16px', borderRadius: '12px', fontSize: '14px', outline: 'none', transition: 'border 0.2s', resize: 'vertical' }}
              rows={3}
              value={form.description}
              maxLength={500}
              onChange={e => setForm({ ...form, description: e.target.value })}
              onFocus={e => e.target.style.borderColor = currentColor}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              placeholder="Khắc họa ngắn về không gian khối lý thuyết này..."
              disabled={saving}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
            {/* Icon picker */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Biểu trưng (Icon)</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', userSelect: 'none', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '16px' }}>
                {ICONS.map(ic => (
                  <div
                    key={ic}
                    onClick={() => !saving && setForm({ ...form, icon: ic })}
                    style={{
                      cursor: saving ? 'default' : 'pointer',
                      fontSize: '22px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px',
                      background: form.icon === ic ? `${currentColor}30` : 'transparent',
                      border: `1px solid ${form.icon === ic ? currentColor : 'transparent'}`,
                      transition: 'all 0.15s',
                    }}
                    title={ic}
                  >{ic}</div>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Bước sóng quang phổ</label>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '16px' }}>
                {COLORS.map(c => (
                  <div
                    key={c}
                    onClick={() => !saving && setForm({ ...form, color: c })}
                    style={{
                      width: '32px', height: '32px', borderRadius: '50%', background: c,
                      cursor: saving ? 'default' : 'pointer',
                      border: form.color === c ? '2px solid white' : '2px solid transparent',
                      boxShadow: form.color === c ? `0 0 12px ${c}` : 'none',
                      transition: 'all 0.15s', transform: form.color === c ? 'scale(1.1)' : 'scale(1)'
                    }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Visual Preview */}
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Chỉnh lý đồ họa</label>
          <div style={{
            padding: '20px', borderRadius: '16px',
            border: `1px solid ${currentColor}50`,
            background: `linear-gradient(135deg, ${currentColor}20, rgba(0,0,0,0.2))`,
            display: 'flex', alignItems: 'center', gap: '16px',
            boxShadow: `0 10px 30px ${currentColor}20`
          }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `linear-gradient(135deg, ${currentColor}40, ${currentColor}10)`, border: `1px solid ${currentColor}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
              {form.icon || '📚'}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '16px', color: 'white', marginBottom: '4px' }}>{form.name || 'Hạng mục Vô Tanh'}</div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                {form.description || 'Chưa có thông số trích xuất mô tả được định vị tại đây.'}
              </div>
            </div>
          </div>
        </div>

        {/* Action Blocks */}
        <div style={{ padding: '20px 32px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '16px' }}>
          <button 
            style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}
            onClick={onClose} disabled={saving}>
            Đình Chỉ Lệnh
          </button>
          <button 
            style={{ flex: 2, padding: '14px', borderRadius: '12px', background: currentColor, border: 'none', color: 'white', fontWeight: 800, cursor: 'pointer', boxShadow: `0 4px 12px ${currentColor}60`, fontSize: '14px', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
            onClick={onSave} disabled={saving}>
            {saving ? '⏳ TRUY SUẤT HỆ THỐNG...' : (editTopic ? '💾 GHI NHẬN BIẾN ĐỔI' : '🚀 KHAI SINH KHÔNG GIAN')}
          </button>
        </div>
      </div>
    </div>
  );
}
