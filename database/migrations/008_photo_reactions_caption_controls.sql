-- Nosso Story v0.6: caption presentation metadata and guest reactions.
-- Apply after migrations 001-007. Existing photo files are not changed.

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS caption_position text NOT NULL DEFAULT 'bottom',
  ADD COLUMN IF NOT EXISTS caption_color text NOT NULL DEFAULT '#FFFFFF',
  ADD COLUMN IF NOT EXISTS caption_size text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS caption_render_mode text NOT NULL DEFAULT 'baked';

ALTER TABLE public.photos
  DROP CONSTRAINT IF EXISTS photos_caption_position_check,
  ADD CONSTRAINT photos_caption_position_check
    CHECK (caption_position IN ('top', 'center', 'bottom')),
  DROP CONSTRAINT IF EXISTS photos_caption_color_check,
  ADD CONSTRAINT photos_caption_color_check
    CHECK (caption_color ~ '^#[0-9A-Fa-f]{6}$'),
  DROP CONSTRAINT IF EXISTS photos_caption_size_check,
  ADD CONSTRAINT photos_caption_size_check
    CHECK (caption_size IN ('small', 'medium', 'large')),
  DROP CONSTRAINT IF EXISTS photos_caption_render_mode_check,
  ADD CONSTRAINT photos_caption_render_mode_check
    CHECK (caption_render_mode IN ('baked', 'dom'));

-- Legacy photos keep caption_render_mode=baked so the UI does not draw their
-- caption/emoji a second time. New v0.6 uploads use DOM overlays instead.
CREATE TABLE IF NOT EXISTS public.photo_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('❤️', '🥰', '😂', '👏', '😍', '🎉', '🤍', '🔥')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT photo_reactions_photo_guest_key UNIQUE (photo_id, guest_id)
);

CREATE INDEX IF NOT EXISTS photo_reactions_photo_id_idx
  ON public.photo_reactions (photo_id);
CREATE INDEX IF NOT EXISTS photo_reactions_guest_id_idx
  ON public.photo_reactions (guest_id);

ALTER TABLE public.photo_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.photo_reactions FROM anon, authenticated;
GRANT ALL ON TABLE public.photo_reactions TO service_role;

COMMENT ON COLUMN public.photos.caption_render_mode IS
  'baked for legacy images with text drawn into pixels; dom for v0.6 metadata overlays';
