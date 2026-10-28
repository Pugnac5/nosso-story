import { Router } from 'express';
import { getSupabaseAdmin, getStorageBucketName } from '../lib/supabase.js';

const router = Router();

const DEFAULT_SETTINGS = {
  couple_names: 'Nosso casamento',
  logo_path: null,
  primary_color: '#A64E68',
  background_color: '#FBF8F4',
  text_color: '#30272C',
  slideshow_interval_seconds: 7,
  slideshow_transition: 'fade',
  story_refresh_seconds: 10,
  gallery_layout: 'grid',
  auto_publish: true,
};

export async function getPublicSettings() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ...DEFAULT_SETTINGS, logo_url: null };

  const { data, error } = await supabase
    .from('app_settings')
    .select('couple_names, logo_path, primary_color, background_color, text_color, slideshow_interval_seconds, slideshow_transition, story_refresh_seconds, gallery_layout, auto_publish')
    .eq('id', true)
    .maybeSingle();

  if (error) throw error;
  const settings = { ...DEFAULT_SETTINGS, ...(data ?? {}) };
  let logoUrl = null;
  if (settings.logo_path) {
    const { data: signed, error: signedError } = await supabase.storage
      .from(getStorageBucketName())
      .createSignedUrl(settings.logo_path, 60 * 60 * 24);
    if (signedError) console.error('Falha ao gerar URL temporária do logo:', signedError.message);
    logoUrl = signed?.signedUrl ?? null;
  }

  return {
    couple_names: settings.couple_names,
    logo_url: logoUrl,
    primary_color: settings.primary_color,
    background_color: settings.background_color,
    text_color: settings.text_color,
    slideshow_interval_seconds: settings.slideshow_interval_seconds,
    slideshow_transition: settings.slideshow_transition,
    story_refresh_seconds: settings.story_refresh_seconds,
    gallery_layout: settings.gallery_layout,
    auto_publish: settings.auto_publish,
  };
}

router.get('/', async (_req, res, next) => {
  try {
    return res.json({ settings: await getPublicSettings() });
  } catch (error) {
    return next(error);
  }
});

export default router;
