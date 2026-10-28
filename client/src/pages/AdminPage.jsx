import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Heart, Image as ImageIcon, LoaderCircle, LogOut, Palette, RefreshCw, Save, ShieldCheck, Trash2, Upload, UsersRound, X } from 'lucide-react';
import { DEFAULT_EVENT_SETTINGS, useEventSettings } from '../lib/useEventSettings.js';

async function apiRequest(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `A solicitação falhou (${response.status}).`);
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }
  return payload;
}

const PHOTO_FILTERS = [
  { key: 'pending', label: 'Aguardando aprovação' },
  { key: 'published', label: 'Publicadas' },
  { key: 'hidden', label: 'Ocultas' },
  { key: 'all', label: 'Todas' },
];

export default function AdminPage() {
  const { refreshSettings } = useEventSettings();
  const [authLoading, setAuthLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_EVENT_SETTINGS);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [photoFilter, setPhotoFilter] = useState('pending');
  const [photos, setPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [busyPhotoId, setBusyPhotoId] = useState('');
  const [notice, setNotice] = useState(null);

  const loadPhotos = useCallback(async (filter = photoFilter) => {
    setLoadingPhotos(true);
    try {
      const data = await apiRequest(`/api/admin/photos?status=${encodeURIComponent(filter)}`);
      setPhotos(data.photos || []);
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setLoadingPhotos(false);
    }
  }, [photoFilter]);

  const loadAdminData = useCallback(async () => {
    const [settingsResult] = await Promise.all([
      apiRequest('/api/admin/settings'),
      loadPhotos(photoFilter),
    ]);
    setSettings({ ...DEFAULT_EVENT_SETTINGS, ...(settingsResult.settings || {}) });
  }, [loadPhotos, photoFilter]);

  useEffect(() => {
    let active = true;
    apiRequest('/api/admin/session')
      .then(async (data) => {
        if (!active) return;
        setConfigured(Boolean(data.configured));
        setAuthenticated(Boolean(data.authenticated));
        if (data.authenticated) await loadAdminData();
      })
      .catch((error) => {
        if (active) setNotice({ type: 'error', text: error.message });
      })
      .finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, [loadAdminData]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginBusy(true);
    setNotice(null);
    try {
      await apiRequest('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ password }),
      });
      setPassword('');
      setAuthenticated(true);
      await loadAdminData();
      setNotice({ type: 'success', text: 'Acesso administrativo liberado.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    try { await apiRequest('/api/admin/logout', { method: 'POST' }); } catch { /* O cookie local será encerrado mesmo se a rede falhar. */ }
    setAuthenticated(false);
    setPhotos([]);
    setNotice({ type: 'success', text: 'Sessão administrativa encerrada.' });
  };

  const updateSetting = (key, value) => setSettings((previous) => ({ ...previous, [key]: value }));

  const handleSaveSettings = async (event) => {
    event.preventDefault();
    setSettingsBusy(true);
    setNotice(null);
    const payload = {
      couple_names: settings.couple_names,
      primary_color: settings.primary_color,
      background_color: settings.background_color,
      text_color: settings.text_color,
      slideshow_interval_seconds: Number(settings.slideshow_interval_seconds),
      slideshow_transition: settings.slideshow_transition,
      story_refresh_seconds: Number(settings.story_refresh_seconds),
      gallery_layout: settings.gallery_layout || 'grid',
      auto_publish: Boolean(settings.auto_publish),
    };
    try {
      const data = await apiRequest('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      setSettings({ ...DEFAULT_EVENT_SETTINGS, ...(data.settings || {}) });
      await refreshSettings();
      setNotice({ type: 'success', text: 'Configurações do casamento salvas.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setNotice({ type: 'error', text: 'Escolha um logo nos formatos JPEG, PNG ou WebP.' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setNotice({ type: 'error', text: 'O logo deve ter no máximo 2 MB.' });
      return;
    }
    setSettingsBusy(true);
    try {
      const data = await apiRequest('/api/admin/logo', {
        method: 'POST',
        headers: { 'Content-Type': file.type, Accept: 'application/json' },
        body: file,
      });
      setSettings((previous) => ({ ...previous, ...(data.settings || {}) }));
      await refreshSettings();
      setNotice({ type: 'success', text: 'Logo atualizado com sucesso.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setSettingsBusy(false);
    }
  };

  const removeLogo = async () => {
    if (!window.confirm('Deseja remover o logo do evento?')) return;
    setSettingsBusy(true);
    try {
      const data = await apiRequest('/api/admin/logo', { method: 'DELETE' });
      setSettings((previous) => ({ ...previous, ...(data.settings || {}) }));
      await refreshSettings();
      setNotice({ type: 'success', text: 'Logo removido.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setSettingsBusy(false);
    }
  };

  const changePhotoStatus = async (photo, status) => {
    setBusyPhotoId(photo.id);
    try {
      await apiRequest(`/api/admin/photos/${encodeURIComponent(photo.id)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ status }),
      });
      setNotice({ type: 'success', text: status === 'published' ? 'Foto publicada no story.' : status === 'hidden' ? 'Foto ocultada do story.' : 'Foto movida para pendentes.' });
      await loadPhotos(photoFilter);
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setBusyPhotoId('');
    }
  };

  const deletePhoto = async (photo) => {
    if (!window.confirm('Excluir permanentemente esta foto do armazenamento e do banco?')) return;
    setBusyPhotoId(photo.id);
    try {
      await apiRequest(`/api/admin/photos/${encodeURIComponent(photo.id)}`, { method: 'DELETE' });
      setNotice({ type: 'success', text: 'Foto excluída permanentemente.' });
      await loadPhotos(photoFilter);
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setBusyPhotoId('');
    }
  };

  if (authLoading) {
    return <main className="admin-page"><div className="admin-loading"><LoaderCircle className="spin" size={24} /> Conferindo acesso administrativo...</div></main>;
  }

  if (!configured) {
    return (
      <main className="admin-page"><div className="admin-login-card">
        <span className="admin-logo-mark"><ShieldCheck size={25} /></span><h1>Configurar o painel master</h1>
        <p>Para proteger esta área, adicione as variáveis <code>ADMIN_PASSWORD</code> e <code>ADMIN_SESSION_SECRET</code> no ambiente do backend local e no Render.</p>
        <p>Gere um segredo aleatório no terminal com:</p><pre>node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"</pre>
        <a className="stage-secondary-button" href="/">Voltar para o site</a>
      </div></main>
    );
  }

  if (!authenticated) {
    return (
      <main className="admin-page"><form className="admin-login-card" onSubmit={handleLogin}>
        <span className="admin-logo-mark"><ShieldCheck size={25} /></span><span className="section-kicker">ACESSO RESTRITO</span><h1>Painel master</h1>
        <p>Entre com a senha administrativa configurada no servidor para gerenciar o casamento.</p>
        <label className="stage-field-label" htmlFor="admin-password">Senha administrativa</label>
        <input id="admin-password" className="stage-input" type="password" autoComplete="current-password" maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} required />
        <button className="button button-primary admin-login-submit" type="submit" disabled={loginBusy || !password}>{loginBusy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />} Entrar com segurança</button>
        <a className="admin-back-link" href="/">Voltar para a aplicação</a>
        {notice && <div className={`stage-alert stage-alert-${notice.type}`}>{notice.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}{notice.text}</div>}
      </form></main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <a href="/" className="admin-brand"><span className="admin-logo-mark">{settings.logo_url ? <img src={settings.logo_url} alt="Logo do evento" /> : <Heart size={21} />}</span><span><strong>Painel master</strong><small>{settings.couple_names}</small></span></a>
        <div className="admin-top-actions"><a className="stage-secondary-button" href="/story">Ver story</a><a className="stage-secondary-button" href="/telao">Abrir telão</a><a className="stage-secondary-button" href="/qr">QR Code</a><button className="stage-secondary-button" type="button" onClick={handleLogout}><LogOut size={15} /> Sair</button></div>
      </header>

      <section className="admin-main">
        <div className="admin-page-heading"><div><span className="section-kicker">CONFIGURAÇÃO DO EVENTO</span><h1>Uma história com a identidade de vocês.</h1><p>Personalize a aparência, defina como as fotos serão publicadas e modere as lembranças compartilhadas.</p></div><a className="stage-secondary-button" href="/qr"><ImageIcon size={16} /> Preparar QR Code</a></div>
        {notice && <div className={`stage-alert stage-alert-${notice.type}`} role="status">{notice.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}<span>{notice.text}</span><button type="button" onClick={() => setNotice(null)} aria-label="Fechar mensagem"><X size={15} /></button></div>}

        <div className="admin-dashboard-grid">
          <section className="admin-panel-card">
            <div className="admin-panel-heading"><span className="admin-panel-icon"><Palette size={19} /></span><div><h2>Identidade visual</h2><p>Nome, logo e cores da aplicação.</p></div></div>
            <form className="admin-settings-form" onSubmit={handleSaveSettings}>
              <label className="stage-field-label" htmlFor="couple-names">Nomes dos noivos ou título do evento</label>
              <input id="couple-names" className="stage-input" maxLength={100} value={settings.couple_names || ''} onChange={(event) => updateSetting('couple_names', event.target.value)} required />
              <div className="admin-logo-upload-row"><div className="admin-logo-preview">{settings.logo_url ? <img src={settings.logo_url} alt="Prévia do logo" /> : <Heart size={24} />}</div><div className="admin-logo-description"><strong>Logo do evento</strong><p>PNG, JPEG ou WebP, até 2 MB. O arquivo fica no bucket privado.</p><label className="stage-secondary-button admin-upload-label"><Upload size={15} /> Escolher logo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleLogoUpload} hidden disabled={settingsBusy} /></label>{settings.logo_url && <button type="button" className="admin-text-button" onClick={removeLogo} disabled={settingsBusy}>Remover logo</button>}</div></div>
              <div className="admin-color-grid">
                {[['primary_color', 'Cor principal'], ['background_color', 'Cor de fundo'], ['text_color', 'Cor do texto']].map(([key, label]) => (
                  <label className="admin-color-field" key={key}><span>{label}</span><div><input type="color" value={settings[key] || DEFAULT_EVENT_SETTINGS[key]} onChange={(event) => updateSetting(key, event.target.value)} /><code>{settings[key]}</code></div></label>
                ))}
              </div>
              <div className="admin-live-preview" style={{ background: settings.background_color, color: settings.text_color, borderColor: `${settings.primary_color}55` }}><span className="admin-live-preview-kicker" style={{ color: settings.primary_color }}>PRÉVIA DA IDENTIDADE</span><strong>{settings.couple_names || 'Nosso casamento'}</strong><span>Uma foto, uma lembrança, uma história inteira.</span><button type="button" style={{ background: settings.primary_color }}>Compartilhar uma foto</button></div>
              <button className="button button-primary admin-save-button" type="submit" disabled={settingsBusy}><Save size={16} /> Salvar configurações</button>
            </form>
          </section>

          <section className="admin-panel-card">
            <div className="admin-panel-heading"><span className="admin-panel-icon"><UsersRound size={19} /></span><div><h2>Publicação e telão</h2><p>Controle o fluxo de novas fotos e a apresentação.</p></div></div>
            <form className="admin-settings-form" onSubmit={handleSaveSettings}>
              <label className="admin-toggle-row"><span><strong>Publicar automaticamente</strong><small>Quando desativado, novas fotos ficam pendentes até aprovação.</small></span><input type="checkbox" checked={Boolean(settings.auto_publish)} onChange={(event) => updateSetting('auto_publish', event.target.checked)} /></label>
              <label className="stage-field-label" htmlFor="slide-interval">Tempo de cada foto no telão</label>
              <div className="admin-range-row"><input id="slide-interval" type="range" min="3" max="30" value={Number(settings.slideshow_interval_seconds) || 7} onChange={(event) => updateSetting('slideshow_interval_seconds', Number(event.target.value))} /><strong>{settings.slideshow_interval_seconds || 7}s</strong></div>
              <label className="stage-field-label" htmlFor="transition">Transição entre fotos</label>
              <select id="transition" className="stage-input" value={settings.slideshow_transition || 'fade'} onChange={(event) => updateSetting('slideshow_transition', event.target.value)}><option value="fade">Dissolver (fade)</option><option value="slide">Deslizar</option><option value="zoom">Zoom suave</option></select>
              <label className="stage-field-label" htmlFor="refresh-interval">Atualizar novas fotos a cada</label>
              <select id="refresh-interval" className="stage-input" value={Number(settings.story_refresh_seconds) || 10} onChange={(event) => updateSetting('story_refresh_seconds', Number(event.target.value))}><option value="5">5 segundos</option><option value="10">10 segundos</option><option value="15">15 segundos</option><option value="30">30 segundos</option><option value="60">60 segundos</option></select>
              <label className="stage-field-label" htmlFor="gallery-layout">Layout da galeria</label>
              <select id="gallery-layout" className="stage-input" value={settings.gallery_layout || 'grid'} onChange={(event) => updateSetting('gallery_layout', event.target.value)}><option value="grid">Grade espaçosa</option><option value="compact">Grade compacta</option></select>
              <button className="button button-primary admin-save-button" type="submit" disabled={settingsBusy}><Save size={16} /> Salvar parâmetros</button>
              <p className="admin-privacy-note"><ShieldCheck size={15} /> O painel exige senha. As fotos pendentes não aparecem no story compartilhado nem no telão.</p>
            </form>
          </section>
        </div>

        <section className="admin-panel-card admin-moderation-panel">
          <div className="admin-panel-heading admin-moderation-heading"><span className="admin-panel-icon"><ImageIcon size={19} /></span><div><h2>Gerenciar fotografias</h2><p>Aprove, oculte ou exclua imagens enviadas pelos convidados.</p></div><button type="button" className="stage-secondary-button" onClick={() => loadPhotos(photoFilter)} disabled={loadingPhotos}><RefreshCw size={15} /> Atualizar</button></div>
          <div className="admin-photo-filter-row" role="tablist" aria-label="Filtrar fotografias">{PHOTO_FILTERS.map((filter) => <button key={filter.key} type="button" role="tab" aria-selected={photoFilter === filter.key} className={photoFilter === filter.key ? 'active' : ''} onClick={() => { setPhotoFilter(filter.key); loadPhotos(filter.key); }}>{filter.label}</button>)}</div>
          {loadingPhotos ? <div className="admin-loading"><LoaderCircle className="spin" size={22} /> Carregando fotografias...</div> : !photos.length ? <div className="admin-photo-empty"><ImageIcon size={26} /><strong>Nenhuma foto nesta lista</strong><p>Quando houver novas publicações, elas aparecerão aqui.</p></div> : (
            <div className="admin-photo-grid">{photos.map((photo) => (
              <article className="admin-photo-card" key={photo.id}>
                {photo.url ? <img src={photo.url} alt={photo.caption || 'Foto de convidado'} loading="lazy" /> : <div className="admin-photo-missing"><ImageIcon size={24} /> Prévia indisponível</div>}
                <div className="admin-photo-detail"><div className="admin-photo-meta"><strong>{photo.guest_name}</strong><span>{new Date(photo.created_at).toLocaleString('pt-BR')}</span></div>{photo.emoji && <span className="admin-photo-emoji">{photo.emoji}</span>}{photo.caption && <p>{photo.caption}</p>}<span className={`admin-status-pill status-${photo.status}`}>{photo.status === 'pending' ? 'Pendente' : photo.status === 'published' ? 'Publicada' : 'Oculta'}</span></div>
                <div className="admin-photo-actions">
                  {photo.status !== 'published' && <button type="button" className="admin-action-approve" disabled={busyPhotoId === photo.id} onClick={() => changePhotoStatus(photo, 'published')}><CheckCircle2 size={14} /> Publicar</button>}
                  {photo.status !== 'hidden' && <button type="button" className="admin-action-hide" disabled={busyPhotoId === photo.id} onClick={() => changePhotoStatus(photo, 'hidden')}><EyeOff size={14} /> Ocultar</button>}
                  {photo.status === 'hidden' && <button type="button" className="admin-action-hide" disabled={busyPhotoId === photo.id} onClick={() => changePhotoStatus(photo, 'pending')}><Eye size={14} /> Voltar a pendentes</button>}
                  <button type="button" className="admin-action-delete" disabled={busyPhotoId === photo.id} onClick={() => deletePhoto(photo)} aria-label="Excluir foto"><Trash2 size={14} /></button>
                </div>
              </article>
            ))}</div>
          )}
        </section>
      </section>
    </main>
  );
}
