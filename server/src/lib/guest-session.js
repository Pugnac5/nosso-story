import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from './supabase.js';

export const GUEST_COOKIE_NAME = 'nosso_story_guest';
const SESSION_DAYS = Math.max(1, Math.min(90, Number(process.env.GUEST_SESSION_DAYS) || 30));
const SESSION_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const SESSION_RENEW_THRESHOLD_MS = Math.min(7 * 24 * 60 * 60 * 1000, Math.floor(SESSION_MAX_AGE_MS / 3));

export function normalizeGuestName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
}

/** Normaliza para DDD+número (10 ou 11 dígitos), aceitando +55 opcional. */
export function normalizeWhatsApp(value) {
  if (value == null || String(value).trim() === '') return null;
  let digits = String(value).replace(/\D/g, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  return digits;
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOptions(req, maxAge) {
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  const secure = process.env.NODE_ENV === 'production' || req.secure || forwardedProto === 'https';
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}

export function setGuestSessionCookie(res, req, token) {
  res.cookie(GUEST_COOKIE_NAME, token, cookieOptions(req, SESSION_MAX_AGE_MS));
}

export function clearGuestSessionCookie(res, req) {
  res.clearCookie(GUEST_COOKIE_NAME, cookieOptions(req, 0));
}

function readCookie(req, cookieName) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== cookieName) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

/**
 * Confere o token e a expiração persistida no banco. Renova a sessão de forma deslizante
 * quando está perto de expirar. Falha ao renovar não derruba uma sessão ainda válida.
 */
export async function getGuestFromRequest(req, res = null) {
  const token = readCookie(req, GUEST_COOKIE_NAME);
  if (!token || token.length < 40) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const tokenHash = hashSessionToken(token);
  const { data, error } = await supabase
    .from('guests')
    .select('id, name, created_at, session_expires_at')
    .eq('session_token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    console.error('Não foi possível validar a sessão do convidado:', error.message);
    throw new Error('Não foi possível validar a sessão do convidado.');
  }
  if (!data) {
    if (res) clearGuestSessionCookie(res, req);
    return null;
  }

  const expiresAt = Date.parse(data.session_expires_at || '');
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    if (res) clearGuestSessionCookie(res, req);
    return null;
  }

  if (res) {
    if (expiresAt - Date.now() <= SESSION_RENEW_THRESHOLD_MS) {
      const nextExpiry = new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString();
      const { error: renewError } = await supabase
        .from('guests')
        .update({ session_expires_at: nextExpiry })
        .eq('id', data.id)
        .eq('session_token_hash', tokenHash);

      if (renewError) {
        console.error('Não foi possível renovar a sessão do convidado:', renewError.message);
      } else {
        setGuestSessionCookie(res, req, token);
      }
    }
  }

  return { id: data.id, name: data.name, created_at: data.created_at };
}

export function requireGuestSession() {
  return async (req, res, next) => {
    try {
      if (!getSupabaseAdmin()) {
        return res.status(503).json({
          error: 'O banco de dados ainda não está configurado. Configure as variáveis do Supabase no backend.',
          code: 'SUPABASE_NOT_CONFIGURED',
        });
      }

      const guest = await getGuestFromRequest(req, res);
      if (!guest) {
        return res.status(401).json({ error: 'Sua sessão não está ativa. Entre ou recupere o acesso para continuar.', code: 'GUEST_SESSION_REQUIRED' });
      }

      req.guest = guest;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function createGuestSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function getSessionMaxAgeMs() {
  return SESSION_MAX_AGE_MS;
}
