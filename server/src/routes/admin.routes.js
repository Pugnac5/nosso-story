import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { getSupabaseAdmin, getStorageBucketName } from '../lib/supabase.js';
import {
  clearAdminLoginFailures,
  clearAdminSessionCookie,
  createAdminSessionToken,
  getAdminLoginBlockSeconds,
  isAdminAuthConfigured,
  isAdminRequest,
  registerAdminLoginFailure,
  requireAdmin,
  setAdminSessionCookie,
  verifyAdminPassword,
} from '../lib/admin-session.js';
import { getPublicSettings } from './settings.routes.js';

const router = Router();
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const COLOR_FIELDS = ['primary_color', 'background_color', 'text_color'];
const VALID_TRANSITIONS = new Set(['fade', 'slide', 'zoom']);
const VALID_GALLERY_LAYOUTS = new Set(['grid', 'compact']);
const VALID_FONT_PRESETS = new Set(['editorial', 'modern', 'classic', 'rounded']);
const VALID_SPACING_PRESETS = new Set(['compact', 'comfortable', 'airy']);
const VALID_BACKGROUND_PRESETS = new Set(['plain', 'soft-gradient', 'warm']);
const VALID_CARD_STYLES = new Set(['soft', 'outlined', 'flat']);
const VALID_STATUSES = new Set(['pending', 'published', 'hidden']);

function adminConfiguredResponse(res) {
  if (isAdminAuthConfigured()) return false;
  res.status(503).json({
    error: 'Configure ADMIN_PASSWORD e ADMIN_SESSION_SECRET no ambiente do backend para habilitar o painel master.',
    code: 'ADMIN_NOT_CONFIGURED',
  });
  return true;
}

function validColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function requireSameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    const parsedOrigin = new URL(origin);
    const expectedOrigin = `${req.protocol}://${req.get('host')}`;
    if (parsedOrigin.origin === expectedOrigin) return next();
    const localDevelopmentOrigin = process.env.NODE_ENV !== 'production'
      && ['localhost', '127.0.0.1'].includes(parsedOrigin.hostname)
      && ['localhost', '127.0.0.1'].includes(req.hostname);
    if (localDevelopmentOrigin) return next();
    return res.status(403).json({ error: 'Origem da requisição não permitida.' });
  } catch {
    return res.status(403).json({ error: 'Origem da requisição inválida.' });
  }
}

function validateSettings(body) {
  const changes = {};
  if (Object.hasOwn(body, 'couple_names')) {
    const value = String(body.couple_names ?? '').trim();
    if (!value || value.length > 100) return { error: 'Informe os nomes dos noivos ou o título do evento (até 100 caracteres).' };
    changes.couple_names = value;
  }
  for (const key of COLOR_FIELDS) {
    if (Object.hasOwn(body, key)) {
      if (!validColor(body[key])) return { error: `A cor ${key} precisa estar no formato hexadecimal #RRGGBB.` };
      changes[key] = body[key].toUpperCase();
    }
  }
  if (Object.hasOwn(body, 'slideshow_interval_seconds')) {
    const value = Number(body.slideshow_interval_seconds);
    if (!Number.isInteger(value) || value < 3 || value > 30) return { error: 'O intervalo do telão deve ficar entre 3 e 30 segundos.' };
    changes.slideshow_interval_seconds = value;
  }
  if (Object.hasOwn(body, 'story_refresh_seconds')) {
    const value = Number(body.story_refresh_seconds);
    if (!Number.isInteger(value) || value < 5 || value > 60) return { error: 'A atualização automática deve ficar entre 5 e 60 segundos.' };
    changes.story_refresh_seconds = value;
  }
  if (Object.hasOwn(body, 'slideshow_transition')) {
    if (!VALID_TRANSITIONS.has(body.slideshow_transition)) return { error: 'Selecione uma transição válida para o telão.' };
    changes.slideshow_transition = body.slideshow_transition;
  }
  if (Object.hasOwn(body, 'gallery_layout')) {
    if (!VALID_GALLERY_LAYOUTS.has(body.gallery_layout)) return { error: 'Selecione um layout válido para a galeria.' };
    changes.gallery_layout = body.gallery_layout;
  }
  if (Object.hasOwn(body, 'auto_publish')) {
    if (typeof body.auto_publish !== 'boolean') return { error: 'A publicação automática deve ser verdadeira ou falsa.' };
    changes.auto_publish = body.auto_publish;
  }

  const textLimits = {
    event_tagline: 80,
    hero_title: 100,
    hero_highlight: 100,
    hero_description: 400,
    registration_title: 120,
    registration_description: 400,
    registration_form_title: 100,
    registration_form_description: 250,
    footer_text: 160,
  };
  for (const [key, maxLength] of Object.entries(textLimits)) {
    if (!Object.hasOwn(body, key)) continue;
    const value = String(body[key] ?? '').trim();
    if (!value || value.length > maxLength) {
      return { error: `O campo ${key} é obrigatório e aceita até ${maxLength} caracteres.` };
    }
    changes[key] = value;
  }

  const presetFields = [
    ['font_preset', VALID_FONT_PRESETS, 'Selecione uma tipografia válida.'],
    ['spacing_preset', VALID_SPACING_PRESETS, 'Selecione um espaçamento válido.'],
    ['background_preset', VALID_BACKGROUND_PRESETS, 'Selecione um fundo válido.'],
    ['card_style', VALID_CARD_STYLES, 'Selecione um estilo de card válido.'],
  ];
  for (const [key, allowed, message] of presetFields) {
    if (!Object.hasOwn(body, key)) continue;
    if (!allowed.has(body[key])) return { error: message };
    changes[key] = body[key];
  }

  if (!Object.keys(changes).length) return { error: 'Nenhuma configuração válida foi enviada.' };
  changes.updated_at = new Date().toISOString();
  return { changes };
}

function identifyLogo(buffer, contentType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
  if (contentType === 'image/jpeg' && buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (contentType === 'image/png' && buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { ext: 'png', type: 'image/png' };
  if (contentType === 'image/webp' && buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  return null;
}

function identifyPrintImage(buffer, contentType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
  if (contentType === 'image/jpeg' && buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9) {
    return { ext: 'jpg', type: 'image/jpeg' };
  }
  if (contentType === 'image/png' && buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { ext: 'png', type: 'image/png' };
  }
  if (contentType === 'image/webp' && buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { ext: 'webp', type: 'image/webp' };
  }
  return null;
}

async function signedPhotoRows(rows) {
  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucketName();
  return Promise.all((rows ?? []).map(async (photo) => {
    const { data: signed, error } = await supabase.storage.from(bucket).createSignedUrl(photo.storage_path, 60 * 60);
    if (error) console.error('Falha ao assinar foto do painel master:', error.message);
    let printSigned = null;
    if (photo.print_storage_path) {
      const { data, error: printError } = await supabase.storage.from(bucket).createSignedUrl(photo.print_storage_path, 60 * 60);
      if (printError) console.error('Falha ao assinar versão limpa para impressão:', printError.message);
      printSigned = data;
    }
    return {
      id: photo.id,
      storage_path: photo.storage_path,
      caption: photo.caption,
      emoji: photo.emoji,
      filter_key: photo.filter_key,
      status: photo.status,
      created_at: photo.created_at,
      guest_id: photo.guest_id ?? null,
      guest_name: photo.guest_name ?? photo.guests?.name ?? 'Convidado',
      url: signed?.signedUrl ?? null,
      print_url: printSigned?.signedUrl ?? null,
    };
  }));
}

router.get('/session', (req, res) => {
  return res.json({ configured: isAdminAuthConfigured(), authenticated: isAdminAuthConfigured() && isAdminRequest(req, res) });
});

router.post('/login', requireSameOrigin, (req, res) => {
  if (adminConfiguredResponse(res)) return;
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 120);
  const blockedSeconds = getAdminLoginBlockSeconds(ip);
  if (blockedSeconds > 0) {
    res.set('Retry-After', String(blockedSeconds));
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.', code: 'ADMIN_LOGIN_RATE_LIMITED' });
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password || password.length > 256 || !verifyAdminPassword(password)) {
    registerAdminLoginFailure(ip);
    return res.status(401).json({ error: 'Senha administrativa incorreta.' });
  }

  clearAdminLoginFailures(ip);
  setAdminSessionCookie(res, req, createAdminSessionToken());
  return res.json({ status: 'ok', authenticated: true });
});

router.post('/logout', requireSameOrigin, (req, res) => {
  clearAdminSessionCookie(res, req);
  return res.json({ status: 'ok' });
});

router.get('/settings', requireAdmin, async (_req, res, next) => {
  try {
    return res.json({ settings: await getPublicSettings() });
  } catch (error) {
    return next(error);
  }
});

router.patch('/settings', requireAdmin, requireSameOrigin, async (req, res, next) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.', code: 'SUPABASE_NOT_CONFIGURED' });
  const validation = validateSettings(req.body ?? {});
  if (validation.error) return res.status(400).json({ error: validation.error });

  try {
    const { error } = await supabase.from('app_settings').update(validation.changes).eq('id', true);
    if (error) throw error;
    return res.json({ settings: await getPublicSettings() });
  } catch (error) {
    return next(error);
  }
});

router.get('/guests', requireAdmin, async (_req, res, next) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.', code: 'SUPABASE_NOT_CONFIGURED' });

  try {
    // Aggregate count at PostgREST side, without downloading any photo paths or content.
    const { data, error, count } = await supabase
      .from('guests')
      .select('id, name, whatsapp, created_at, photos(count)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;

    const guests = (data ?? []).map((guest) => {
      const digits = String(guest.whatsapp ?? '').replace(/\D/g, '');
      const countRows = Array.isArray(guest.photos) ? guest.photos : [];
      const photoCount = countRows.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
      return {
        id: guest.id,
        name: guest.name,
        whatsapp_masked: digits ? `••••••${digits.slice(-4)}` : 'Não informado',
        created_at: guest.created_at,
        photo_count: photoCount,
      };
    });
    return res.json({ guests, total: count ?? guests.length, truncated: (count ?? guests.length) > guests.length });
  } catch (error) {
    return next(error);
  }
});

router.get('/guests/:guestId/photos', requireAdmin, async (req, res, next) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.', code: 'SUPABASE_NOT_CONFIGURED' });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.guestId)) {
    return res.status(400).json({ error: 'Identificador de convidado inválido.' });
  }

  const status = String(req.query.status || 'published');
  if (!['all', ...VALID_STATUSES].includes(status)) return res.status(400).json({ error: 'Filtro de status inválido.' });

  try {
    const { data: guest, error: guestError } = await supabase
      .from('guests')
      .select('id, name, created_at')
      .eq('id', req.params.guestId)
      .maybeSingle();
    if (guestError) throw guestError;
    if (!guest) return res.status(404).json({ error: 'Convidado não encontrado.' });

    let query = supabase
      .from('photos')
      .select('id, guest_id, storage_path, print_storage_path, caption, emoji, filter_key, status, created_at')
      .eq('guest_id', guest.id)
      .order('created_at', { ascending: false })
      .limit(500);
    if (status !== 'all') query = query.eq('status', status);
    const { data: photoRows, error: photoError } = await query;
    if (photoError) throw photoError;
    const photos = await signedPhotoRows((photoRows ?? []).map((photo) => ({ ...photo, guest_name: guest.name })));
    return res.json({
      guest: { id: guest.id, name: guest.name, created_at: guest.created_at },
      photos,
      total: photos.length,
      truncated: photos.length >= 500,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/photos', requireAdmin, async (req, res, next) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.', code: 'SUPABASE_NOT_CONFIGURED' });
  const status = String(req.query.status || 'pending');
  if (!['all', ...VALID_STATUSES].includes(status)) return res.status(400).json({ error: 'Filtro de status inválido.' });

  try {
    let query = supabase
      .from('photos')
      .select('id, storage_path, print_storage_path, caption, emoji, filter_key, status, created_at, guests(name)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (status !== 'all') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    return res.json({ photos: await signedPhotoRows(data) });
  } catch (error) {
    return next(error);
  }
});

router.patch('/photos/:photoId/status', requireAdmin, requireSameOrigin, async (req, res, next) => {
  const supabase = getSupabaseAdmin();
  const status = req.body?.status;
  if (!VALID_STATUSES.has(status)) return res.status(400).json({ error: 'Selecione um status válido.' });

  try {
    const { data, error } = await supabase.from('photos').update({ status }).eq('id', req.params.photoId)
      .select('id, status').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Foto não encontrada.' });
    return res.json({ photo: data });
  } catch (error) {
    return next(error);
  }
});


// Permite ao administrador associar o arquivo original limpo a uma publicação antiga.
// A imagem enviada fica no bucket privado e só alimenta a impressão: não cria uma nova publicação.
router.post('/photos/:photoId/print-source', requireAdmin, requireSameOrigin, (req, res, next) => {
  const MAX_PRINT_SOURCE_BYTES = 8 * 1024 * 1024;
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const readImage = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_PRINT_SOURCE_BYTES });

  readImage(req, res, async (bodyError) => {
    if (bodyError) return next(bodyError);

    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
      return res.status(415).json({ error: 'Envie a fotografia original em JPEG, PNG ou WebP.', code: 'PRINT_SOURCE_INVALID_TYPE' });
    }
    if (!UUID_PATTERN.test(String(req.params.photoId || ''))) {
      return res.status(400).json({ error: 'Identificador da foto inválido.', code: 'PHOTO_INVALID_ID' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length < 8) {
      return res.status(400).json({ error: 'O arquivo enviado está vazio ou não é uma imagem válida.', code: 'PRINT_SOURCE_INVALID' });
    }
    if (req.body.length > MAX_PRINT_SOURCE_BYTES) {
      return res.status(413).json({ error: 'A imagem original deve ter no máximo 8 MB.', code: 'PRINT_SOURCE_TOO_LARGE' });
    }

    const imageType = identifyPrintImage(req.body, contentType);
    if (!imageType) {
      return res.status(415).json({ error: 'O conteúdo do arquivo não corresponde ao formato de imagem informado.', code: 'PRINT_SOURCE_INVALID_TYPE' });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.', code: 'SUPABASE_NOT_CONFIGURED' });
    const bucket = getStorageBucketName();

    try {
      const { data: photo, error: findError } = await supabase
        .from('photos')
        .select('id, guest_id, status, print_storage_path')
        .eq('id', req.params.photoId)
        .maybeSingle();
      if (findError) throw findError;
      if (!photo) return res.status(404).json({ error: 'Fotografia não encontrada.', code: 'PHOTO_NOT_FOUND' });
      if (photo.status !== 'published') {
        return res.status(409).json({ error: 'Publique a fotografia antes de preparar sua versão para impressão.', code: 'PHOTO_NOT_PUBLISHED' });
      }

      const storagePath = `print-originals/${photo.guest_id}/${photo.id}-original.${imageType.ext}`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, req.body, {
        contentType: imageType.type,
        cacheControl: '3600',
        upsert: true,
      });
      if (uploadError) {
        console.error('Falha ao enviar original limpo para impressão:', uploadError.message);
        return res.status(502).json({ error: 'Não foi possível guardar o original. Verifique a conexão e tente novamente.', code: 'PRINT_SOURCE_UPLOAD_FAILED', retryable: true });
      }

      const { error: updateError } = await supabase
        .from('photos')
        .update({ print_storage_path: storagePath })
        .eq('id', photo.id);
      if (updateError) {
        if (storagePath !== photo.print_storage_path) {
          const { error: cleanupError } = await supabase.storage.from(bucket).remove([storagePath]);
          if (cleanupError) console.error('Falha ao limpar original não associado:', cleanupError.message);
        }
        throw updateError;
      }

      if (photo.print_storage_path && photo.print_storage_path !== storagePath) {
        const { error: oldFileError } = await supabase.storage.from(bucket).remove([photo.print_storage_path]);
        if (oldFileError) console.error('Falha ao remover versão anterior de impressão:', oldFileError.message);
      }

      const { data: signed, error: signError } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60 * 60);
      if (signError) console.error('Falha ao assinar original limpo para impressão:', signError.message);
      return res.status(200).json({
        status: 'ok',
        printSourceSaved: true,
        photo: { id: photo.id, print_storage_path: storagePath, print_url: signed?.signedUrl ?? null },
        message: 'Original associado à fotografia existente. Nenhuma nova publicação foi criada.',
      });
    } catch (error) {
      return next(error);
    }
  });
});

router.delete('/photos/:photoId', requireAdmin, requireSameOrigin, async (req, res, next) => {
  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucketName();
  try {
    const { data: photo, error: findError } = await supabase.from('photos').select('id, storage_path, print_storage_path').eq('id', req.params.photoId).maybeSingle();
    if (findError) throw findError;
    if (!photo) return res.status(404).json({ error: 'Foto não encontrada.' });
    const pathsToRemove = [photo.storage_path, photo.print_storage_path].filter(Boolean);
    const { error: storageError } = await supabase.storage.from(bucket).remove(pathsToRemove);
    if (storageError) throw storageError;
    const { error: deleteError } = await supabase.from('photos').delete().eq('id', photo.id);
    if (deleteError) throw deleteError;
    return res.json({ status: 'deleted' });
  } catch (error) {
    return next(error);
  }
});

router.post('/logo', requireAdmin, requireSameOrigin, (req, res, next) => {
  const parseImage = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: LOGO_MAX_BYTES });
  parseImage(req, res, async (bodyError) => {
    if (bodyError) return next(bodyError);
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const imageType = identifyLogo(req.body, contentType);
    if (!imageType) return res.status(415).json({ error: 'Envie um logo JPEG, PNG ou WebP válido.' });
    if (req.body.length > LOGO_MAX_BYTES) return res.status(413).json({ error: 'O logo deve ter no máximo 2 MB.' });

    const supabase = getSupabaseAdmin();
    const bucket = getStorageBucketName();
    const storagePath = `branding/${randomUUID()}.${imageType.ext}`;
    try {
      const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, req.body, {
        contentType: imageType.type,
        cacheControl: '3600',
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data: current } = await supabase.from('app_settings').select('logo_path').eq('id', true).maybeSingle();
      const { error: updateError } = await supabase.from('app_settings').update({ logo_path: storagePath, updated_at: new Date().toISOString() }).eq('id', true);
      if (updateError) {
        await supabase.storage.from(bucket).remove([storagePath]);
        throw updateError;
      }
      if (current?.logo_path?.startsWith('branding/')) {
        const { error: removeOldError } = await supabase.storage.from(bucket).remove([current.logo_path]);
        if (removeOldError) console.error('Não foi possível remover logo anterior:', removeOldError.message);
      }
      return res.status(201).json({ settings: await getPublicSettings() });
    } catch (error) {
      return next(error);
    }
  });
});

router.delete('/logo', requireAdmin, requireSameOrigin, async (_req, res, next) => {
  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucketName();
  try {
    const { data: current, error: readError } = await supabase.from('app_settings').select('logo_path').eq('id', true).maybeSingle();
    if (readError) throw readError;
    const { error: updateError } = await supabase.from('app_settings').update({ logo_path: null, updated_at: new Date().toISOString() }).eq('id', true);
    if (updateError) throw updateError;
    if (current?.logo_path?.startsWith('branding/')) {
      const { error: removeError } = await supabase.storage.from(bucket).remove([current.logo_path]);
      if (removeError) console.error('Não foi possível remover o arquivo do logo:', removeError.message);
    }
    return res.json({ settings: await getPublicSettings() });
  } catch (error) {
    return next(error);
  }
});

export default router;
