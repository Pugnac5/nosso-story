import express, { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin, getStorageBucketName } from '../lib/supabase.js';
import { requireGuestSession } from '../lib/guest-session.js';

const router = Router();
const ALLOWED_FILTERS = new Set(['natural', 'warm', 'mono', 'rose', 'soft']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CAPTION_LENGTH = 100;

router.post('/', requireGuestSession(), async (req, res, next) => {
  // O frontend exporta um JPEG da imagem já editada. Não aceitamos arquivo executável
  // nem confiamos no nome de arquivo enviado pelo navegador.
  const readJpeg = express.raw({ type: 'image/jpeg', limit: MAX_IMAGE_BYTES });
  readJpeg(req, res, async (bodyError) => {
    if (bodyError) return next(bodyError);

    try {
      if (!Buffer.isBuffer(req.body) || req.body.length < 4) {
        return res.status(400).json({ error: 'Envie uma fotografia JPEG válida.' });
      }
      if (req.body.length > MAX_IMAGE_BYTES) {
        return res.status(413).json({ error: 'A foto deve ter no máximo 8 MB.' });
      }
      if (req.body[0] !== 0xff || req.body[1] !== 0xd8 || req.body[2] !== 0xff) {
        return res.status(415).json({ error: 'O arquivo recebido não corresponde a uma imagem JPEG.' });
      }

      const rawCaption = String(req.query.caption ?? '').trim();
      const caption = Array.from(rawCaption).slice(0, MAX_CAPTION_LENGTH).join('');
      const emoji = Array.from(String(req.query.emoji ?? '').trim()).slice(0, 8).join('');
      const filterKey = ALLOWED_FILTERS.has(String(req.query.filter ?? 'natural'))
        ? String(req.query.filter ?? 'natural')
        : 'natural';
      const supabase = getSupabaseAdmin();
      const bucket = getStorageBucketName();
      const { data: appSettings, error: settingsError } = await supabase
        .from('app_settings')
        .select('auto_publish')
        .eq('id', true)
        .maybeSingle();
      if (settingsError) throw settingsError;
      const photoStatus = appSettings?.auto_publish === false ? 'pending' : 'published';
      const storagePath = `${req.guest.id}/${randomUUID()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, req.body, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('Falha ao enviar imagem ao Supabase Storage:', uploadError.message);
        return res.status(502).json({
          error: 'Não foi possível salvar a imagem. Confira se o bucket wedding-photos foi criado pela migração SQL.',
          code: 'PHOTO_STORAGE_FAILED',
        });
      }

      const { data: photo, error: insertError } = await supabase
        .from('photos')
        .insert({
          guest_id: req.guest.id,
          storage_path: storagePath,
          caption: caption || null,
          emoji: emoji || null,
          filter_key: filterKey,
          status: photoStatus,
        })
        .select('id, storage_path, caption, emoji, filter_key, status, created_at')
        .single();

      if (insertError) {
        // Tenta remover o objeto se o registro no banco falhar, evitando arquivo órfão.
        await supabase.storage.from(bucket).remove([storagePath]);
        throw insertError;
      }

      const { data: signed, error: signedError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, 60 * 60 * 24);
      if (signedError) console.error('Foto salva, mas não foi possível gerar URL temporária:', signedError.message);

      return res.status(201).json({
        photo: { ...photo, url: signed?.signedUrl ?? null },
        message: photoStatus === 'published' ? 'Foto publicada.' : 'Foto enviada e aguardando aprovação do organizador.',
      });
    } catch (error) {
      return next(error);
    }
  });
});

router.get('/stories', async (_req, res, next) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: 'O banco de dados ainda não está configurado.', code: 'SUPABASE_NOT_CONFIGURED' });
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
        .createSignedUrl(photo.storage_path, 60 * 60 * 24);
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
