import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CameraOff,
  CheckCircle2,
  Heart,
  Image as ImageIcon,
  LoaderCircle,
  LogOut,
  Monitor,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import StoryViewer from './pages/StoryViewer.jsx';
import AdminPage from './pages/AdminPage.jsx';
import SlideshowPage from './pages/SlideshowPage.jsx';
import QrPage from './pages/QrPage.jsx';
import { useEventSettings } from './lib/useEventSettings.js';
import { fetchWithRetry } from './lib/fetchWithRetry.js';

const FILTERS = [
  { key: 'natural', label: 'Original', css: 'none', canvas: 'none' },
  { key: 'warm', label: 'Quente', css: 'sepia(.22) saturate(1.2)', canvas: 'sepia(0.22) saturate(1.2)' },
  { key: 'mono', label: 'P&B', css: 'grayscale(1)', canvas: 'grayscale(1)' },
  { key: 'rose', label: 'Romântico', css: 'saturate(1.28) hue-rotate(-10deg)', canvas: 'saturate(1.28) hue-rotate(-10deg)' },
  { key: 'soft', label: 'Suave', css: 'brightness(1.06) contrast(.93) saturate(.86)', canvas: 'brightness(1.06) contrast(0.93) saturate(0.86)' },
];
const EMOJIS = ['❤️', '🥂', '💍', '✨', '🎉', '🥰', '🤍', '💐'];

function normalizePhoneInput(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  return digits;
}

async function readApiResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `A solicitação falhou (${response.status}).`);
    error.status = response.status;
    error.code = payload.code;
    error.field = payload.field;
    throw error;
  }
  return payload;
}

function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível abrir a imagem selecionada.'));
    image.src = dataUrl;
  });
}

function wrapCanvasText(context, text, maxWidth) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= 2) return lines;
  return [`${lines[0]} ${lines[1]}`.slice(0, 66), `${lines.slice(2).join(' ').slice(0, 66)}`];
}

async function createEditedJpeg(dataUrl, filterKey, caption, emoji) {
  const image = await dataUrlToImage(dataUrl);
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Seu navegador não conseguiu preparar a imagem.');

  const filter = FILTERS.find((item) => item.key === filterKey) || FILTERS[0];
  context.filter = filter.canvas;
  context.drawImage(image, 0, 0, width, height);
  context.filter = 'none';

  const cleanCaption = String(caption || '').trim().slice(0, 100);
  const cleanEmoji = String(emoji || '').trim().slice(0, 16);
  if (cleanCaption || cleanEmoji) {
    const overlayHeight = Math.round(height * 0.28);
    const gradient = context.createLinearGradient(0, height - overlayHeight, 0, height);
    gradient.addColorStop(0, 'rgba(20, 12, 16, 0)');
    gradient.addColorStop(1, 'rgba(20, 12, 16, 0.70)');
    context.fillStyle = gradient;
    context.fillRect(0, height - overlayHeight, width, overlayHeight);

    const margin = Math.round(width * 0.07);
    const maxTextWidth = width - margin * 2;
    const emojiSize = Math.max(24, Math.min(58, Math.round(width * 0.055)));
    const fontSize = Math.max(20, Math.min(42, Math.round(width * 0.038)));
    let baseline = height - Math.max(24, Math.round(height * 0.045));

    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillStyle = '#ffffff';
    context.shadowColor = 'rgba(0, 0, 0, .35)';
    context.shadowBlur = 7;
    context.shadowOffsetY = 2;

    const lines = [];
    context.font = `600 ${fontSize}px system-ui, sans-serif`;
    if (cleanCaption) lines.push(...wrapCanvasText(context, cleanCaption, maxTextWidth));
    const lineHeight = Math.round(fontSize * 1.2);
    if (cleanEmoji) {
      context.font = `${emojiSize}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      const emojiBaseline = lines.length ? baseline - (lines.length * lineHeight) - 5 : baseline;
      context.fillText(cleanEmoji, width / 2, emojiBaseline, maxTextWidth);
    }
    if (lines.length) {
      context.font = `600 ${fontSize}px system-ui, sans-serif`;
      lines.forEach((line, index) => context.fillText(line, width / 2, baseline - (lines.length - index - 1) * lineHeight, maxTextWidth));
    }
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
  }

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Não foi possível preparar o arquivo da foto.'))), 'image/jpeg', 0.86);
  });
  if (blob.size > 8 * 1024 * 1024) {
    throw new Error('Esta foto ficou maior que 8 MB. Tente usar uma imagem menor.');
  }
  return blob;
}

function PhotoGrid({ photos, emptyTitle, emptyDescription, onDelete, onOpen, layout = 'grid' }) {
  if (!photos.length) {
    return (
      <div className="stage-empty">
        <span className="stage-empty-icon"><ImageIcon size={26} /></span>
        <h3>{emptyTitle}</h3>
        <p>{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className={`stage-photo-grid ${layout === 'compact' ? 'stage-photo-grid-compact' : ''}`}>
      {photos.map((photo) => (
        <article className="stage-photo-card" key={photo.id}>
          {photo.url ? (
            <button className="stage-photo-open-button" type="button" onClick={() => onOpen?.(photo)} aria-label={`Abrir foto de ${photo.guest_name || 'convidado'}`}>
              <img className="stage-photo-img" src={photo.url} alt={photo.caption || 'Foto do casamento'} loading="lazy" />
            </button>
          ) : (
            <div className="stage-photo-unavailable"><ImageIcon size={24} /><span>Prévia indisponível</span></div>
          )}
          {(photo.emoji || photo.caption) && (
            <div className="stage-photo-caption">
              {photo.emoji && <span>{photo.emoji}</span>}
              {photo.caption && <p>{photo.caption}</p>}
            </div>
          )}
          {photo.status === 'pending' && <span className="stage-photo-pending-label">Aguardando aprovação</span>}
          <div className="stage-photo-meta">
            <span>{new Date(photo.created_at).toLocaleDateString('pt-BR')}</span>
            {onDelete && (
              <button className="stage-icon-button stage-delete-button" type="button" onClick={() => onDelete(photo)} aria-label="Excluir foto" title="Excluir foto">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function GuestApp() {
  const { settings: eventSettings, refreshSettings } = useEventSettings();
  const [health, setHealth] = useState({ state: 'checking', supabaseConfigured: false });
  const [guest, setGuest] = useState(null);
  const [activeTab, setActiveTab] = useState(() => window.location.pathname.replace(/\/+$/, '') === '/story' ? 'story' : 'participar');
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [nameStatus, setNameStatus] = useState('idle');
  const [phoneStatus, setPhoneStatus] = useState('idle');
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState(null);
  const [myPhotos, setMyPhotos] = useState([]);
  const [stories, setStories] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [storiesError, setStoriesError] = useState('');
  const [viewerPhotoId, setViewerPhotoId] = useState(null);
  const [viewerSource, setViewerSource] = useState('story');
  const viewerPhotos = viewerSource === 'story' ? stories : myPhotos;
  const closePhotoViewer = useCallback(() => setViewerPhotoId(null), []);
  const movePhotoViewer = useCallback((photo) => setViewerPhotoId(photo.id), []);

  const loadHealth = useCallback(async () => {
    try {
      const data = await readApiResponse(await fetchWithRetry('/api/health', { headers: { Accept: 'application/json', 'Cache-Control': 'no-store' }, cache: 'no-store' }));
      setHealth({ state: 'online', supabaseConfigured: Boolean(data.supabaseConfigured) });
    } catch {
      setHealth({ state: 'offline', supabaseConfigured: false });
    }
  }, []);

  const loadMyPhotos = useCallback(async () => {
    try {
      const data = await readApiResponse(await fetchWithRetry('/api/guests/me/photos', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }));
      setMyPhotos(data.photos || []);
    } catch (error) {
      if (error.status === 401) setMyPhotos([]);
      else setMessage({ type: 'error', text: error.message });
    }
  }, []);

  const loadStories = useCallback(async () => {
    setStoriesError('');
    try {
      const data = await readApiResponse(await fetchWithRetry('/api/photos/stories', { cache: 'no-store', headers: { Accept: 'application/json' } }));
      const uniquePhotos = [...new Map((data.photos || []).map((photo) => [photo.id, photo])).values()];
      setStories(uniquePhotos);
    } catch (error) {
      // Mantém a última lista válida para que uma falha temporária não apague a galeria visível.
      setStoriesError(`${error.message} Estamos mantendo as fotos já carregadas e tentaremos novamente.`);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    loadHealth();
    fetch('/api/guests/me', { credentials: 'same-origin' })
      .then(async (response) => {
        if (response.status === 401) return null;
        return readApiResponse(response);
      })
      .then((data) => {
        if (ignore || !data?.guest) return;
        setGuest(data.guest);
        if (window.location.pathname.replace(/\/+$/, '') !== '/story') setActiveTab('participar');
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) loadStories();
      });
    return () => { ignore = true; };
  }, [loadHealth, loadStories]);

  useEffect(() => {
    if (guest) loadMyPhotos();
  }, [guest, loadMyPhotos]);

  useEffect(() => {
    if (activeTab !== 'story') return undefined;
    const interval = Math.max(5, Number(eventSettings.story_refresh_seconds) || 10) * 1000;
    const timer = window.setInterval(() => { loadStories(); refreshSettings(); }, interval);
    return () => window.clearInterval(timer);
  }, [activeTab, eventSettings.story_refresh_seconds, loadStories, refreshSettings]);

  useEffect(() => {
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 2) {
      setNameStatus('idle');
      return undefined;
    }

    let ignore = false;
    setNameStatus('checking');
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetchWithRetry(`/api/guests/check-name?name=${encodeURIComponent(trimmed)}`, { cache: 'no-store' });
        const data = await readApiResponse(response);
        if (!ignore) setNameStatus(data.available ? 'available' : 'unavailable');
      } catch (error) {
        if (!ignore) setNameStatus(error.code === 'SUPABASE_NOT_CONFIGURED' ? 'error' : 'error');
      }
    }, 450);

    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [name]);

  useEffect(() => {
    const raw = whatsapp.trim();
    if (!raw) {
      setPhoneStatus('idle');
      return undefined;
    }

    const digits = normalizePhoneInput(raw);
    if (![10, 11].includes(digits.length)) {
      setPhoneStatus('invalid');
      return undefined;
    }

    let ignore = false;
    setPhoneStatus('checking');
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetchWithRetry(`/api/guests/check-phone?whatsapp=${encodeURIComponent(digits)}`, { cache: 'no-store' });
        const data = await readApiResponse(response);
        if (!ignore) setPhoneStatus(data.available ? 'available' : 'unavailable');
      } catch {
        if (!ignore) setPhoneStatus('error');
      }
    }, 450);

    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [whatsapp]);

  const handleRegister = async (event) => {
    event.preventDefault();
    setMessage(null);
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    if (normalizedName.length < 2) {
      setMessage({ type: 'error', text: 'Informe seu nome completo para continuar.' });
      return;
    }
    if (nameStatus === 'unavailable') {
      setMessage({ type: 'error', text: 'Este nome já está cadastrado. Confira a grafia ou fale com o responsável pelo casamento.' });
      return;
    }

    const normalizedPhone = normalizePhoneInput(whatsapp);
    if (![10, 11].includes(normalizedPhone.length)) {
      setMessage({ type: 'error', text: 'Informe um WhatsApp com DDD e número válido para poder recuperar seu acesso depois.' });
      return;
    }
    if (phoneStatus === 'unavailable') {
      setMessage({ type: 'error', text: 'Este WhatsApp já está cadastrado. Use “Acessar minhas fotos” para recuperar seu acesso.' });
      return;
    }

    setRegistering(true);
    try {
      const data = await readApiResponse(await fetch('/api/guests', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: normalizedName, whatsapp: normalizedPhone }),
      }));
      setGuest(data.guest);
      setActiveTab('participar');
      setMessage({ type: 'success', text: `Tudo certo, ${data.guest.name}! Agora você já pode tirar sua foto.` });
      setName('');
      setWhatsapp('');
      await loadMyPhotos();
    } catch (error) {
      if (error.status === 409 && error.field === 'name') setNameStatus('unavailable');
      if (error.status === 409 && error.field === 'whatsapp') setPhoneStatus('unavailable');
      setMessage({ type: 'error', text: error.message });
    } finally {
      setRegistering(false);
    }
  };

  const handleRecoverSession = async (event) => {
    event.preventDefault();
    setMessage(null);
    const digits = recoveryPhone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    if (![10, 11].includes(digits.length)) {
      setMessage({ type: 'error', text: 'Informe DDD e número de telefone com 10 ou 11 dígitos.' });
      return;
    }

    setRecovering(true);
    try {
      const recoveryResult = await readApiResponse(await fetchWithRetry('/api/guests/recover-session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ whatsapp: digits }),
      }, { retries: 1, baseDelayMs: 600, maxDelayMs: 1800 }));

      const sessionResponse = await fetchWithRetry('/api/guests/me', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }, { retries: 1, baseDelayMs: 400, maxDelayMs: 1200 });

      if (sessionResponse.ok) {
        const sessionData = await readApiResponse(sessionResponse);
        setGuest(sessionData.guest);
        setRecoveryMode(false);
        setRecoveryPhone('');
        setActiveTab('galeria');
        setMessage({ type: 'success', text: `Acesso recuperado. Aqui estão suas fotos, ${sessionData.guest.name}.` });
        await loadMyPhotos();
      } else {
        // A API mantém resposta genérica para não revelar se há cadastro para o telefone.
        // Não mostre sucesso quando GET /me não confirma uma sessão válida.
        setMessage({
          type: 'error',
          text: 'Não conseguimos abrir sua sessão neste navegador. Confira se informou o mesmo DDD e número usado no cadastro. Se continuar sem acesso, peça ajuda à organização do casamento.',
        });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Não foi possível recuperar o acesso agora. Verifique a conexão e tente novamente.' });
    } finally {
      setRecovering(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/guests/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      setGuest(null);
      setMyPhotos([]);
      setActiveTab('participar');
      setMessage({ type: 'success', text: 'A sessão deste navegador foi encerrada.' });
    }
  };

  const handleDeletePhoto = async (photo) => {
    if (!window.confirm('Deseja excluir esta foto da sua galeria e do story compartilhado?')) return;
    try {
      await readApiResponse(await fetch(`/api/photos/${encodeURIComponent(photo.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      }));
      setMyPhotos((previous) => previous.filter((item) => item.id !== photo.id));
      await loadStories();
      setMessage({ type: 'success', text: 'Foto excluída.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  return (
    <div className="app-shell stage-shell">
      <header className="topbar stage-topbar">
        <a className="brand" href="#inicio" aria-label="Nosso Story, início" onClick={() => setActiveTab('participar')}>
          <span className="brand-mark">{eventSettings.logo_url ? <img className="stage-logo-image" src={eventSettings.logo_url} alt="Logo do evento" /> : <Heart size={19} strokeWidth={1.8} />}</span>
          <span className="brand-name">nosso<span>story</span></span>
        </a>
        <div className="topbar-note"><span className="topbar-dot" /> {eventSettings.couple_names || 'UMA HISTÓRIA FEITA POR TODOS NÓS'}</div>
        {guest ? (
          <button className="stage-account-button" type="button" onClick={handleLogout} title="Encerrar sessão">
            <UserRound size={16} /><span>{guest.name}</span><LogOut size={14} />
          </button>
        ) : (
          <button
            className="topbar-link topbar-recovery-button"
            type="button"
            onClick={() => { setActiveTab('participar'); setRecoveryMode(true); setMessage(null); }}
          >
            <ShieldCheck size={15} /> Já tem cadastro? Acessar minhas fotos
          </button>
        )}
      </header>

      <main className="stage-main" id="inicio">
        <section className="stage-welcome">
          <div>
            <span className="eyebrow"><Sparkles size={14} /> {eventSettings.couple_names || 'CADA OLHAR CONTA UMA HISTÓRIA'}</span>
            <h1>O grande dia,<br />do jeito que <span>vocês viveram.</span></h1>
            <p>Registre os momentos espontâneos, escreva uma mensagem e compartilhe a lembrança com todos os convidados.</p>
          </div>
          <div className="stage-health-card">
            <div className="stage-health-heading">
              {health.state === 'online' ? <CheckCircle2 size={19} /> : health.state === 'offline' ? <AlertCircle size={19} /> : <LoaderCircle className="spin" size={19} />}
              <strong>{health.state === 'online' ? 'Aplicação conectada' : health.state === 'offline' ? 'API indisponível' : 'Conferindo conexão'}</strong>
            </div>
            <p>{health.supabaseConfigured ? 'A configuração do Supabase foi detectada pelo backend.' : 'O cadastro será habilitado depois de configurar as credenciais do Supabase.'}</p>
            <button className="stage-link-button" type="button" onClick={loadHealth}><RefreshCw size={13} /> Verificar novamente</button>
          </div>
        </section>

        <nav className="stage-tabs" aria-label="Navegação da aplicação">
          <button type="button" className={activeTab === 'participar' ? 'stage-tab active' : 'stage-tab'} onClick={() => { setActiveTab('participar'); setMessage(null); }}>
            {guest ? <Camera size={17} /> : <UserRound size={17} />}{guest ? 'Tirar minha foto' : 'Participar'}
          </button>
          <button type="button" className={activeTab === 'galeria' ? 'stage-tab active' : 'stage-tab'} onClick={() => { setActiveTab('galeria'); setMessage(null); if (guest) loadMyPhotos(); }}>
            <ImageIcon size={17} /> Minhas fotos {guest ? <span className="stage-tab-count">{myPhotos.length}</span> : null}
          </button>
          <button type="button" className={activeTab === 'story' ? 'stage-tab active' : 'stage-tab'} onClick={() => { setActiveTab('story'); setMessage(null); loadStories(); }}>
            <UsersRound size={17} /> Story do casamento
          </button>
        </nav>

        {message && (
          <div className={`stage-alert stage-alert-${message.type}`} role="status">
            {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{message.text}</span>
            <button type="button" aria-label="Fechar mensagem" onClick={() => setMessage(null)}><X size={15} /></button>
          </div>
        )}

        <section className="stage-content">
          {activeTab === 'participar' && !guest && (
            <div className="stage-register-layout">
              <div className="stage-section-copy">
                <span className="section-kicker">SEU LUGAR NESSA HISTÓRIA</span>
                <h2>Vamos começar<br />pelo seu nome.</h2>
                <p>O cadastro é rapidinho. Seu nome identifica as fotos que você compartilhar; o WhatsApp é obrigatório para permitir a recuperação do acesso e nunca será exibido publicamente.</p>
                <div className="stage-reassurance"><ShieldCheck size={17} /><span>Suas informações de contato ficam privadas.</span></div>
              </div>
              {!recoveryMode ? (
              <form className="stage-form-card" onSubmit={handleRegister}>
                <div className="stage-form-heading">
                  <span className="stage-form-icon"><Heart size={20} /></span>
                  <div><h3>Participar do casamento</h3><p>Preencha os campos abaixo para liberar a câmera.</p></div>
                </div>
                <button
                  className="guest-recovery-entry"
                  type="button"
                  onClick={() => { setRecoveryMode(true); setMessage(null); }}
                >
                  <span className="guest-recovery-entry-icon"><UserRound size={18} /></span>
                  <span className="guest-recovery-entry-copy">
                    <strong>Já tem cadastro? Acesse suas fotos</strong>
                    <small>Recupere seu acesso com DDD e número de telefone.</small>
                  </span>
                </button>
                <label className="stage-field-label" htmlFor="guest-name">Nome completo <span>*</span></label>
                <input
                  id="guest-name"
                  className={`stage-input ${nameStatus === 'unavailable' ? 'input-error' : ''}`}
                  name="name"
                  autoComplete="name"
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex.: Ana Paula Oliveira"
                  required
                  aria-describedby="name-feedback"
                />
                <div id="name-feedback" className={`stage-field-feedback ${nameStatus === 'unavailable' ? 'feedback-error' : nameStatus === 'available' ? 'feedback-success' : ''}`} aria-live="polite">
                  {nameStatus === 'checking' && <><LoaderCircle size={13} className="spin" /> Conferindo disponibilidade...</>}
                  {nameStatus === 'available' && <><CheckCircle2 size={13} /> Nome disponível</>}
                  {nameStatus === 'unavailable' && <><AlertCircle size={13} /> Este nome já está cadastrado.</>}
                  {nameStatus === 'error' && 'Não foi possível verificar agora; o servidor validará no envio.'}
                  {nameStatus === 'idle' && 'O nome precisa ser único neste casamento.'}
                </div>
                <label className="stage-field-label" htmlFor="guest-whatsapp">WhatsApp <span>*</span></label>
                <input
                  id="guest-whatsapp"
                  className={`stage-input ${phoneStatus === 'unavailable' || phoneStatus === 'invalid' ? 'input-error' : ''}`}
                  name="whatsapp"
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={24}
                  value={whatsapp}
                  onChange={(event) => setWhatsapp(event.target.value)}
                  placeholder="(71) 99999-9999"
                  required
                  aria-describedby="phone-feedback"
                />
                <div id="phone-feedback" className={`stage-field-feedback ${phoneStatus === 'unavailable' || phoneStatus === 'invalid' ? 'feedback-error' : phoneStatus === 'available' ? 'feedback-success' : ''}`} aria-live="polite">
                  {phoneStatus === 'checking' && <><LoaderCircle size={13} className="spin" /> Conferindo disponibilidade do telefone...</>}
                  {phoneStatus === 'available' && <><CheckCircle2 size={13} /> Telefone disponível para este cadastro</>}
                  {phoneStatus === 'unavailable' && <><AlertCircle size={13} /> Este telefone já está cadastrado. Recupere o acesso em vez de criar outra conta.</>}
                  {phoneStatus === 'invalid' && <><AlertCircle size={13} /> Informe DDD e número com 10 ou 11 dígitos.</>}
                  {phoneStatus === 'error' && 'Não foi possível conferir agora; o servidor validará o número ao cadastrar.'}
                  {phoneStatus === 'idle' && 'Obrigatório: este número permitirá recuperar suas fotos neste navegador se perder a sessão.'}
                </div>
                <button className="button button-primary stage-submit-button" type="submit" disabled={registering || nameStatus === 'unavailable' || nameStatus === 'checking' || phoneStatus === 'unavailable' || phoneStatus === 'checking' || phoneStatus === 'invalid' || name.trim().length < 2 || !whatsapp.trim() || health.state === 'offline'}>
                  {registering ? <><LoaderCircle size={17} className="spin" /> Cadastrando...</> : <>Continuar para a câmera <Camera size={17} /></>}
                </button>
                {!health.supabaseConfigured && health.state === 'online' && (
                  <p className="stage-setup-note">O backend está no ar, mas ainda falta configurar o Supabase para salvar cadastros e fotos.</p>
                )}
                <p className="stage-privacy-note">Ao continuar, você concorda que as fotos que publicar poderão aparecer na galeria compartilhada e no telão do casamento.</p>
              </form>
              ) : (
              <form className="stage-form-card" onSubmit={handleRecoverSession}>
                <div className="stage-form-heading">
                  <span className="stage-form-icon"><ShieldCheck size={20} /></span>
                  <div><h3>Recuperar meu acesso</h3><p>Informe o DDD e o número usado no cadastro.</p></div>
                </div>
                <label className="stage-field-label" htmlFor="recovery-phone">Telefone usado no cadastro (DDD + número) <span>*</span></label>
                <input
                  id="recovery-phone"
                  className="stage-input"
                  name="recovery-phone"
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={24}
                  value={recoveryPhone}
                  onChange={(event) => setRecoveryPhone(event.target.value)}
                  placeholder="(71) 99999-9999"
                  required
                />
                <p className="stage-privacy-note">Não é enviado código por WhatsApp. Por isso, qualquer pessoa que conheça esse número pode tentar recuperar a sessão correspondente. A resposta não confirma se o número está cadastrado.</p>
                <button className="button button-primary stage-submit-button" type="submit" disabled={recovering || ![10, 11].includes(recoveryPhone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').length)}>
                  {recovering ? <><LoaderCircle size={17} className="spin" /> Conferindo acesso...</> : <>Recuperar acesso <UserRound size={17} /></>}
                </button>
                <button className="stage-link-button recovery-switch-button" type="button" onClick={() => { setRecoveryMode(false); setRecoveryPhone(''); setMessage(null); }}>Voltar ao cadastro</button>
              </form>
              )}
            </div>
          )}

          {activeTab === 'participar' && guest && (
            <CameraStudio
              guest={guest}
              onUploaded={async (photo) => {
                await Promise.all([loadMyPhotos(), loadStories()]);
                setMessage({
                  type: 'success',
                  text: photo?.status === 'pending'
                    ? 'Foto enviada! Ela ficará na sua galeria e aparecerá no story após a aprovação do organizador.'
                    : 'Foto publicada! Ela já está na sua galeria e no story do casamento.',
                });
              }}
              setGlobalMessage={setMessage}
            />
          )}

          {activeTab === 'galeria' && (
            <div className="stage-gallery-section">
              <div className="stage-section-title-row">
                <div><span className="section-kicker">SUAS LEMBRANÇAS</span><h2>Minhas fotos</h2><p>{guest ? `Fotos compartilhadas por ${guest.name}.` : 'Cadastre-se para ver e gerenciar as fotos da sua sessão.'}</p></div>
                {guest && <button className="stage-secondary-button" type="button" onClick={loadMyPhotos}><RefreshCw size={15} /> Atualizar</button>}
              </div>
              {guest ? <PhotoGrid photos={myPhotos} emptyTitle="Sua galeria está esperando" emptyDescription="Tire sua primeira foto para começar a guardar os momentos deste dia." onDelete={handleDeletePhoto} layout={eventSettings.gallery_layout} onOpen={(photo) => { setViewerSource('mine'); setViewerPhotoId(photo.id); }} /> : (
                <div className="stage-empty"><span className="stage-empty-icon"><UserRound size={26} /></span><h3>Entre para ver suas fotos</h3><p>O cadastro associa cada foto à sua sessão neste navegador.</p><button className="button button-primary" type="button" onClick={() => setActiveTab('participar')}>Participar agora</button></div>
              )}
            </div>
          )}

          {activeTab === 'story' && (
            <div className="stage-gallery-section">
              <div className="stage-section-title-row">
                <div><span className="section-kicker">MEMÓRIAS COMPARTILHADAS</span><h2>Story do casamento</h2><p>As fotos publicadas pelos convidados, reunidas em um só lugar. Atualiza automaticamente a cada {eventSettings.story_refresh_seconds || 10} segundos.</p></div>
                <div className="stage-section-title-actions">
                  <a className="stage-secondary-button" href="/telao"><Monitor size={15} /> Abrir telão</a>
                  <a className="stage-secondary-button" href="/qr"><QrCode size={15} /> QR Code</a>
                  <button className="stage-secondary-button" type="button" onClick={loadStories}><RefreshCw size={15} /> Atualizar</button>
                </div>
              </div>
              {storiesError && <div className="stage-inline-warning" role="status"><AlertCircle size={18} /><span>{storiesError}</span><button type="button" className="stage-link-button" onClick={loadStories}>Tentar novamente</button></div>}
              <PhotoGrid photos={stories} emptyTitle="Ainda não há fotos publicadas" emptyDescription="Assim que os convidados compartilharem as primeiras lembranças, elas aparecerão aqui." layout={eventSettings.gallery_layout} onOpen={(photo) => { setViewerSource('story'); setViewerPhotoId(photo.id); }} />
            </div>
          )}
        </section>
      </main>

      {viewerPhotoId && <StoryViewer photos={viewerPhotos} activeId={viewerPhotoId} onClose={closePhotoViewer} onMove={movePhotoViewer} />}

      <footer className="footer stage-footer">
        <div className="section-wrap footer-inner">
          <a className="brand footer-brand" href="#inicio" onClick={() => setActiveTab('participar')}><span className="brand-mark"><Heart size={16} /></span><span className="brand-name">nosso<span>story</span></span></a>
          <span>Uma foto, uma lembrança, uma história inteira.</span>
          <span className="footer-version">VERSÃO 0.4 · SESSÕES, UPLOAD RESILIENTE E SINCRONIZAÇÃO</span>
        </div>
      </footer>
    </div>
  );
}

function CameraStudio({ guest, onUploaded, setGlobalMessage }) {
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturedImage, setCapturedImage] = useState('');
  const [filterKey, setFilterKey] = useState('natural');
  const [caption, setCaption] = useState('');
  const [emoji, setEmoji] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const uploadIdRef = useRef(null);
  const [facingMode, setFacingMode] = useState('user');

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
    setCameraBusy(false);
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  useEffect(() => () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
  }, []);

  const startCamera = async (mode = facingMode) => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Este navegador não disponibiliza a câmera. Abra a página por HTTPS ou escolha uma foto do dispositivo.');
      return;
    }
    stopCamera();
    setCameraBusy(true);
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: mode }, width: { ideal: 1600 }, height: { ideal: 1200 } },
      });
      streamRef.current = nextStream;
      setStream(nextStream);
    } catch (error) {
      setCameraError(error.name === 'NotAllowedError'
        ? 'O acesso à câmera foi bloqueado. Libere a permissão nas configurações do navegador e tente novamente.'
        : 'Não foi possível abrir a câmera neste dispositivo. Você também pode escolher uma foto da galeria.');
    } finally {
      setCameraBusy(false);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError('A câmera ainda está iniciando. Aguarde um instante e tente novamente.');
      return;
    }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('Não foi possível capturar a imagem neste navegador.');
      return;
    }
    if (facingMode === 'user') {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedImage(canvas.toDataURL('image/jpeg', 0.9));
    uploadIdRef.current = null;
    setUploadFailed(false);
    setCameraError('');
    stopCamera();
  };

  const handleChooseFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setCameraError('Selecione uma imagem JPEG, PNG ou WebP.');
      event.target.value = '';
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setCameraError('A imagem selecionada deve ter no máximo 15 MB antes da edição.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCapturedImage(String(reader.result));
      uploadIdRef.current = null;
      setUploadFailed(false);
      setCameraError('');
      stopCamera();
    };
    reader.onerror = () => setCameraError('Não foi possível ler a imagem selecionada.');
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handlePublish = async () => {
    if (!capturedImage || uploading) return;
    setUploading(true);
    setUploadFailed(false);
    setCameraError('');
    try {
      const blob = await createEditedJpeg(capturedImage, filterKey, caption, emoji);
      const params = new URLSearchParams({ filter: filterKey, caption: caption.slice(0, 100), emoji: emoji.slice(0, 16) });
      if (!uploadIdRef.current) {
        uploadIdRef.current = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
            const random = Math.floor(Math.random() * 16);
            return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
          });
      }
      const uploadResult = await readApiResponse(await fetchWithRetry(`/api/photos?${params.toString()}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'image/jpeg',
          Accept: 'application/json',
          'Idempotency-Key': uploadIdRef.current,
        },
        body: blob,
      }, { retries: 2, baseDelayMs: 650, maxDelayMs: 3000 }));
      setCapturedImage('');
      setCaption('');
      setEmoji('');
      setFilterKey('natural');
      setUploadFailed(false);
      uploadIdRef.current = null;
      await onUploaded(uploadResult.photo);
    } catch (error) {
      setUploadFailed(true);
      setCameraError(error.message || 'Não foi possível enviar a foto. Ela continua nesta tela; tente novamente.');
      if (error.status === 401) setGlobalMessage({ type: 'error', text: 'Sua sessão expirou. Recupere o acesso pelo telefone usado no cadastro.' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="stage-camera-layout">
      <div className="stage-camera-copy">
        <span className="section-kicker">OLÁ, {guest.name.toLocaleUpperCase('pt-BR')}</span>
        <h2>Vamos guardar<br />esse momento?</h2>
        <p>Abra a câmera, tire uma foto e personalize com uma cor, uma mensagem ou um emoji antes de compartilhar.</p>
        <div className="stage-camera-steps">
          <span><b>1</b> Capture</span><span><b>2</b> Personalize</span><span><b>3</b> Publique</span>
        </div>
        <div className="stage-reassurance"><ShieldCheck size={17} /><span>Você pode excluir sua foto da galeria depois.</span></div>
      </div>

      <div className="stage-studio-card">
        {!capturedImage ? (
          <>
            <div className={`stage-camera-view ${stream ? 'camera-is-live' : ''}`}>
              {stream ? <video ref={videoRef} className={`stage-camera-video ${facingMode === 'user' ? 'video-selfie' : ''}`} playsInline muted autoPlay /> : (
                <div className="stage-camera-placeholder"><span className="stage-camera-big-icon"><Camera size={32} /></span><strong>Sua próxima lembrança começa aqui</strong><span>Permita o acesso à câmera quando o navegador solicitar.</span></div>
              )}
              {stream && <div className="stage-camera-live-label"><span /> CÂMERA ATIVA</div>}
            </div>
            {cameraError && <div className="stage-inline-error"><AlertCircle size={16} /><span>{cameraError}</span></div>}
            <div className="stage-camera-controls">
              {!stream ? (
                <button className="button button-primary stage-capture-button" type="button" onClick={() => startCamera()} disabled={cameraBusy}>
                  {cameraBusy ? <LoaderCircle size={18} className="spin" /> : <Camera size={18} />}
                  {cameraBusy ? 'Abrindo câmera...' : 'Abrir câmera'}
                </button>
              ) : (
                <>
                  <button className="button button-primary stage-capture-button" type="button" onClick={capturePhoto}><Camera size={18} /> Tirar foto</button>
                  <button className="stage-secondary-button" type="button" onClick={() => { const next = facingMode === 'user' ? 'environment' : 'user'; setFacingMode(next); startCamera(next); }}>Trocar câmera</button>
                  <button className="stage-icon-button" type="button" onClick={stopCamera} aria-label="Fechar câmera"><CameraOff size={17} /></button>
                </>
              )}
              <span className="stage-control-separator">ou</span>
              <button type="button" className="stage-secondary-button" onClick={() => fileInputRef.current?.click()}><ImageIcon size={16} /> Escolher foto</button>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="stage-visually-hidden" onChange={handleChooseFile} />
            </div>
          </>
        ) : (
          <>
            <div className="stage-preview-header"><div><span className="section-kicker">PRÉ-VISUALIZAÇÃO</span><h3>Gostou do resultado?</h3></div><button className="stage-icon-button" type="button" onClick={() => { setCapturedImage(''); uploadIdRef.current = null; setUploadFailed(false); setCameraError(''); }} aria-label="Cancelar edição" disabled={uploading}><X size={17} /></button></div>
            <div className="stage-photo-preview">
              <img src={capturedImage} alt="Prévia da fotografia" style={{ filter: (FILTERS.find((item) => item.key === filterKey) || FILTERS[0]).css }} />
              {(caption.trim() || emoji) && <div className="stage-preview-overlay"><span>{emoji}</span>{caption.trim() && <p>{caption.trim()}</p>}</div>}
            </div>
            <div className="stage-filter-row" aria-label="Filtros da fotografia">
              {FILTERS.map((filter) => (
                <button key={filter.key} type="button" className={`stage-filter-chip ${filterKey === filter.key ? 'selected' : ''}`} disabled={uploading} onClick={() => { if (uploadFailed && filterKey !== filter.key) uploadIdRef.current = null; setFilterKey(filter.key); setUploadFailed(false); }}>
                  <span className="stage-filter-swatch" style={{ filter: filter.css }}><img src={capturedImage} alt="" /></span>{filter.label}
                </button>
              ))}
            </div>
            <label className="stage-field-label" htmlFor="photo-caption">Mensagem na foto <span className="optional">(opcional)</span></label>
            <textarea id="photo-caption" className="stage-input stage-caption-input" maxLength={100} rows={2} value={caption} disabled={uploading} onChange={(event) => { if (uploadFailed) uploadIdRef.current = null; setCaption(event.target.value); setUploadFailed(false); }} placeholder="Uma lembrança para guardar..." />
            <div className="stage-emoji-label">Escolha um emoji</div>
            <div className="stage-emoji-row">
              {EMOJIS.map((item) => <button key={item} type="button" className={`stage-emoji-button ${emoji === item ? 'selected' : ''}`} disabled={uploading} onClick={() => { if (uploadFailed) uploadIdRef.current = null; setEmoji(emoji === item ? '' : item); setUploadFailed(false); }} aria-label={`Adicionar emoji ${item}`}>{item}</button>)}
            </div>
            {cameraError && <div className="stage-inline-error"><AlertCircle size={16} /><span>{cameraError}</span></div>}
            <div className="stage-preview-actions">
              <button className="stage-secondary-button" type="button" onClick={() => { setCapturedImage(''); setCaption(''); setEmoji(''); setCameraError(''); setUploadFailed(false); uploadIdRef.current = null; }} disabled={uploading}><X size={15} /> Cancelar</button>
              <button className="button button-primary stage-publish-button" type="button" onClick={handlePublish} disabled={uploading}>
                {uploading ? <><LoaderCircle size={17} className="spin" /> Enviando...</> : uploadFailed ? <><RefreshCw size={16} /> Tentar novamente</> : <><Send size={16} /> Publicar foto</>}
              </button>
            </div>
            <p className="stage-privacy-note">A foto editada será salva na sua galeria e exibida no story compartilhado.</p>
          </>
        )}
      </div>
    </div>
  );
}

function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/admin') return <AdminPage />;
  if (path === '/telao') return <SlideshowPage />;
  if (path === '/qr') return <QrPage />;
  return <GuestApp />;
}

export default App;
