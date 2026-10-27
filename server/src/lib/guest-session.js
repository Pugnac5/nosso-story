import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from './supabase.js';

export const GUEST_COOKIE_NAME = 'nosso_story_guest';
const SESSION_DAYS = Math.max(1, Math.min(90, Number(process.env.GUEST_SESSION_DAYS) || 30));
const SESSION_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export function normalizeGuestName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
}

export function normalizeWhatsApp(value) {
  if (value == null || String(value).trim() === '') return null;
  return String(value).replace(/\D/g, '');
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOptions(req, maxAge) {
  const isHttps = req.get('x-forwarded-proto') === 'https' || req.secure;
  return {
    httpOnly: true,
    secure: isHttps,
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

export async function getGuestFromRequest(req) {
  const token = readCookie(req, GUEST_COOKIE_NAME);
  if (!token || token.length < 40) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('guests')
    .select('id, name, created_at')
    .eq('session_token_hash', hashSessionToken(token))
    .maybeSingle();

  if (error) {
    console.error('Não foi possível validar a sessão do convidado:', error.message);
    throw new Error('Não foi possível validar a sessão do convidado.');
  }

  return data;
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

      const guest = await getGuestFromRequest(req);
      if (!guest) {
        return res.status(401).json({ error: 'Cadastre-se para continuar.', code: 'GUEST_SESSION_REQUIRED' });
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
