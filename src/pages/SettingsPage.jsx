import React, { useEffect, useState, useCallback } from 'react';

const api = typeof window !== 'undefined' ? window['electronAPI'] : null;

// ── Sub-components ──────────────────────────────────────────────
function StatusDot({ online }) {
  return (
    <span style={{
      display: 'inline-block', width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
      background: online ? '#22c55e' : '#ef4444',
      boxShadow: online ? '0 0 10px #22c55e88' : '0 0 10px #ef444488',
      marginRight: 6,
    }} />
  );
}

function ProviderCard({ id, icon, name, subtitle, badge, isSelected, onSelect, onClick, children }) {
  return (
    <div onClick={onClick || (() => onSelect(id))} style={{
      border: `1px solid ${isSelected ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.05)'}`,
      borderRadius: '24px', padding: '24px',
      background: isSelected ? 'rgba(139,92,246,0.1)' : 'var(--bg-glass)',
      cursor: 'pointer', transition: 'all 0.2s', flex: 1, minWidth: 300,
      boxShadow: isSelected ? '0 10px 30px rgba(139,92,246,0.2)' : '0 4px 20px rgba(0,0,0,0.1)',
      position: 'relative', overflow: 'hidden'
    }}
    onMouseOver={e => e.currentTarget.style.transform = isSelected ? 'none' : 'translateY(-4px)'}
    onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
    >
      {isSelected && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #8b5cf6, #d946ef)' }} />
      )}
      
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8 }}>
        {isSelected && (
          <span style={{
            fontSize: 12, fontWeight: 800, padding: '4px 12px',
            borderRadius: 20, background: 'linear-gradient(135deg, #8b5cf6, #d946ef)', color: '#fff',
            boxShadow: '0 4px 12px rgba(139,92,246,0.4)'
          }}>NHÀ CUNG CẤP CHÍNH</span>
        )}
        {badge && !isSelected && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '4px 10px',
            borderRadius: 20, background: 'rgba(245,158,11,0.2)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)'
          }}>{badge}</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, position: 'relative' }}>
        <div style={{
          width: '24px', height: '24px', borderRadius: '50%', background: isSelected ? '#a855f7' : 'rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          border: `2px solid ${isSelected ? '#d8b4fe' : 'rgba(255,255,255,0.3)'}`
        }}>
          {isSelected && <div style={{ width: '10px', height: '10px', background: 'white', borderRadius: '50%' }} />}
        </div>
        <div style={{ fontSize: '40px', filter: isSelected ? 'drop-shadow(0 4px 8px rgba(139,92,246,0.5))' : 'none' }}>{icon}</div>
        <div>
          <div style={{ fontWeight: 900, fontSize: '20px', color: 'white', marginBottom: '4px' }}>{name}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{subtitle}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 700, color: color || 'var(--text-primary)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function Pro({ text, ok = true }) {
  return (
    <div style={{ fontSize: '13px', color: ok ? '#4ade80' : 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
      <span style={{ fontSize: '14px', flexShrink: 0 }}>{ok ? '✓' : '—'}</span> <span>{text}</span>
    </div>
  );
}

function LogicRow({ ok, label, okText, failText }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 2fr', gap: '16px', padding: '12px 16px', background: ok ? 'rgba(34,197,94,0.03)' : 'rgba(239,68,68,0.03)', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
      <div style={{ color: 'white', fontSize: '14px', fontWeight: 700, opacity: 0.9 }}>{label}</div>
      <div style={{ color: ok ? '#4ade80' : '#f87171', fontWeight: 600, fontSize: '14px' }}>{ok ? okText : failText}</div>
    </div>
  );
}

const PROVIDER_META = {
  ollama:  { icon: '🦙', name: 'Ollama',  subtitle: 'Hoạt động nội bộ – tối bảo mật, offline' },
  groq:    { icon: '⚡', name: 'Groq',    subtitle: 'LPU Cloud Processor – siêu tốc độ' },
  gemini:  { icon: '✨', name: 'Gemini',  subtitle: 'Google Cloud – tư duy sâu' },
};

// ── Main Page ───────────────────────────────────────────────────
export default function SettingsPage({ user, showToast }) {
  const [provider, setProvider] = useState('groq');
  const [status,   setStatus]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [checking, setChecking] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [changed,  setChanged]  = useState(false);

  const loadAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await api.ai.checkStatus(user.id);
      if (res.success) {
        setStatus(res);
        setProvider(res.currentProvider || 'groq');
      } else showToast(res.message || 'Không tải được cấu hình hệ thống', 'error');
    } catch (err) { showToast('Lỗi: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, [user?.id]); 

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = async () => {
    setChecking(true);
    try {
      const res = await api.ai.checkStatus(user.id);
      if (res.success) {
        setStatus(res);
        if (!changed) setProvider(res.currentProvider || 'groq');
        showToast('✅ Đã quét lại trạng thái trung tâm AI', 'success');
      } else showToast(res.message || 'Lỗi kiểm tra', 'error');
    } catch (err) { showToast('Lỗi: ' + err.message, 'error'); }
    finally { setChecking(false); }
  };

  const handleSelect = (newP) => {
    if (newP === provider) return;
    setProvider(newP);
    setChanged(newP !== status?.currentProvider);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const res = await api.ai.setProvider({ userId: user.id, provider });
      if (res.success) {
        setChanged(false);
        const sr = await api.ai.checkStatus(user.id);
        if (sr.success) setStatus(sr);
        showToast(`✅ Đã định tuyến lại sang mạng lưới ${PROVIDER_META[res.provider]?.name}`, 'success');
      } else showToast(res.message || 'Không lưu được cấu hình', 'error');
    } catch (err) { showToast('Lỗi: ' + err.message, 'error'); }
    finally { setSaving(false); }
  };

  // ── Computed ─────────────────────────────────────────────────
  const ollamaOk = status?.ollama?.online && status?.ollama?.activeModelInstalled;
  const groqOk   = status?.groq?.configured && status?.groq?.online !== false;
  const geminiOk = status?.gemini?.configured;
  const anyOk    = ollamaOk || groqOk || geminiOk;

  const allProviders = ['ollama', 'groq', 'gemini'];
  const fallbackOrder = [provider, ...allProviders.filter(p => p !== provider)];
  const getProviderOk = (p) => ({ ollama: ollamaOk, groq: groqOk, gemini: geminiOk }[p] ?? false);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '20px' }}>
        <div className="spinner" style={{ transform: 'scale(1.5)', borderColor: 'rgba(168,85,247,0.2)', borderTopColor: '#a855f7' }} />
        <h2 style={{ color: 'var(--text-muted)' }}>Đang tải kiến trúc AI...</h2>
      </div>
    );
  }

  return (
    <div className="page" style={{ padding: '32px', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      
      {/* Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(71,85,105,0.8) 0%, rgba(30,41,59,0.9) 50%, rgba(15,23,42,0.9) 100%)',
        borderRadius: '24px', padding: '32px', marginBottom: '32px', border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', right: '-10%', top: '-20%', width: '300px', height: '300px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', filter: 'blur(50px)', zIndex: 0 }}></div>
        
        <div style={{ position: 'relative', zIndex: 2 }}>
          <h1 style={{ fontSize: '36px', fontWeight: 900, color: 'white', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', textShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '40px' }}>⚙️</span> Cấu Hình Mạng AI
          </h1>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.7)', textShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            Điều phối sức mạnh xử lý ngôn ngữ tự nhiên phân tán giữa các nhà cung cấp nền tảng.
          </p>
        </div>
        
        <div style={{ position: 'relative', zIndex: 2 }}>
          <button 
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '14px 24px', borderRadius: '12px', fontSize: '15px', fontWeight: 800, cursor: checking ? 'not-allowed' : 'pointer', backdropFilter: 'blur(10px)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '12px' }}
            onClick={handleRefresh} disabled={checking}
          >
            <span style={{ display: 'inline-block', animation: checking ? 'spin 1s linear infinite' : 'none' }}>🔄</span>
            {checking ? 'ĐANG QUÉT MẠNG...' : 'KIỂM TRA KẾT NỐI'}
          </button>
        </div>
      </div>

      {!anyOk && status && (
        <div style={{ background: 'linear-gradient(90deg, rgba(239,68,68,0.2) 0%, rgba(220,38,38,0.05) 100%)', borderLeft: '4px solid #ef4444', borderRadius: '12px', padding: '16px 24px', marginBottom: '32px', color: '#fca5a5', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px' }}>
          <span style={{ fontSize: '24px' }}>⚠️</span> Sự Cố Kỹ Thuật: Toàn bộ nguồn cung cấp AI đang mất kết nối. Hệ thống chẩn đoán hiện không khả dụng.
        </div>
      )}

      {/* ── 3 Provider Cards ── */}
      <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginBottom: '20px' }}>🌐 Chọn Lõi Xử Lý Chính</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px', marginBottom: '32px' }}>

        {/* Ollama */}
        <ProviderCard id="ollama" icon="🦙" name="Ollama (Local)" subtitle="Chạy cục bộ – Bảo mật tuyệt đối" isSelected={provider === 'ollama'} onSelect={handleSelect}>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', fontSize: '14px' }}>
              <StatusDot online={status?.ollama?.online} />
              <span style={{ fontWeight: 800, color: status?.ollama?.online ? '#4ade80' : '#f87171' }}>{status?.ollama?.online ? 'NODE ĐANG CHẠY' : 'NODE CHƯA KÍCH HOẠT'}</span>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <InfoRow label="Model Kích Hoạt" value={status?.ollama?.activeModel || 'quizai'} />
              <InfoRow label="Tình Trạng Tải" value={status?.ollama?.activeModelInstalled ? '✅ Đã tải về máy' : '❌ Chưa tải model'} color={status?.ollama?.activeModelInstalled ? '#4ade80' : '#f87171'} />
              <InfoRow label="Bộ Nhớ Đệm GPU" value={`OLLAMA_NUM_GPU=${status?.ollama?.numGpu ?? -1}`} />
              {status?.ollama?.models?.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
                  {status.ollama.models.slice(0, 3).map(m => ( <span key={m} style={{ fontSize: '11px', background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '6px', color: 'var(--text-muted)' }}>{m}</span> ))}
                  {status.ollama.models.length > 3 && <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '6px', color: 'var(--text-muted)' }}>+{status.ollama.models.length - 3}</span>}
                </div>
              )}
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
              <Pro text="An toàn dữ liệu tuyệt đối (Air-gapped)" />
              <Pro text="Sử dụng miễn phí vĩnh viễn" />
              <Pro text="Yêu cầu máy cấu hình tốt (GPU mạnh)" ok={false} />
            </div>
          </div>
        </ProviderCard>

        {/* Groq */}
        <ProviderCard id="groq" icon="⚡" name="Groq (Cloud)" subtitle="Xử lý bằng chip LPU siêu việt" badge="TỐI ƯU" isSelected={provider === 'groq'} onSelect={handleSelect}>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', fontSize: '14px' }}>
               <StatusDot online={groqOk} />
               <span style={{ fontWeight: 800, color: groqOk ? '#4ade80' : '#f87171' }}>
                 {!status?.groq?.configured ? 'CHƯA CẤU HÌNH API' : status?.groq?.online === false ? 'LỖI API HOẶC OFFLINE' : 'KẾT NỐI ỔN ĐỊNH'}
               </span>
            </div>
            <div style={{ marginBottom: '20px' }}>
               <InfoRow label="Model Xử Lý Chính" value={status?.groq?.activeModel || 'llama-3.3'} />
               <InfoRow label="Model Phụ Trợ" value={status?.groq?.fallbackModel || 'llama-3.1'} />
               {status?.groq?.rateLimited && <InfoRow label="Trạng Thái Quota" value={`Chờ khôi phục trong ${status.groq.rateLimitRemainingS}s`} color="#facc15" />}
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
               <Pro text="Tốc độ phản hồi cực nhanh (~1s)" />
               <Pro text="Mô hình Llama mã nguồn mở thiên tài" />
               <Pro text="Yêu cầu kết nối internet" ok={false} />
               <div style={{ marginTop: '12px', background: 'rgba(59,130,246,0.1)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#93c5fd', textDecoration: 'none', fontWeight: 600, display: 'block', textAlign: 'center' }} onClick={e => e.stopPropagation()}>🔗 Lấy mã GROQ_API_KEY tại đây</a>
               </div>
            </div>
          </div>
        </ProviderCard>

        {/* Gemini */}
        <ProviderCard id="gemini" icon="✨" name="Gemini (Google)" subtitle="Khả năng đọc tài liệu mạnh mẽ" isSelected={provider === 'gemini'} onSelect={handleSelect}>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', fontSize: '14px' }}>
               <StatusDot online={geminiOk} />
               <span style={{ fontWeight: 800, color: geminiOk ? '#4ade80' : '#f87171' }}>{geminiOk ? 'KHỚP LỆNH API THÀNH CÔNG' : 'CHƯA CẤU HÌNH API'}</span>
            </div>
            <div style={{ marginBottom: '20px' }}>
               <InfoRow label="Mắt Xử Lý Thị Giác" value={status?.gemini?.activeModel || 'gemini-2.0-flash'} />
               <InfoRow label="Key Hiển Thị" value={status?.gemini?.keyPreview || '—'} />
               {status?.gemini?.rateLimited && <InfoRow label="Trạng Thái Quota" value={`Chờ khôi phục trong ${status.gemini.rateLimitRemainingS}s`} color="#facc15" />}
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
               <Pro text="Ưu việt với đa phương tiện (Ảnh/PDF)" />
               <Pro text="Mô hình tiếng Việt lưu loát" />
               <Pro text="Giới hạn số lượt dùng miễn phí khắt khe" ok={false} />
            </div>
          </div>
        </ProviderCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 1fr) minmax(350px, 1fr)', gap: '24px', marginBottom: '32px' }}>
        
        {/* Flow Diagram */}
        <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: '24px', padding: '24px' }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'white', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
             🔀 Định Tuyến Thông Minh <span style={{ fontSize: '12px', background: 'rgba(236,72,153,0.2)', color: '#f9a8d4', padding: '4px 10px', borderRadius: '20px', fontWeight: 700 }}>(Tự Động Fallback)</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
             {fallbackOrder.map((p, i) => {
                const meta = PROVIDER_META[p];
                const ok   = getProviderOk(p);
                const isPrimary = i === 0;
                return (
                   <React.Fragment key={p}>
                      <div style={{ background: isPrimary ? 'rgba(139,92,246,0.1)' : 'rgba(0,0,0,0.3)', border: `1px solid ${isPrimary ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.05)'}`, borderRadius: '16px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                         <div style={{ fontSize: '24px' }}>{meta?.icon}</div>
                         <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                               <span style={{ fontWeight: 800, color: 'white', fontSize: '15px' }}>{meta?.name}</span>
                               {isPrimary && <span style={{ fontSize: '11px', background: '#a855f7', color: 'white', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>ƯU TIÊN BẬC 1</span>}
                            </div>
                            <div style={{ fontSize: '13px', color: ok ? '#4ade80' : '#f87171', fontWeight: 600 }}>{ok ? '✅ Có thể kết nối' : '❌ Đang phân mảnh (Offline)'}</div>
                         </div>
                      </div>
                      {i < fallbackOrder.length - 1 && (
                         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                            <div style={{ height: '20px', width: '2px', background: 'rgba(255,255,255,0.1)' }}></div>
                            <div style={{ fontSize: '11px', color: '#fca5a5', background: 'rgba(239,68,68,0.1)', padding: '4px 12px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.2)' }}>Nếu mất kết nối, tự động chuyển về</div>
                            <div style={{ height: '20px', width: '2px', background: 'rgba(255,255,255,0.1)' }}></div>
                         </div>
                      )}
                   </React.Fragment>
                );
             })}
          </div>
          <div style={{ marginTop: '24px', background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
             <strong style={{ color: 'white' }}>Đường Dẫn Đang Xử Lý Tác Vụ:</strong> {status?.flowDescription || 'Không xác định'}
          </div>
        </div>

        {/* Logic Check Dashboard */}
        <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'white', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
             📋 Giám Sát Cổng Kết Nối ENV
          </div>
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden', flex: 1 }}>
             <LogicRow ok={status?.ollama?.online} label="Cổng Ollama (Local)" okText="✅ Xanh đèn HTTP :11434" failText="❌ 11434 đang treo" />
             <LogicRow ok={status?.ollama?.activeModelInstalled} label={`Bảo mật Model '${status?.ollama?.activeModel}'`} okText="✅ Gói dữ liệu hoàn chỉnh" failText="❌ Lỗi unpack / Chưa tải model" />
             <LogicRow ok={groqOk} label="Cổng GROQ_API_KEY" okText="✅ Mật mã hợp lệ" failText="❌ Rỗng hoặc bị từ chối" />
             <LogicRow ok={geminiOk} label="Cổng GEMINI_API_KEY" okText="✅ Mật mã hợp lệ" failText="❌ Rỗng hoặc mã dị dạng" />
             <LogicRow ok={anyOk} label="Kết Luận Vận Hành" okText="🚀 HỆ THỐNG AI SẴN SÀNG" failText="🛑 ĐÒI HỎI BẢO TRÌ MODULE" />
          </div>
        </div>

      </div>

      {/* Save Ribbon */}
      <div style={{
         position: 'sticky', bottom: 32, background: 'rgba(15,23,42,0.95)', border: `1px solid ${changed ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.1)'}`, 
         borderRadius: '16px', padding: '20px 32px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', zIndex: 10,
         display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
         <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'white', marginBottom: '4px' }}>Cấu Hình Nguồn Cung Cấp Tính Toán</div>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
               {changed ? (
                 <span style={{ color: '#fcd34d' }}>Bạn đang đổi sang định tuyến: <strong style={{ color: 'white' }}>{PROVIDER_META[provider]?.name}</strong>. Hãy lưu để kích hoạt.</span>
               ) : (
                 <span>Hệ thống mạng lưới đang hoạt động với <strong style={{ color: 'white' }}>{PROVIDER_META[status?.currentProvider]?.name}</strong> làm nhân chính.</span>
               )}
            </div>
         </div>
         <div style={{ display: 'flex', gap: '16px' }}>
            {changed && (
               <button onClick={() => { setProvider(status?.currentProvider || 'groq'); setChanged(false); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '14px 24px', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', transition: '0.2s' }} onMouseOver={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'} onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                 HUỶ ĐỔI
               </button>
            )}
            <button onClick={handleSave} disabled={saving || !changed} style={{ background: changed ? 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' : 'rgba(255,255,255,0.05)', border: 'none', color: changed ? 'white' : 'var(--text-muted)', padding: '14px 32px', borderRadius: '12px', fontWeight: 800, cursor: disabled => disabled ? 'default' : 'pointer', transition: 'all 0.2s', boxShadow: changed ? '0 8px 24px rgba(139,92,246,0.4)' : 'none', fontSize: '15px' }}>
               {saving ? '⏳ ĐANG TÁI KHỞI ĐỘNG MẠNG LƯỚI...' : changed ? `💾 LƯU CẤU HÌNH (${PROVIDER_META[provider]?.name})` : '✅ ĐÃ LƯU & ỔN ĐỊNH'}
            </button>
         </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
