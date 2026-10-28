-- Nosso Story v0.3: painel master, configuração do telão e upload de logo.
-- Execute esta migração no SQL Editor do Supabase antes de publicar a v0.3.

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS slideshow_transition text NOT NULL DEFAULT 'fade';

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS story_refresh_seconds integer NOT NULL DEFAULT 10;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS gallery_layout text NOT NULL DEFAULT 'grid';

ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_slideshow_transition_check;
ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_slideshow_transition_check
  CHECK (slideshow_transition IN ('fade', 'slide', 'zoom'));

ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_story_refresh_seconds_check;
ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_story_refresh_seconds_check
  CHECK (story_refresh_seconds BETWEEN 5 AND 60);

ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_gallery_layout_check;
ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_gallery_layout_check
  CHECK (gallery_layout IN ('grid', 'compact'));

-- O bucket continua privado. Liberamos os tipos usados nos arquivos de marca;
-- as fotos de convidados continuam sendo validadas e enviadas como JPEG pelo backend.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('wedding-photos', 'wedding-photos', false, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 8388608,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- Sem policies públicas: upload, leitura e moderação permanecem no Express.
