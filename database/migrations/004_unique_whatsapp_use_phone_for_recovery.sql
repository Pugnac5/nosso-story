-- Nosso Story v0.4.4 — usar guests.whatsapp como campo único de recuperação.
-- IMPORTANTE: normaliza números antigos e mantém o telefone somente no cadastro mais antigo
-- quando encontra duplicatas. Não apaga convidados nem fotos; apenas remove o telefone dos
-- cadastros duplicados para estabelecer uma relação única entre telefone e convidado.
-- A coluna legada phone_recovery_key fica temporariamente para compatibilidade com o Render
-- v0.4.3 até que o novo código seja publicado.
-- Execute no SQL Editor do Supabase ANTES de publicar o código v0.4.4.

BEGIN;

-- Converte números para DDD + número nacional (10/11 dígitos). Valores inválidos ficam NULL.
WITH digitized AS (
  SELECT
    id,
    regexp_replace(coalesce(whatsapp, ''), '[^0-9]', '', 'g') AS digits
  FROM public.guests
), normalized AS (
  SELECT
    id,
    CASE
      WHEN length(digits) IN (12, 13) AND left(digits, 2) = '55'
        THEN substring(digits FROM 3)
      WHEN length(digits) IN (10, 11)
        THEN digits
      ELSE NULL
    END AS national_phone
  FROM digitized
)
UPDATE public.guests AS g
SET whatsapp = n.national_phone
FROM normalized AS n
WHERE g.id = n.id
  AND g.whatsapp IS DISTINCT FROM n.national_phone;

-- Resolve números duplicados já presentes no banco de testes/versões anteriores.
-- Mantém o telefone no convidado mais antigo; nos outros, coloca whatsapp = NULL.
-- Os registros de convidados e suas fotos NÃO são excluídos.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY whatsapp
      ORDER BY created_at ASC, id ASC
    ) AS phone_rank
  FROM public.guests
  WHERE whatsapp IS NOT NULL
)
UPDATE public.guests AS g
SET whatsapp = NULL, phone_recovery_key = NULL
FROM ranked AS r
WHERE r.id = g.id
  AND r.phone_rank > 1;

-- A API nova usa somente guests.whatsapp. Mantemos a coluna legada phone_recovery_key
-- temporariamente para que o backend v0.4.3 já ativo no Render continue funcionando
-- durante a janela de deploy. Nos registros duplicados, limpamos também a chave legada.
-- Ela poderá ser removida numa migração de limpeza após confirmar o deploy v0.4.4.
-- Garante formato canônico e unicidade no próprio WhatsApp.
ALTER TABLE public.guests
  DROP CONSTRAINT IF EXISTS guests_whatsapp_check;
ALTER TABLE public.guests
  DROP CONSTRAINT IF EXISTS guests_whatsapp_valid_length_check;
ALTER TABLE public.guests
  ADD CONSTRAINT guests_whatsapp_valid_length_check
  CHECK (whatsapp IS NULL OR whatsapp ~ '^[0-9]{10,11}$');

CREATE UNIQUE INDEX IF NOT EXISTS guests_whatsapp_uidx
  ON public.guests (whatsapp)
  WHERE whatsapp IS NOT NULL;

COMMIT;
