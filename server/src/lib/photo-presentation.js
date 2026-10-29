export const REACTION_EMOJIS = ['❤️', '🥰', '😂', '👏', '😍', '🎉', '🤍', '🔥'];
const CAPTION_POSITIONS = new Set(['top', 'center', 'bottom']);
const CAPTION_SIZES = new Set(['small', 'medium', 'large']);

export function normalizeCaptionPosition(value) {
  const position = String(value ?? '').trim().toLowerCase();
  return CAPTION_POSITIONS.has(position) ? position : 'bottom';
}

export function normalizeCaptionSize(value) {
  const size = String(value ?? '').trim().toLowerCase();
  return CAPTION_SIZES.has(size) ? size : 'medium';
}

export function normalizeCaptionColor(value) {
  const color = String(value ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toUpperCase() : '#FFFFFF';
}

export function isAllowedReactionEmoji(value) {
  return REACTION_EMOJIS.includes(String(value ?? ''));
}

export function summarizeReactions(photos, rows, viewerGuestId = null) {
  const grouped = new Map();
  for (const row of rows ?? []) {
    if (!grouped.has(row.photo_id)) grouped.set(row.photo_id, { reactions: {}, my_reaction: null });
    const summary = grouped.get(row.photo_id);
    summary.reactions[row.emoji] = (summary.reactions[row.emoji] || 0) + 1;
    if (viewerGuestId && row.guest_id === viewerGuestId) summary.my_reaction = row.emoji;
  }
  return (photos ?? []).map((photo) => {
    const summary = grouped.get(photo.id) || { reactions: {}, my_reaction: null };
    return { ...photo, reactions: summary.reactions, my_reaction: summary.my_reaction };
  });
}
