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
} from '../lib/guest-session.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

const router = Router();

function validateGuestInput(body) {
  const name = String(body?.name ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  const normalizedName = normalizeGuestName(name);
  const rawWhatsApp = String(body?.whatsapp ?? '').trim();
  const whatsapp = normalizeWhatsApp(rawWhatsApp);

  if (name.length < 2) return { error: 'Informe seu nome completo (pelo menos 2 caracteres).' };
  if (name.length > 80) return { error: 'O nome deve ter no máximo 80 caracteres.' };
  if (/[<>\u0000-\u001f]/.test(name)) return { error: 'O nome contém caracteres não permitidos.' };
  if (rawWhatsApp && (!whatsapp || whatsapp.length < 10 || whatsapp.length > 15)) {
    return { error: 'Informe um WhatsApp válido com DDD e código do país, se necessário, ou deixe o campo vazio.' };
  }

  return { name, normalizedName, whatsapp };
}

router.get('/check-name', async (req, res, next) => {
  const input = validateGuestInput({ name: req.query.name });
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

router.post('/', async (req, res, next) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({
      error: 'O banco de dados ainda não está configurado. Crie o projeto Supabase, execute a migração SQL e configure as variáveis de ambiente.',
      code: 'SUPABASE_NOT_CONFIGURED',
    });
  }

  const input = validateGuestInput(req.body);
  if (input.error) return res.status(400).json({ error: input.error, field: 'name' });

  try {
    // Evita criar outra sessão quando este mesmo navegador já está cadastrado.
    const currentGuest = await getGuestFromRequest(req);
    if (currentGuest) {
      return res.status(200).json({ guest: currentGuest, alreadyRegistered: true });
    }

    const token = createGuestSessionToken();
    const { data, error } = await supabase
      .from('guests')
      .insert({
        name: input.name,
        normalized_name: input.normalizedName,
        whatsapp: input.whatsapp,
        session_token_hash: hashSessionToken(token),
      })
      .select('id, name, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
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

router.get('/me', async (req, res, next) => {
  try {
    const guest = await getGuestFromRequest(req);
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
      .select('id, storage_path, caption, emoji, filter_key, status, created_at')
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
      return { ...photo, url: signed?.signedUrl ?? null };
    }));

    return res.json({ photos });
  } catch (error) {
    return next(error);
  }
});

export default router;
