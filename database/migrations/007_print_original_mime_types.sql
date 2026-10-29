-- Nosso Story v0.5.2: permite escolher originais limpos em JPEG, PNG ou WebP.
-- O limite permanece em 8 MiB, compatível com a interface e a API.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[],
    file_size_limit = 8388608
WHERE id = 'wedding-photos';

-- Verificação opcional após executar:
-- SELECT id, allowed_mime_types, file_size_limit FROM storage.buckets WHERE id = 'wedding-photos';
