import { REACTION_EMOJIS } from '../lib/photoPresentation.js';

export default function ReactionBar({ photo, canReact = false, onReact, compact = false }) {
  const counts = photo?.reactions || {};
  const hasAny = Object.values(counts).some((count) => Number(count) > 0);
  return (
    <div className={`photo-reaction-bar ${compact ? 'photo-reaction-bar-compact' : ''}`} aria-label="Reações à foto">
      {REACTION_EMOJIS.map((emoji) => {
        const count = Number(counts[emoji] || 0);
        if (!canReact && !count && !hasAny) return null;
        return (
          <button
            key={emoji}
            type="button"
            className={`photo-reaction-button ${photo?.my_reaction === emoji ? 'selected' : ''}`}
            onClick={() => onReact?.(photo, emoji)}
            disabled={!canReact || photo?.status === 'pending'}
            title={canReact ? `Reagir com ${emoji}` : 'Entre no casamento para reagir'}
            aria-label={`${emoji}, ${count} reações`}
            aria-pressed={photo?.my_reaction === emoji}
          >
            <span>{emoji}</span>{count > 0 && <small>{count}</small>}
          </button>
        );
      })}
      {!canReact && !hasAny && <span className="photo-reaction-hint">Entre para reagir</span>}
    </div>
  );
}
