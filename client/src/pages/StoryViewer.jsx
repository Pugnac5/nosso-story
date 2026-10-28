import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, UserRound, CalendarDays } from 'lucide-react';

export default function StoryViewer({ photos, activeId, onClose, onMove }) {
  const index = photos.findIndex((photo) => photo.id === activeId);
  const photo = index >= 0 ? photos[index] : null;

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

  return (
    <div className="story-viewer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="story-viewer" role="dialog" aria-modal="true" aria-label="Visualizador de foto">
        <header className="story-viewer-toolbar">
          <span>{index + 1} / {photos.length}</span>
          <button type="button" className="story-viewer-icon" onClick={onClose} aria-label="Fechar foto"><X size={22} /></button>
        </header>
        {photos.length > 1 && <button type="button" className="story-viewer-nav story-viewer-prev" onClick={previous} aria-label="Foto anterior"><ChevronLeft size={30} /></button>}
        <div className="story-viewer-image-wrap" key={photo.id}>
          {photo.url ? <img className={`story-viewer-image filter-${photo.filter_key || 'natural'}`} src={photo.url} alt={photo.caption || 'Foto do casamento'} /> : <div className="story-viewer-missing">Prévia indisponível</div>}
          {(photo.emoji || photo.caption || photo.guest_name) && (
            <div className="story-viewer-caption">
              {photo.emoji && <span className="story-viewer-emoji">{photo.emoji}</span>}
              {photo.caption && <p>{photo.caption}</p>}
              <small><UserRound size={13} /> {photo.guest_name || 'Convidado'} <span>·</span> <CalendarDays size={13} /> {new Date(photo.created_at).toLocaleDateString('pt-BR')}</small>
            </div>
          )}
        </div>
        {photos.length > 1 && <button type="button" className="story-viewer-nav story-viewer-next" onClick={next} aria-label="Próxima foto"><ChevronRight size={30} /></button>}
      </section>
    </div>
  );
}
