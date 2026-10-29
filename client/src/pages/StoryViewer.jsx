import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, Expand } from 'lucide-react';
import ReactionBar from '../components/ReactionBar.jsx';

export default function StoryViewer({ photos, activeId, onClose, onMove, canReact = false, onReact }) {
  const viewerRef = useRef(null);
  const touchStartRef = useRef(null);
  const index = photos.findIndex((photo) => photo.id === activeId);
  const photo = index >= 0 ? photos[index] : null;
  const hasDomCaption = photo?.caption_render_mode === 'dom' || !photo?.caption_render_mode;
  const captionStyle = photo ? {
    color: photo.caption_color || '#FFFFFF',
    '--caption-font-size': photo.caption_size === 'small' ? 'clamp(12px, 1.8vw, 17px)' : photo.caption_size === 'large' ? 'clamp(19px, 3.2vw, 30px)' : 'clamp(15px, 2.4vw, 24px)',
  } : undefined;

  useEffect(() => {
    if (!photo) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && photos.length > 1) onMove(photos[(index - 1 + photos.length) % photos.length]);
      if (event.key === 'ArrowRight' && photos.length > 1) onMove(photos[(index + 1) % photos.length]);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [photo, photos, index, onClose, onMove]);

  if (!photo) return null;
  const previous = () => onMove(photos[(index - 1 + photos.length) % photos.length]);
  const next = () => onMove(photos[(index + 1) % photos.length]);
  const onTouchStart = (event) => {
    const touch = event.changedTouches?.[0];
    if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const onTouchEnd = (event) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches?.[0];
    touchStartRef.current = null;
    if (!start || !touch || photos.length < 2) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    if (dx < 0) next(); else previous();
  };
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await viewerRef.current?.requestFullscreen?.();
      else await document.exitFullscreen?.();
    } catch {
      // O modo imersivo continua utilizável mesmo quando fullscreen é bloqueado.
    }
  };

  return (
    <div className="story-viewer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="story-viewer" role="dialog" aria-modal="true" aria-label="Visualizador de foto" ref={viewerRef}>
        <header className="story-viewer-toolbar">
          <span>{index + 1} / {photos.length}</span>
          <div className="story-viewer-toolbar-actions">
            <button type="button" className="story-viewer-icon" onClick={toggleFullscreen} aria-label="Alternar tela cheia" title="Tela cheia"><Expand size={18} /></button>
            <button type="button" className="story-viewer-icon" onClick={onClose} aria-label="Fechar foto"><X size={22} /></button>
          </div>
        </header>
        {photos.length > 1 && <button type="button" className="story-viewer-nav story-viewer-prev" onClick={previous} aria-label="Foto anterior"><ChevronLeft size={30} /></button>}
        <div className="story-viewer-image-wrap" key={photo.id} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {photo.url ? (
            <>
              <img
                className={`story-viewer-image-background filter-${photo.filter_key || 'natural'}`}
                src={photo.url}
                alt=""
                aria-hidden="true"
                draggable="false"
              />
              <img
                className={`story-viewer-image story-viewer-image-main filter-${photo.filter_key || 'natural'}`}
                src={photo.url}
                alt={photo.caption || 'Foto do casamento'}
                draggable="false"
              />
            </>
          ) : <div className="story-viewer-missing">Prévia indisponível</div>}
          {hasDomCaption && (photo.emoji || photo.caption) && (
            <div className={`story-viewer-caption caption-position-${photo.caption_position || 'bottom'} caption-size-${photo.caption_size || 'medium'}`} style={captionStyle}>
              {hasDomCaption && photo.emoji && <span className="story-viewer-emoji">{photo.emoji}</span>}
              {hasDomCaption && photo.caption && <p>{photo.caption}</p>}
            </div>
          )}
        </div>
        {photos.length > 1 && <button type="button" className="story-viewer-nav story-viewer-next" onClick={next} aria-label="Próxima foto"><ChevronRight size={30} /></button>}
        {canReact && <footer className="story-viewer-reactions"><ReactionBar photo={photo} canReact={canReact} onReact={onReact} /></footer>}
      </section>
    </div>
  );
}
