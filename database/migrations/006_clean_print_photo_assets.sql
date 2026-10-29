-- Nosso Story v0.5.1: guardar uma versão sem legenda/emoji para impressão.
-- A versão publicada do story continua em storage_path.
-- Fotos anteriores a esta migração ficam com NULL e não podem ser impressas sem overlays,
-- pois a versão antiga já tinha a legenda/emoji gravada nos pixels.

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS print_storage_path text;

COMMENT ON COLUMN public.photos.print_storage_path IS
  'Caminho de uma cópia JPEG limpa, sem legenda/emoji sobrepostos, usada apenas para impressão administrativa.';
