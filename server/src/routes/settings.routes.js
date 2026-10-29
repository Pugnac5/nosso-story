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
  event_tagline: 'CADA OLHAR CONTA UMA HISTÓRIA',
  hero_title: 'O grande dia,',
  hero_highlight: 'do jeito que vocês viveram.',
  hero_description: 'Registre os momentos espontâneos, escreva uma mensagem e compartilhe a lembrança com todos os convidados.',
  registration_title: 'Vamos começar pelo seu nome.',
  registration_description: 'O cadastro é rapidinho. Seu nome identifica as fotos que você compartilhar; o WhatsApp é obrigatório para permitir a recuperação do acesso e nunca será exibido publicamente.',
  registration_form_title: 'Participar do casamento',
  registration_form_description: 'Preencha os campos abaixo para liberar a câmera.',
  footer_text: 'Uma foto, uma lembrança, uma história inteira.',
  font_preset: 'editorial',
  spacing_preset: 'comfortable',
  background_preset: 'plain',
  card_style: 'soft',
};

export async function getPublicSettings() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ...DEFAULT_SETTINGS, logo_url: null };

  const { data, error } = await supabase
    .from('app_settings')
    .select('couple_names, logo_path, primary_color, background_color, text_color, slideshow_interval_seconds, slideshow_transition, story_refresh_seconds, gallery_layout, auto_publish, event_tagline, hero_title, hero_highlight, hero_description, registration_title, registration_description, registration_form_title, registration_form_description, footer_text, font_preset, spacing_preset, background_preset, card_style')
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
    event_tagline: settings.event_tagline,
    hero_title: settings.hero_title,
    hero_highlight: settings.hero_highlight,
    hero_description: settings.hero_description,
    registration_title: settings.registration_title,
    registration_description: settings.registration_description,
    registration_form_title: settings.registration_form_title,
    registration_form_description: settings.registration_form_description,
    footer_text: settings.footer_text,
    font_preset: settings.font_preset,
    spacing_preset: settings.spacing_preset,
    background_preset: settings.background_preset,
    card_style: settings.card_style,
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
