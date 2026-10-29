-- Nosso Story v0.4 — sessões renováveis, recuperação por telefone e uploads idempotentes.
-- Execute no SQL Editor do Supabase antes de publicar o código v0.4.
-- Esta migração não remove fotos nem convidados. Números antigos normalizáveis são
-- convertidos para DDD + número; números duplicados ficam sem chave de recuperação.

BEGIN;

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS session_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone_recovery_key text;

-- Concede uma nova janela de sessão aos registros existentes durante a migração.
UPDATE public.guests
SET session_expires_at = now() + interval '30 days'
WHERE session_expires_at IS NULL;

ALTER TABLE public.guests
  ALTER COLUMN session_expires_at SET DEFAULT (now() + interval '30 days'),
  ALTER COLUMN session_expires_at SET NOT NULL;

-- Normaliza números antigos para o padrão brasileiro de 10/11 dígitos.
-- Aceita valor nacional ou +55/55 + DDD e número. Valores não interpretáveis são preservados
-- para consulta administrativa, mas não poderão ser usados para recuperação automática.
WITH phone_digits AS (
  SELECT id,
         regexp_replace(coalesce(whatsapp, ''), '[^0-9]', '', 'g') AS digits
  FROM public.guests
  WHERE whatsapp IS NOT NULL
), normalized AS (
  SELECT id,
         CASE
           WHEN length(digits) IN (12, 13) AND left(digits, 2) = '55' THEN substring(digits FROM 3)
           WHEN length(digits) IN (10, 11) THEN digits
           ELSE NULL
         END AS national_phone
  FROM phone_digits
)
UPDATE public.guests AS g
SET whatsapp = n.national_phone
FROM normalized AS n
WHERE g.id = n.id
  AND n.national_phone IS NOT NULL;

-- Só vincula a recuperação automaticamente quando o telefone pertence a exatamente um
-- cadastro. Números compartilhados/duplicados permanecem sem phone_recovery_key.
WITH phone_digits AS (
  SELECT id,
         regexp_replace(coalesce(whatsapp, ''), '[^0-9]', '', 'g') AS digits
  FROM public.guests
  WHERE whatsapp IS NOT NULL
), normalized AS (
  SELECT id,
         CASE
           WHEN length(digits) IN (12, 13) AND left(digits, 2) = '55' THEN substring(digits FROM 3)
           WHEN length(digits) IN (10, 11) THEN digits
           ELSE NULL
         END AS national_phone
  FROM phone_digits
), unique_phones AS (
  SELECT national_phone
  FROM normalized
  WHERE national_phone IS NOT NULL
  GROUP BY national_phone
  HAVING count(*) = 1
)
UPDATE public.guests AS g
SET phone_recovery_key = n.national_phone
FROM normalized AS n
JOIN unique_phones AS u ON u.national_phone = n.national_phone
WHERE g.id = n.id
  AND g.phone_recovery_key IS NULL;

ALTER TABLE public.guests
  DROP CONSTRAINT IF EXISTS guests_phone_recovery_key_length_check;
ALTER TABLE public.guests
  ADD CONSTRAINT guests_phone_recovery_key_length_check
  CHECK (phone_recovery_key IS NULL OR char_length(phone_recovery_key) IN (10, 11));

CREATE UNIQUE INDEX IF NOT EXISTS guests_phone_recovery_key_uidx
  ON public.guests (phone_recovery_key)
  WHERE phone_recovery_key IS NOT NULL;

-- Chave de idempotência que identifica uma mesma intenção de publicação de um convidado.
ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS photos_guest_idempotency_key_uidx
  ON public.photos (guest_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMIT;
