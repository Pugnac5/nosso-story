import { getSupabaseAdmin } from './supabase.js';
import { summarizeReactions } from './photo-presentation.js';

export async function attachPhotoReactionSummaries(photos, viewerGuestId = null) {
  if (!photos?.length) return [];
  const supabase = getSupabaseAdmin();
  const ids = [...new Set(photos.map((photo) => photo.id).filter(Boolean))];
  if (!supabase || !ids.length) return summarizeReactions(photos, [], viewerGuestId);

  const { data, error } = await supabase
    .from('photo_reactions')
    .select('photo_id, guest_id, emoji')
    .in('photo_id', ids);
  if (error) throw error;
  return summarizeReactions(photos, data ?? [], viewerGuestId);
}

export async function getPhotoReactionSummary(photoId, viewerGuestId = null) {
  const photos = await attachPhotoReactionSummaries([{ id: photoId }], viewerGuestId);
  return photos[0] ?? { id: photoId, reactions: {}, my_reaction: null };
}
