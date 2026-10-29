import express, { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin, getStorageBucketName } from '../lib/supabase.js';
import { requireGuestSession } from '../lib/guest-session.js';

const router = Router();
const ALLOWED_FILTERS = new Set(['natural', 'warm', 'mono', 'rose', 'soft']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CAPTION_LENGTH = 100;
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isDuplicateStorageObject(error) {
  const status = String(error?.statusCode || error?.status || '');
  const message = String(error?.message || error?.error || '');
  return status === '409' || /already exists|duplicate|alreadyexist/i.test(message);
}

async function attachSignedUrl(photo, bucket) {
  const supabase = getSupabaseAdmin();
  const { data: signed, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(photo.storage_path, SIGNED_URL_TTL_SECONDS);
  if (error) console.error('Falha ao gerar URL temporária de foto:', error.message);
  const { idempotency_key: _idempotencyKey, ...publicPhotoFields } = photo;
  return { ...publicPhotoFields, url: signed?.signedUrl ?? null };
}

async function findIdempotentPhoto(supabase, guestId, idempotencyKey) {
  const { data, error } = await supabase
    .from('photos')
    .select('id, storage_path, caption, emoji, filter_key, status, created_at, idempotency_key')
    .eq('guest_id', guestId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

router.post('/', requireGuestSession(), async (req, res, next) => {
  // Apenas JPEGs exportados pelo editor são aceitos. O nome do arquivo do cliente não é usado.
  const readJpeg = express.raw({ type: 'image/jpeg', limit: MAX_IMAGE_BYTES });
  readJpeg(req, res, async (bodyError) => {
    if (bodyError) return next(bodyError);

    try {
      if (!Buffer.isBuffer(req.body) || req.body.length < 4) {
        return res.status(400).json({ error: 'Envie uma fotografia JPEG válida.', code: 'PHOTO_INVALID' });
      }
      if (req.body.length > MAX_IMAGE_BYTES) {
        return res.status(413).json({ error: 'A foto deve ter no máximo 8 MB.', code: 'PHOTO_TOO_LARGE' });
      }
      if (req.body[0] !== 0xff || req.body[1] !== 0xd8 || req.body[2] !== 0xff || req.body[req.body.length - 2] !== 0xff || req.body[req.body.length - 1] !== 0xd9) {
        return res.status(415).json({ error: 'O arquivo recebido não corresponde a uma imagem JPEG.', code: 'PHOTO_INVALID_TYPE' });
      }

      // A mesma chave é reutilizada em tentativas de rede da mesma publicação. Se uma resposta
      // se perder depois de o banco gravar, a repetição recupera a foto existente em vez de duplicá-la.
      const rawIdempotencyKey = String(req.get('Idempotency-Key') || '').trim();
      const idempotencyKey = rawIdempotencyKey || randomUUID(); // Compatibilidade com clientes v0.3.
      if (!UUID_PATTERN.test(idempotencyKey)) {
        return res.status(400).json({ error: 'Identificador de envio inválido. Atualize a página e tente novamente.', code: 'PHOTO_INVALID_IDEMPOTENCY_KEY' });
      }

      const rawCaption = String(req.query.caption ?? '').trim();
      const caption = Array.from(rawCaption).slice(0, MAX_CAPTION_LENGTH).join('');
      const emoji = Array.from(String(req.query.emoji ?? '').trim()).slice(0, 16).join('');
      const requestedFilter = String(req.query.filter ?? 'natural');
      const filterKey = ALLOWED_FILTERS.has(requestedFilter) ? requestedFilter : 'natural';
      const supabase = getSupabaseAdmin();
      const bucket = getStorageBucketName();

      const existing = await findIdempotentPhoto(supabase, req.guest.id, idempotencyKey);
      if (existing) {
        const photo = await attachSignedUrl(existing, bucket);
        return res.status(200).json({
          photo,
          alreadyReceived: true,
          message: 'Esta foto já havia sido recebida. Recuperamos a publicação existente.',
        });
      }

      const { data: appSettings, error: settingsError } = await supabase
        .from('app_settings')
        .select('auto_publish')
        .eq('id', true)
        .maybeSingle();
      if (settingsError) throw settingsError;
      const photoStatus = appSettings?.auto_publish === false ? 'pending' : 'published';
      const storagePath = `${req.guest.id}/${idempotencyKey}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, req.body, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false,
        });

      // Um conflito significa que uma tentativa anterior pode ter enviado o objeto e perdido
      // a resposta antes da gravação do registro. Nesse caso, seguimos para concluir o registro.
      if (uploadError && !isDuplicateStorageObject(uploadError)) {
        console.error('Falha ao enviar imagem ao Supabase Storage:', uploadError.message);
        return res.status(502).json({
          error: 'Não foi possível salvar a imagem. Confira a conexão e tente novamente.',
          code: 'PHOTO_STORAGE_FAILED',
          retryable: true,
        });
      }

      const { data: photoRow, error: insertError } = await supabase
        .from('photos')
        .insert({
          guest_id: req.guest.id,
          storage_path: storagePath,
          idempotency_key: idempotencyKey,
          caption: caption || null,
          emoji: emoji || null,
          filter_key: filterKey,
          status: photoStatus,
        })
        .select('id, storage_path, caption, emoji, filter_key, status, created_at, idempotency_key')
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          const duplicate = await findIdempotentPhoto(supabase, req.guest.id, idempotencyKey);
          if (duplicate) {
            const recoveredPhoto = await attachSignedUrl(duplicate, bucket);
            return res.status(200).json({
              photo: recoveredPhoto,
              alreadyReceived: true,
              message: 'Esta foto já havia sido recebida. Recuperamos a publicação existente.',
            });
          }
        }

        // Em erros de banco, remove o arquivo apenas quando esta tentativa informou que o upload
        // foi novo. Se o objeto já existia, mantemos para permitir que uma repetição conclua a operação.
        if (!uploadError) {
          const { error: cleanupError } = await supabase.storage.from(bucket).remove([storagePath]);
          if (cleanupError) console.error('Falha ao limpar upload sem registro:', cleanupError.message);
        }
        throw insertError;
      }

      const photo = await attachSignedUrl(photoRow, bucket);
      return res.status(201).json({
        photo,
        alreadyReceived: false,
        message: photoStatus === 'published'
          ? 'Foto publicada.'
          : 'Foto enviada e aguardando aprovação do organizador.',
      });
    } catch (error) {
      return next(error);
    }
  });
});

router.get('/stories', async (_req, res, next) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: 'O banco de dados ainda não está configurado.', code: 'SUPABASE_NOT_CONFIGURED', retryable: true });
  }

  try {
    const { data, error } = await supabase
      .from('photos')
      .select('id, storage_path, caption, emoji, filter_key, created_at, guests(name)')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    const bucket = getStorageBucketName();
    const photos = await Promise.all((data ?? []).map(async (photo) => {
      const { data: signed, error: signedError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(photo.storage_path, SIGNED_URL_TTL_SECONDS);
      if (signedError) console.error('Falha ao gerar URL de story:', signedError.message);
      return {
        id: photo.id,
        caption: photo.caption,
        emoji: photo.emoji,
        filter_key: photo.filter_key,
        created_at: photo.created_at,
        guest_name: photo.guests?.name ?? 'Convidado',
        url: signed?.signedUrl ?? null,
      };
    }));

    res.set('Cache-Control', 'no-store');
    return res.json({ photos });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:photoId', requireGuestSession(), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const bucket = getStorageBucketName();
    const { data: photo, error: lookupError } = await supabase
      .from('photos')
      .select('id, storage_path')
      .eq('id', req.params.photoId)
      .eq('guest_id', req.guest.id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!photo) return res.status(404).json({ error: 'Foto não encontrada nesta galeria.' });

    const { error: removeError } = await supabase.storage.from(bucket).remove([photo.storage_path]);
    if (removeError) throw removeError;

    const { error: deleteError } = await supabase.from('photos').delete().eq('id', photo.id).eq('guest_id', req.guest.id);
    if (deleteError) throw deleteError;
    return res.status(200).json({ status: 'deleted' });
  } catch (error) {
    return next(error);
  }
});

export default router;
