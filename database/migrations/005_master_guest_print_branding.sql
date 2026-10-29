-- Nosso Story v0.5 — lista de convidados, impressão em lote e identidade visual expandida.
-- Execute no SQL Editor do Supabase ANTES de publicar o código v0.5.
-- Migração aditiva: não apaga convidados nem fotos.

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS event_tagline text NOT NULL DEFAULT 'CADA OLHAR CONTA UMA HISTÓRIA',
  ADD COLUMN IF NOT EXISTS hero_title text NOT NULL DEFAULT 'O grande dia,',
  ADD COLUMN IF NOT EXISTS hero_highlight text NOT NULL DEFAULT 'do jeito que vocês viveram.',
  ADD COLUMN IF NOT EXISTS hero_description text NOT NULL DEFAULT 'Registre os momentos espontâneos, escreva uma mensagem e compartilhe a lembrança com todos os convidados.',
  ADD COLUMN IF NOT EXISTS registration_title text NOT NULL DEFAULT 'Vamos começar pelo seu nome.',
  ADD COLUMN IF NOT EXISTS registration_description text NOT NULL DEFAULT 'O cadastro é rapidinho. Seu nome identifica as fotos que você compartilhar; o WhatsApp é obrigatório para permitir a recuperação do acesso e nunca será exibido publicamente.',
  ADD COLUMN IF NOT EXISTS registration_form_title text NOT NULL DEFAULT 'Participar do casamento',
  ADD COLUMN IF NOT EXISTS registration_form_description text NOT NULL DEFAULT 'Preencha os campos abaixo para liberar a câmera.',
  ADD COLUMN IF NOT EXISTS footer_text text NOT NULL DEFAULT 'Uma foto, uma lembrança, uma história inteira.',
  ADD COLUMN IF NOT EXISTS font_preset text NOT NULL DEFAULT 'editorial',
  ADD COLUMN IF NOT EXISTS spacing_preset text NOT NULL DEFAULT 'comfortable',
  ADD COLUMN IF NOT EXISTS background_preset text NOT NULL DEFAULT 'plain',
  ADD COLUMN IF NOT EXISTS card_style text NOT NULL DEFAULT 'soft';

ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_font_preset_check;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_font_preset_check
  CHECK (font_preset IN ('editorial', 'modern', 'classic', 'rounded'));

ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_spacing_preset_check;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_spacing_preset_check
  CHECK (spacing_preset IN ('compact', 'comfortable', 'airy'));

ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_background_preset_check;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_background_preset_check
  CHECK (background_preset IN ('plain', 'soft-gradient', 'warm'));

ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_card_style_check;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_card_style_check
  CHECK (card_style IN ('soft', 'outlined', 'flat'));

ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_event_tagline_length_check;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_event_tagline_length_check
  CHECK (char_length(event_tagline) BETWEEN 1 AND 80);
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_hero_title_length_check;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_hero_title_length_check
  CHECK (char_length(hero_title) BETWEEN 1 AND 100);
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_hero_highlight_length_check;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_hero_highlight_length_check
  CHECK (char_length(hero_highlight) BETWEEN 1 AND 100);
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_hero_description_length_check;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_hero_description_length_check
  CHECK (char_length(hero_description) BETWEEN 1 AND 400);
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_registration_title_length_check;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_registration_title_length_check
  CHECK (char_length(registration_title) BETWEEN 1 AND 120);
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_registration_description_length_check;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_registration_description_length_check
  CHECK (char_length(registration_description) BETWEEN 1 AND 400);
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_registration_form_title_length_check;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_registration_form_title_length_check
  CHECK (char_length(registration_form_title) BETWEEN 1 AND 100);
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_registration_form_description_length_check;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_registration_form_description_length_check
  CHECK (char_length(registration_form_description) BETWEEN 1 AND 250);
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_footer_text_length_check;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_footer_text_length_check
  CHECK (char_length(footer_text) BETWEEN 1 AND 160);

UPDATE public.app_settings
SET updated_at = now()
WHERE id = true;
