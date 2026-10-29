import { Router } from 'express';
import {
  clearGuestSessionCookie,
  createGuestSessionToken,
  getGuestFromRequest,
  hashSessionToken,
  normalizeGuestName,
  normalizeWhatsApp,
  requireGuestSession,
  setGuestSessionCookie,
  getSessionMaxAgeMs,
} from '../lib/guest-session.js';
import { limitGuestRecovery } from '../lib/guest-recovery-limit.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { attachPhotoReactionSummaries } from '../lib/photo-reactions.js';

const router = Router();

function validateGuestInput(body, { requireWhatsApp = true } = {}) {
  const name = String(body?.name ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  const normalizedName = normalizeGuestName(name);
  const rawWhatsApp = String(body?.whatsapp ?? '').trim();
  const whatsapp = normalizeWhatsApp(rawWhatsApp);

  if (name.length < 2) return { error: 'Informe seu nome completo (pelo menos 2 caracteres).', field: 'name' };
  if (name.length > 80) return { error: 'O nome deve ter no máximo 80 caracteres.', field: 'name' };
  if (/[<>\u0000-\u001f]/.test(name)) return { error: 'O nome contém caracteres não permitidos.', field: 'name' };
  if (!rawWhatsApp && requireWhatsApp) return { error: 'Informe um WhatsApp com DDD e número. Ele será usado para recuperar seu acesso.', field: 'whatsapp' };
  if (rawWhatsApp && (!whatsapp || ![10, 11].includes(whatsapp.length))) {
    return { error: 'Informe um WhatsApp válido com DDD e número (10 ou 11 dígitos), com ou sem o código +55.', field: 'whatsapp' };
  }

  return { name, normalizedName, whatsapp };
}

router.get('/check-name', async (req, res, next) => {
  const input = validateGuestInput({ name: req.query.name }, { requireWhatsApp: false });
  if (input.error) return res.status(400).json({ available: false, error: input.error });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({
      available: null,
      error: 'O banco de dados ainda não está configurado.',
      code: 'SUPABASE_NOT_CONFIGURED',
    });
  }

  try {
    const { count, error } = await supabase
      .from('guests')
      .select('id', { count: 'exact', head: true })
      .eq('normalized_name', input.normalizedName);

    if (error) throw error;
    return res.json({ available: count === 0 });
  } catch (error) {
    return next(error);
  }
});

// A consulta de disponibilidade é usada durante o cadastro. Limita consultas por IP
// para reduzir enumeração automatizada de números de telefone.
const phoneCheckBuckets = new Map();
const PHONE_CHECK_WINDOW_MS = 15 * 60 * 1000;
const PHONE_CHECK_MAX_REQUESTS = 40;
function limitPhoneAvailabilityChecks(req, res, next) {
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 120);
  const now = Date.now();
  let bucket = phoneCheckBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + PHONE_CHECK_WINDOW_MS };
    phoneCheckBuckets.set(ip, bucket);
  }
  if (phoneCheckBuckets.size > 1000) {
    for (const [key, value] of phoneCheckBuckets) {
      if (value.resetAt <= now) phoneCheckBuckets.delete(key);
    }
  }
  if (bucket.count >= PHONE_CHECK_MAX_REQUESTS) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
    return res.status(429).json({ available: null, error: 'Muitas consultas. Aguarde um pouco e tente novamente.' });
  }
  bucket.count += 1;
  return next();
}

router.get('/check-phone', limitPhoneAvailabilityChecks, async (req, res, next) => {
  const phone = normalizeWhatsApp(req.query.whatsapp);
  if (!phone || ![10, 11].includes(phone.length)) {
    return res.status(400).json({ available: false, error: 'Informe DDD e número de telefone válidos.' });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ available: null, error: 'O banco de dados ainda não está configurado.', code: 'SUPABASE_NOT_CONFIGURED' });
  }

  try {
    const { count, error } = await supabase
      .from('guests')
      .select('id', { count: 'exact', head: true })
      .eq('whatsapp', phone);
    if (error) throw error;
    res.set('Cache-Control', 'no-store');
    return res.json({ available: count === 0 });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({
      error: 'O banco de dados ainda não está configurado. Crie o projeto Supabase, execute a migração SQL e configure as variáveis de ambiente.',
      code: 'SUPABASE_NOT_CONFIGURED',
    });
  }

  const input = validateGuestInput(req.body);
  if (input.error) return res.status(400).json({ error: input.error, field: input.field || 'name' });

  try {
    // Evita criar outra sessão quando este mesmo navegador já está cadastrado.
    const currentGuest = await getGuestFromRequest(req, res);
    if (currentGuest) {
      return res.status(200).json({ guest: currentGuest, alreadyRegistered: true });
    }

    if (input.whatsapp) {
      // Verificação rápida para boa mensagem de erro; o índice único do banco é a
      // proteção definitiva contra cadastros simultâneos com o mesmo número.
      const { data: existingPhone, error: phoneLookupError } = await supabase
        .from('guests')
        .select('id')
        .eq('whatsapp', input.whatsapp)
        .limit(1);
      if (phoneLookupError) throw phoneLookupError;
      if (existingPhone?.length) {
        return res.status(409).json({
          error: 'Este WhatsApp já está associado a um cadastro. Se o cadastro for seu, use a opção de recuperar acesso.',
          code: 'GUEST_PHONE_TAKEN',
          field: 'whatsapp',
        });
      }
    }

    const token = createGuestSessionToken();
    const { data, error } = await supabase
      .from('guests')
      .insert({
        name: input.name,
        normalized_name: input.normalizedName,
        whatsapp: input.whatsapp,
        session_token_hash: hashSessionToken(token),
        session_expires_at: new Date(Date.now() + getSessionMaxAgeMs()).toISOString(),
      })
      .select('id, name, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        const constraint = String(error.message || error.details || '');
        if (constraint.includes('guests_whatsapp_uidx') || constraint.toLowerCase().includes('whatsapp')) {
          return res.status(409).json({
            error: 'Este WhatsApp já está associado a um cadastro. Use a opção de recuperar acesso.',
            code: 'GUEST_PHONE_TAKEN',
            field: 'whatsapp',
          });
        }
        return res.status(409).json({
          error: 'Este nome já está cadastrado. Confira a grafia ou peça ajuda ao responsável pelo evento.',
          code: 'GUEST_NAME_TAKEN',
          field: 'name',
        });
      }
      throw error;
    }

    setGuestSessionCookie(res, req, token);
    return res.status(201).json({ guest: data, alreadyRegistered: false });
  } catch (error) {
    return next(error);
  }
});

const RECOVERY_GENERIC_MESSAGE = 'Se esse número estiver associado a um cadastro elegível, o acesso será recuperado neste navegador. Se não conseguir entrar, peça ajuda à organização do casamento.';

function requireSameOriginForRecovery(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return next(); // Permite clientes não-browser; a limitação por IP continua ativa.
  try {
    const parsed = new URL(origin);
    const requestOrigin = `${req.protocol}://${req.get('host')}`;
    const sameOrigin = parsed.origin === requestOrigin;
    const isLocalDevHost = (host) => ['localhost', '127.0.0.1'].includes(host)
      || /^10(?:\.\d{1,3}){3}$/.test(host)
      || /^192\.168(?:\.\d{1,3}){2}$/.test(host)
      || /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(host);
    // Vite usa um proxy para o Express em desenvolvimento. A origem do navegador
    // pode ter a porta 5173, enquanto o Host recebido pelo backend usa 3001.
    // Comparamos os hostnames apenas para permitir origens locais confiáveis em dev.
    const originHost = parsed.hostname;
    const requestHost = new URL(requestOrigin).hostname;
    const localDevHosts = process.env.NODE_ENV !== 'production'
      && isLocalDevHost(originHost)
      && isLocalDevHost(requestHost);
    if (sameOrigin || localDevHosts) return next();
    return res.status(403).json({ error: 'Origem da requisição não permitida.' });
  } catch {
    return res.status(403).json({ error: 'Origem da requisição inválida.' });
  }
}

router.post('/recover-session', requireSameOriginForRecovery, limitGuestRecovery, async (req, res, next) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({
      error: 'O serviço de cadastro está temporariamente indisponível.',
      code: 'SUPABASE_NOT_CONFIGURED',
    });
  }

  const rawPhone = String(req.body?.whatsapp ?? req.body?.phone ?? '').trim();
  const phone = normalizeWhatsApp(rawPhone);
  if (!phone || ![10, 11].includes(phone.length)) {
    return res.status(400).json({ error: 'Informe DDD e número de telefone com 10 ou 11 dígitos.' });
  }

  try {
    // O número canônico armazenado em guests.whatsapp é a única chave de recuperação.
    // A migração 004 normaliza os dados históricos e impõe unicidade no próprio campo.
    const { data: guest, error: lookupError } = await supabase
      .from('guests')
      .select('id')
      .eq('whatsapp', phone)
      .maybeSingle();
    if (lookupError) throw lookupError;

    // Resposta deliberadamente idêntica com ou sem correspondência, sem revelar nome ou ID.
    if (guest) {
      const token = createGuestSessionToken();
      const expiresAt = new Date(Date.now() + getSessionMaxAgeMs()).toISOString();
      const { data: updated, error: updateError } = await supabase
        .from('guests')
        .update({ session_token_hash: hashSessionToken(token), session_expires_at: expiresAt })
        .eq('id', guest.id)
        .select('id')
        .maybeSingle();
      if (updateError) throw updateError;
      if (updated) setGuestSessionCookie(res, req, token);
    }

    return res.status(200).json({ status: 'ok', message: RECOVERY_GENERIC_MESSAGE });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const guest = await getGuestFromRequest(req, res);
    if (!guest) return res.status(401).json({ error: 'Nenhum convidado cadastrado nesta sessão.' });
    return res.json({ guest });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', (req, res) => {
  clearGuestSessionCookie(res, req);
  return res.status(200).json({ status: 'ok' });
});

router.get('/me/photos', requireGuestSession(), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'wedding-photos';
    const { data, error } = await supabase
      .from('photos')
      .select('id, storage_path, caption, emoji, filter_key, caption_position, caption_color, caption_size, caption_render_mode, status, created_at')
      .eq('guest_id', req.guest.id)
      .neq('status', 'hidden')
      .order('created_at', { ascending: false })
      .limit(60);

    if (error) throw error;
    const photos = await Promise.all((data ?? []).map(async (photo) => {
      const { data: signed, error: signedError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(photo.storage_path, 60 * 60 * 24);
      if (signedError) console.error('Falha ao gerar URL de foto:', signedError.message);
      return {
        ...photo,
        caption_position: photo.caption_position || 'bottom',
        caption_color: photo.caption_color || '#FFFFFF',
        caption_size: photo.caption_size || 'medium',
        caption_render_mode: photo.caption_render_mode || 'baked',
        url: signed?.signedUrl ?? null,
      };
    }));
    const photosWithReactions = await attachPhotoReactionSummaries(photos, req.guest.id);

    res.set('Cache-Control', 'no-store');
    return res.json({ photos: photosWithReactions });
  } catch (error) {
    return next(error);
  }
});

export default router;
