import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Heart, Image as ImageIcon, LoaderCircle, LogOut, Palette, Printer, RefreshCw, Save, Search, ShieldCheck, Trash2, Upload, UsersRound, X, Type, LayoutTemplate } from 'lucide-react';
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
  const [printSourceBusyPhotoId, setPrintSourceBusyPhotoId] = useState('');
  const [notice, setNotice] = useState(null);
  const [guests, setGuests] = useState([]);
  const [guestsLoading, setGuestsLoading] = useState(false);
  const [guestSearch, setGuestSearch] = useState('');
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [guestPhotos, setGuestPhotos] = useState([]);
  const [guestPhotosLoading, setGuestPhotosLoading] = useState(false);
  const [guestPhotoStatus, setGuestPhotoStatus] = useState('published');
  const [selectedPrintPhotoIds, setSelectedPrintPhotoIds] = useState([]);
  const [printLayout, setPrintLayout] = useState('individual');
  const [printMode, setPrintMode] = useState(false);

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

  const loadGuests = useCallback(async () => {
    setGuestsLoading(true);
    try {
      const data = await apiRequest('/api/admin/guests');
      setGuests(data.guests || []);
    } catch (error) {
      setNotice({ type: 'error', text: `Não foi possível carregar os convidados: ${error.message}` });
    } finally {
      setGuestsLoading(false);
    }
  }, []);

  const loadGuestPhotos = useCallback(async (guestId, status = guestPhotoStatus) => {
    if (!guestId) return;
    setSelectedGuest(guests.find((guest) => guest.id === guestId) || selectedGuest);
    setGuestPhotosLoading(true);
    setGuestPhotos([]);
    setSelectedPrintPhotoIds([]);
    try {
      const data = await apiRequest(`/api/admin/guests/${encodeURIComponent(guestId)}/photos?status=${encodeURIComponent(status)}`);
      setSelectedGuest((previous) => ({ ...(previous || {}), ...(data.guest || {}) }));
      setGuestPhotos(data.photos || []);
    } catch (error) {
      setNotice({ type: 'error', text: `Não foi possível carregar as fotos deste convidado: ${error.message}` });
    } finally {
      setGuestPhotosLoading(false);
    }
  }, [guestPhotoStatus, guests, selectedGuest]);

  const loadAdminData = useCallback(async () => {
    const [settingsResult] = await Promise.all([
      apiRequest('/api/admin/settings'),
      loadPhotos(photoFilter),
      loadGuests(),
    ]);
    setSettings({ ...DEFAULT_EVENT_SETTINGS, ...(settingsResult.settings || {}) });
  }, [loadGuests, loadPhotos, photoFilter]);

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

  useEffect(() => {
    if (!printMode) return undefined;
    let active = true;
    document.body.classList.add('admin-print-active');
    const timer = window.setTimeout(async () => {
      const images = Array.from(document.querySelectorAll('.admin-print-document img'));
      await Promise.all(images.map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            window.clearTimeout(imageTimeout);
            image.removeEventListener('load', finish);
            image.removeEventListener('error', finish);
            resolve();
          };
          const imageTimeout = window.setTimeout(finish, 5000);
          image.addEventListener('load', finish, { once: true });
          image.addEventListener('error', finish, { once: true });
        });
      }));
      if (active) window.print();
    }, 250);
    const onAfterPrint = () => setPrintMode(false);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', onAfterPrint);
      document.body.classList.remove('admin-print-active');
    };
  }, [printMode]);

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
    setGuests([]);
    setGuestPhotos([]);
    setSelectedGuest(null);
    setSelectedPrintPhotoIds([]);
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
      event_tagline: settings.event_tagline,
      hero_title: settings.hero_title,
      hero_highlight: settings.hero_highlight,
      hero_description: settings.hero_description,
      registration_title: settings.registration_title,
      registration_description: settings.registration_description,
      registration_form_title: settings.registration_form_title,
      registration_form_description: settings.registration_form_description,
      footer_text: settings.footer_text,
      font_preset: settings.font_preset || 'editorial',
      spacing_preset: settings.spacing_preset || 'comfortable',
      background_preset: settings.background_preset || 'plain',
      card_style: settings.card_style || 'soft',
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

  const handlePrintSourceUpload = async (event, photo) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setNotice({ type: 'error', text: 'Escolha o arquivo original em JPEG, PNG ou WebP.' });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setNotice({ type: 'error', text: 'A imagem original deve ter no máximo 8 MB.' });
      return;
    }

    const guestId = selectedGuest?.id;
    if (!guestId) {
      setNotice({ type: 'error', text: 'Selecione um convidado antes de anexar o original.' });
      return;
    }

    setPrintSourceBusyPhotoId(photo.id);
    setNotice(null);
    try {
      const data = await apiRequest(`/api/admin/photos/${encodeURIComponent(photo.id)}/print-source`, {
        method: 'POST',
        headers: { 'Content-Type': file.type, Accept: 'application/json' },
        body: file,
      });
      await loadGuestPhotos(guestId, guestPhotoStatus);
      setSelectedPrintPhotoIds([photo.id]);
      setNotice({ type: 'success', text: data.message || 'Original associado para impressão.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Não foi possível guardar o original. Tente novamente.' });
    } finally {
      setPrintSourceBusyPhotoId('');
    }
  };

  const visibleGuests = guests.filter((guest) => {
    const query = guestSearch.trim().toLocaleLowerCase('pt-BR');
    return !query || guest.name.toLocaleLowerCase('pt-BR').includes(query) || guest.whatsapp_masked.toLocaleLowerCase('pt-BR').includes(query);
  });
  const selectedPrintPhotos = guestPhotos.filter((photo) => selectedPrintPhotoIds.includes(photo.id) && photo.status === 'published' && photo.print_url);

  const togglePrintPhoto = (photoId, checked) => {
    setSelectedPrintPhotoIds((previous) => checked
      ? [...new Set([...previous, photoId])]
      : previous.filter((id) => id !== photoId));
  };

  const selectAllPublishedPhotos = () => {
    setSelectedPrintPhotoIds(guestPhotos.filter((photo) => photo.status === 'published' && photo.print_url).map((photo) => photo.id));
  };

  const printSelectedPhotos = () => {
    if (!selectedPrintPhotos.length) {
      setNotice({ type: 'error', text: 'Selecione ao menos uma foto publicada para imprimir.' });
      return;
    }
    setPrintMode(true);
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
        <div className="admin-page-heading"><div><span className="section-kicker">CONFIGURAÇÃO DO EVENTO</span><h1>Uma história com a identidade de vocês.</h1><p>Personalize o evento, consulte os convidados, selecione fotos para impressão e modere as lembranças compartilhadas.</p></div><a className="stage-secondary-button" href="/qr"><ImageIcon size={16} /> Preparar QR Code</a></div>
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

        <section className="admin-panel-card admin-customization-panel">
          <div className="admin-panel-heading"><span className="admin-panel-icon"><Type size={19} /></span><div><h2>Textos, tipografia e layout</h2><p>Personalize as mensagens e o estilo visual sem editar o código.</p></div></div>
          <form className="admin-settings-form admin-copy-settings-form" onSubmit={handleSaveSettings}>
            <div className="admin-copy-settings-grid">
              <label className="admin-field-stack"><span>Texto da etiqueta superior</span><input className="stage-input" maxLength={80} value={settings.event_tagline || ''} onChange={(event) => updateSetting('event_tagline', event.target.value)} required /></label>
              <label className="admin-field-stack"><span>Título principal</span><input className="stage-input" maxLength={100} value={settings.hero_title || ''} onChange={(event) => updateSetting('hero_title', event.target.value)} required /></label>
              <label className="admin-field-stack"><span>Frase destacada</span><input className="stage-input" maxLength={100} value={settings.hero_highlight || ''} onChange={(event) => updateSetting('hero_highlight', event.target.value)} required /></label>
              <label className="admin-field-stack admin-field-wide"><span>Descrição principal</span><textarea className="stage-input admin-textarea" maxLength={400} rows={3} value={settings.hero_description || ''} onChange={(event) => updateSetting('hero_description', event.target.value)} required /></label>
              <label className="admin-field-stack"><span>Título da área de cadastro</span><input className="stage-input" maxLength={120} value={settings.registration_title || ''} onChange={(event) => updateSetting('registration_title', event.target.value)} required /></label>
              <label className="admin-field-stack"><span>Título do formulário</span><input className="stage-input" maxLength={100} value={settings.registration_form_title || ''} onChange={(event) => updateSetting('registration_form_title', event.target.value)} required /></label>
              <label className="admin-field-stack admin-field-wide"><span>Descrição da área de cadastro</span><textarea className="stage-input admin-textarea" maxLength={400} rows={3} value={settings.registration_description || ''} onChange={(event) => updateSetting('registration_description', event.target.value)} required /></label>
              <label className="admin-field-stack admin-field-wide"><span>Instrução acima dos campos do formulário</span><textarea className="stage-input admin-textarea" maxLength={250} rows={2} value={settings.registration_form_description || ''} onChange={(event) => updateSetting('registration_form_description', event.target.value)} required /></label>
              <label className="admin-field-stack admin-field-wide"><span>Texto do rodapé</span><input className="stage-input" maxLength={160} value={settings.footer_text || ''} onChange={(event) => updateSetting('footer_text', event.target.value)} required /></label>
            </div>
            <div className="admin-style-options-grid">
              <label className="admin-field-stack"><span><Type size={14} /> Tipografia</span><select className="stage-input" value={settings.font_preset || 'editorial'} onChange={(event) => updateSetting('font_preset', event.target.value)}><option value="editorial">Editorial (serif + sans)</option><option value="modern">Moderna</option><option value="classic">Clássica</option><option value="rounded">Arredondada</option></select></label>
              <label className="admin-field-stack"><span><LayoutTemplate size={14} /> Espaçamento</span><select className="stage-input" value={settings.spacing_preset || 'comfortable'} onChange={(event) => updateSetting('spacing_preset', event.target.value)}><option value="compact">Compacto</option><option value="comfortable">Confortável</option><option value="airy">Amplo</option></select></label>
              <label className="admin-field-stack"><span>Fundo</span><select className="stage-input" value={settings.background_preset || 'plain'} onChange={(event) => updateSetting('background_preset', event.target.value)}><option value="plain">Cor sólida</option><option value="soft-gradient">Degradê suave</option><option value="warm">Quente e suave</option></select></label>
              <label className="admin-field-stack"><span>Estilo dos cards</span><select className="stage-input" value={settings.card_style || 'soft'} onChange={(event) => updateSetting('card_style', event.target.value)}><option value="soft">Suave com sombra</option><option value="outlined">Contornado</option><option value="flat">Plano, sem sombra</option></select></label>
            </div>
            <div className="admin-live-preview" data-preview-card-style={settings.card_style || 'soft'} style={{ background: settings.background_preset === 'soft-gradient' ? `linear-gradient(135deg, ${settings.background_color}, ${settings.primary_color}18)` : settings.background_preset === 'warm' ? `linear-gradient(180deg, ${settings.background_color}, #f0e5dc)` : settings.background_color, color: settings.text_color, borderColor: `${settings.primary_color}66`, fontFamily: settings.font_preset === 'modern' ? "Inter, 'Segoe UI', Arial, sans-serif" : settings.font_preset === 'classic' ? "Georgia, 'Times New Roman', serif" : settings.font_preset === 'rounded' ? "'Trebuchet MS', Arial, sans-serif" : "'DM Sans', Arial, sans-serif" }}>
              <span className="admin-live-preview-kicker" style={{ color: settings.primary_color }}>{settings.event_tagline || 'NOSSO CASAMENTO'}</span>
              <strong style={{ fontFamily: settings.font_preset === 'modern' ? "Inter, 'Segoe UI', Arial, sans-serif" : settings.font_preset === 'classic' ? "Georgia, 'Times New Roman', serif" : settings.font_preset === 'rounded' ? "'Trebuchet MS', Arial, sans-serif" : "'Playfair Display', Georgia, serif" }}>{settings.hero_title || 'O grande dia,'} {settings.hero_highlight || 'do jeito que vocês viveram.'}</strong>
              <span>{settings.hero_description || ''}</span>
              <button type="button" style={{ background: settings.primary_color }}>Compartilhar uma foto</button>
              <small>{settings.footer_text}</small>
            </div>
            <button className="button button-primary admin-save-button" type="submit" disabled={settingsBusy}><Save size={16} /> Salvar textos e estilo</button>
          </form>
        </section>

        <section className="admin-panel-card admin-guest-manager-panel">
          <div className="admin-panel-heading admin-guest-manager-heading"><span className="admin-panel-icon"><UsersRound size={19} /></span><div><h2>Convidados e impressão de fotos</h2><p>Consulte as fotos de cada convidado e prepare uma seleção para brindes ou impressão.</p></div><button type="button" className="stage-secondary-button" onClick={loadGuests} disabled={guestsLoading}><RefreshCw size={15} /> Atualizar lista</button></div>
          <div className="admin-guest-manager-grid">
            <aside className="admin-guests-sidebar">
              <label className="admin-guest-search"><Search size={16} /><input value={guestSearch} onChange={(event) => setGuestSearch(event.target.value)} placeholder="Buscar convidado" aria-label="Buscar convidado" /></label>
              {guestsLoading ? <div className="admin-loading"><LoaderCircle className="spin" size={20} /> Carregando convidados...</div> : !visibleGuests.length ? <div className="admin-photo-empty"><UsersRound size={24} /><strong>Nenhum convidado encontrado</strong><p>Experimente outro nome de busca.</p></div> : (
                <div className="admin-guests-list">{visibleGuests.map((guest) => (
                  <button type="button" key={guest.id} className={`admin-guest-row ${selectedGuest?.id === guest.id ? 'active' : ''}`} onClick={() => loadGuestPhotos(guest.id, guestPhotoStatus)}>
                    <span className="admin-guest-row-main"><strong>{guest.name}</strong><small>{guest.whatsapp_masked}</small></span>
                    <span className="admin-guest-photo-count">{guest.photo_count} fotos</span>
                  </button>
                ))}</div>
              )}
            </aside>
            <div className="admin-guest-photos-area">
              {!selectedGuest ? <div className="admin-photo-empty"><ImageIcon size={28} /><strong>Selecione um convidado</strong><p>As fotos da pessoa aparecerão aqui. Você poderá selecionar as publicadas para imprimir.</p></div> : <>
                <div className="admin-selected-guest-heading"><div><span className="section-kicker">FOTOS DO CONVIDADO</span><h3>{selectedGuest.name}</h3><p>{guestPhotos.length} foto(s) carregada(s)</p></div><label className="admin-field-stack admin-status-select"><span>Mostrar</span><select className="stage-input" value={guestPhotoStatus} onChange={(event) => { setGuestPhotoStatus(event.target.value); loadGuestPhotos(selectedGuest.id, event.target.value); }}><option value="published">Publicadas</option><option value="all">Todas as fotos</option></select></label></div>
                <div className="admin-print-toolbar"><div className="admin-print-selection-actions"><button type="button" className="stage-secondary-button" onClick={selectAllPublishedPhotos}>Selecionar publicadas</button><button type="button" className="stage-secondary-button" onClick={() => setSelectedPrintPhotoIds([])}>Limpar seleção</button></div><label className="admin-field-stack admin-print-layout-select"><span>Formato para impressão</span><select className="stage-input" value={printLayout} onChange={(event) => setPrintLayout(event.target.value)}><option value="a4-grid">Folha A4 · grade 2 × 2 em molduras</option><option value="individual">Retratos em moldura · uma por página</option></select></label><button type="button" className="button button-primary admin-print-button" onClick={printSelectedPhotos} disabled={!selectedPrintPhotos.length}><Printer size={16} /> Imprimir selecionadas ({selectedPrintPhotos.length})</button></div>
                {guestPhotosLoading ? <div className="admin-loading"><LoaderCircle className="spin" size={20} /> Carregando fotos...</div> : !guestPhotos.length ? <div className="admin-photo-empty"><ImageIcon size={24} /><strong>Nenhuma foto encontrada</strong><p>Este convidado ainda não possui imagens neste filtro.</p></div> : <div className="admin-guest-photo-grid">{guestPhotos.map((photo) => {
                  const printable = photo.status === 'published' && Boolean(photo.print_url);
                  const checked = selectedPrintPhotoIds.includes(photo.id);
                  return <article className={`admin-guest-print-card ${checked ? 'selected' : ''}`} key={photo.id}>
                    <label className="admin-guest-print-select"><input type="checkbox" checked={checked} disabled={!printable} onChange={(event) => togglePrintPhoto(photo.id, event.target.checked)} /><span>{printable ? 'Selecionar para imprimir' : photo.status !== 'published' ? 'Somente fotos publicadas podem ser impressas' : photo.print_url ? 'Imagem indisponível' : 'Sem versão limpa para impressão'}</span></label>
                    {photo.print_url || photo.url ? <img src={photo.print_url || photo.url} alt="Prévia da foto" loading="lazy" /> : <div className="admin-photo-missing"><ImageIcon size={22} /> Prévia indisponível</div>}
                    <div className="admin-photo-detail">
                      <span className={`admin-status-pill status-${photo.status}`}>{photo.status === 'pending' ? 'Pendente' : photo.status === 'published' ? 'Publicada' : 'Oculta'}</span>
                      {!photo.print_url && photo.status === 'published' && <div className="admin-print-source-recovery">
                        <p className="admin-print-unavailable-note">Esta foto é antiga e não possui uma cópia limpa. Envie o arquivo original, sem legenda ou emoji sobreposto, para habilitar a impressão sem criar outra publicação.</p>
                        <label className={`stage-secondary-button admin-upload-label admin-print-source-upload ${printSourceBusyPhotoId === photo.id ? 'is-loading' : ''}`}>
                          {printSourceBusyPhotoId === photo.id ? <LoaderCircle className="spin" size={14} /> : <Upload size={14} />}
                          {printSourceBusyPhotoId === photo.id ? 'Enviando original...' : 'Enviar original para impressão'}
                          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handlePrintSourceUpload(event, photo)} hidden disabled={Boolean(printSourceBusyPhotoId)} />
                        </label>
                      </div>}
                      {photo.print_url && photo.status === 'published' && <label className="stage-secondary-button admin-upload-label admin-print-source-upload">
                        <Upload size={14} /> Substituir original de impressão
                        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handlePrintSourceUpload(event, photo)} hidden disabled={Boolean(printSourceBusyPhotoId)} />
                      </label>}
                    </div>
                  </article>;
                })}</div>}
              </>}
            </div>
          </div>
        </section>

        {printMode && selectedGuest && selectedPrintPhotos.length > 0 && (
          <section className={`admin-print-document ${printLayout === 'individual' ? 'admin-print-individual-layout' : 'admin-print-grid-layout'}`} aria-label="Fotografias limpas para impressão">
            <div className="admin-print-photos">{selectedPrintPhotos.map((photo) => <figure className="admin-print-photo" key={photo.id}><div className="admin-print-frame"><img src={photo.print_url} alt="Fotografia para impressão" /></div></figure>)}</div>
          </section>
        )}

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
