import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, Heart, LoaderCircle, Pause, Play, RefreshCw, QrCode } from 'lucide-react';
import { useEventSettings } from '../lib/useEventSettings.js';
import { fetchWithRetry } from '../lib/fetchWithRetry.js';

async function fetchStories() {
  const response = await fetchWithRetry('/api/photos/stories', { cache: 'no-store', headers: { Accept: 'application/json', 'Cache-Control': 'no-store' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar as fotos.');
  return payload.photos || [];
}

export default function SlideshowPage() {
  const { settings, refreshSettings } = useEventSettings();
  const [photos, setPhotos] = useState([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [imageFailedId, setImageFailedId] = useState(null);
  const requestInFlightRef = useRef(false);
  const activePhotoIdRef = useRef(null);
  const currentPhoto = photos[index] || null;

  useEffect(() => { activePhotoIdRef.current = currentPhoto?.id || null; }, [currentPhoto]);

  // Precarrega a próxima foto para que a transição não mostre uma área vazia.
  useEffect(() => {
    if (photos.length < 2 || !currentPhoto) return undefined;
    const nextPhoto = photos[(index + 1) % photos.length];
    if (!nextPhoto?.url) return undefined;
    const image = new Image();
    image.decoding = 'async';
    image.src = nextPhoto.url;
    return () => { image.onload = null; image.onerror = null; };
  }, [currentPhoto?.id, index, photos]);

  useEffect(() => {
    setImageFailedId(null);
  }, [currentPhoto?.id, currentPhoto?.url]);

  useEffect(() => {
    if (!imageFailedId || photos.length < 2) return undefined;
    const timer = window.setTimeout(() => {
      setIndex((current) => photos.length ? (current + 1) % photos.length : 0);
      setImageFailedId(null);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [imageFailedId, photos.length]);

  const loadStories = useCallback(async () => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    try {
      const responsePhotos = await fetchStories();
      const nextPhotos = [...new Map(responsePhotos.map((photo) => [photo.id, photo])).values()];
      setPhotos(nextPhotos);
      setIndex((previousIndex) => {
        if (!nextPhotos.length) return 0;
        const currentId = activePhotoIdRef.current;
        const preservedIndex = currentId ? nextPhotos.findIndex((photo) => photo.id === currentId) : -1;
        return preservedIndex >= 0 ? preservedIndex : Math.min(previousIndex, nextPhotos.length - 1);
      });
      setError('');
    } catch (fetchError) {
      // Mantém o último conjunto conhecido durante uma falha transitória da API/rede.
      setError(fetchError.message || 'Conexão temporariamente indisponível. Tentaremos novamente.');
    } finally {
      requestInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStories();
    const timer = window.setInterval(() => { loadStories(); refreshSettings(); }, Math.max(5, settings.story_refresh_seconds || 10) * 1000);
    return () => window.clearInterval(timer);
  }, [loadStories, refreshSettings, settings.story_refresh_seconds]);

  useEffect(() => {
    if (!playing || photos.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % photos.length);
    }, Math.max(3, settings.slideshow_interval_seconds || 7) * 1000);
    return () => window.clearInterval(timer);
  }, [playing, photos.length, settings.slideshow_interval_seconds]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'ArrowRight') setIndex((current) => photos.length ? (current + 1) % photos.length : 0);
      if (event.key === 'ArrowLeft') setIndex((current) => photos.length ? (current - 1 + photos.length) % photos.length : 0);
      if (event.code === 'Space' && event.target?.tagName !== 'BUTTON') {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [photos.length]);

  const go = (direction) => setIndex((current) => photos.length ? (current + direction + photos.length) % photos.length : 0);
  const requestFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      else await document.exitFullscreen?.();
    } catch {
      setError('O navegador não permitiu abrir tela cheia. Use o modo de tela cheia do próprio navegador.');
    }
  };

  return (
    <main className={`slideshow-page transition-${settings.slideshow_transition || 'fade'}`}>
      <div className="slideshow-topbar">
        <a href="/" className="slideshow-brand"><span className="slideshow-brand-mark">{settings.logo_url ? <img src={settings.logo_url} alt="Logo do evento" /> : <Heart size={18} />}</span><span>{settings.couple_names || 'Nosso casamento'}</span></a>
        <div className="slideshow-top-actions">
          <span className="slideshow-live-indicator"><span /> APRESENTAÇÃO AO VIVO</span>
          <a href="/qr" className="slideshow-top-link"><QrCode size={15} /> QR Code</a>
          <button type="button" className="slideshow-icon-button" onClick={loadStories} title="Atualizar fotos" aria-label="Atualizar fotos"><RefreshCw size={16} /></button>
          <button type="button" className="slideshow-icon-button" onClick={requestFullscreen} title="Alternar tela cheia" aria-label="Alternar tela cheia"><Expand size={16} /></button>
        </div>
      </div>

      <section className="slideshow-stage" aria-live="polite">
        {error && photos.length > 0 && <div className="slideshow-status-warning" role="status">Conexão instável. Mantendo a apresentação e tentando atualizar as fotos.</div>}
        {loading ? (
          <div className="slideshow-empty"><LoaderCircle size={30} className="spin" /><p>Carregando lembranças...</p></div>
        ) : error && !photos.length ? (
          <div className="slideshow-empty"><p>{error}</p><button type="button" onClick={loadStories}>Tentar novamente</button></div>
        ) : !currentPhoto ? (
          <div className="slideshow-empty"><span className="slideshow-empty-icon"><Heart size={32} /></span><h1>As lembranças estão chegando</h1><p>Quando os convidados publicarem fotos, elas aparecerão aqui automaticamente.</p><button type="button" onClick={loadStories}><RefreshCw size={16} /> Verificar novamente</button></div>
        ) : (
          <article className={`slideshow-photo slideshow-photo-${settings.slideshow_transition || 'fade'}`} key={currentPhoto.id}>
            {currentPhoto.url && imageFailedId !== currentPhoto.id ? (
              <>
                <img className="slideshow-photo-background" src={currentPhoto.url} alt="" aria-hidden="true" onError={() => setImageFailedId(currentPhoto.id)} />
                <img className="slideshow-photo-main" src={currentPhoto.url} alt={currentPhoto.caption || 'Foto do casamento'} onError={() => setImageFailedId(currentPhoto.id)} />
              </>
            ) : <div className="slideshow-image-fallback"><p>Esta foto está temporariamente indisponível.</p>{photos.length > 1 && <button type="button" onClick={() => go(1)}>Próxima foto</button>}</div>}
            {(currentPhoto.caption_render_mode === 'dom' || !currentPhoto.caption_render_mode) && (currentPhoto.emoji || currentPhoto.caption) && (
              <div className={`slideshow-photo-caption caption-position-${currentPhoto.caption_position || 'bottom'} caption-size-${currentPhoto.caption_size || 'medium'}`} style={{ color: currentPhoto.caption_color || '#FFFFFF', '--caption-color': currentPhoto.caption_color || '#FFFFFF', '--caption-font-size': currentPhoto.caption_size === 'small' ? 'clamp(12px, 1.8vw, 17px)' : currentPhoto.caption_size === 'large' ? 'clamp(19px, 3.2vw, 30px)' : 'clamp(18px, 3vw, 34px)' }}>
                {currentPhoto.emoji && <span className="slideshow-emoji">{currentPhoto.emoji}</span>}
                {currentPhoto.caption && <p>{currentPhoto.caption}</p>}
              </div>
            )}
          </article>
        )}
      </section>

      <footer className="slideshow-footer">
        <div className="slideshow-count">{photos.length ? `${String(index + 1).padStart(2, '0')} / ${String(photos.length).padStart(2, '0')}` : '00 / 00'}<span> · atualização automática</span></div>
        <div className="slideshow-controls">
          <button type="button" onClick={() => go(-1)} disabled={photos.length < 2} aria-label="Foto anterior"><ChevronLeft size={20} /></button>
          <button type="button" className="slideshow-play-button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pausar apresentação' : 'Retomar apresentação'}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
          <button type="button" onClick={() => go(1)} disabled={photos.length < 2} aria-label="Próxima foto"><ChevronRight size={20} /></button>
        </div>
        <div className="slideshow-interval"><Heart size={14} /> {settings.footer_text || 'Uma história feita por todos nós'} <span>· {settings.slideshow_interval_seconds || 7}s por foto</span></div>
      </footer>
    </main>
  );
}
