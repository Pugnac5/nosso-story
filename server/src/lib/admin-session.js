import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const ADMIN_COOKIE_NAME = 'nosso_story_admin';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const failedLogins = new Map();

function readCookie(req, cookieName) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== cookieName) continue;
    const value = part.slice(separator + 1).trim();
    try { return decodeURIComponent(value); } catch { return value; }
  }
  return null;
}

function cookieOptions(req, maxAge) {
  const secure = req.secure || req.get('x-forwarded-proto') === 'https';
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge,
  };
}

function sessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() || '';
  return secret.length >= 32 ? secret : null;
}

export function isAdminAuthConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD?.length && sessionSecret());
}

function safeStringCompare(left, right) {
  const leftHash = createHash('sha256').update(String(left)).digest();
  const rightHash = createHash('sha256').update(String(right)).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function verifyAdminPassword(candidate) {
  const expected = process.env.ADMIN_PASSWORD;
  if (typeof expected !== 'string' || !expected.length || typeof candidate !== 'string') return false;
  return safeStringCompare(candidate, expected);
}

function signPayload(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createAdminSessionToken() {
  const secret = sessionSecret();
  if (!secret) throw new Error('ADMIN_SESSION_SECRET precisa ter ao menos 32 caracteres.');
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS, nonce: randomBytes(16).toString('hex') })).toString('base64url');
  return `${payload}.${signPayload(payload, secret)}`;
}

export function isAdminRequest(req) {
  const secret = sessionSecret();
  if (!secret) return false;
  const token = readCookie(req, ADMIN_COOKIE_NAME);
  if (!token || token.length > 1024) return false;
  const pieces = token.split('.');
  if (pieces.length !== 2) return false;

  const [payload, signature] = pieces;
  const expected = Buffer.from(signPayload(payload, secret), 'base64url');
  let received;
  try { received = Buffer.from(signature, 'base64url'); } catch { return false; }
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(decoded.exp) && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

export function setAdminSessionCookie(res, req, token) {
  res.cookie(ADMIN_COOKIE_NAME, token, cookieOptions(req, SESSION_TTL_MS));
}

export function clearAdminSessionCookie(res, req) {
  res.clearCookie(ADMIN_COOKIE_NAME, cookieOptions(req, 0));
}

function loginStateFor(ip) {
  const now = Date.now();
  const state = failedLogins.get(ip);
  if (!state || state.until <= now) {
    const fresh = { attempts: 0, until: now + 15 * 60 * 1000 };
    failedLogins.set(ip, fresh);
    return fresh;
  }
  return state;
}

export function registerAdminLoginFailure(ip) {
  const state = loginStateFor(ip);
  state.attempts += 1;
  if (state.attempts >= 5) state.until = Date.now() + 15 * 60 * 1000;
  return state;
}

export function getAdminLoginBlockSeconds(ip) {
  const state = failedLogins.get(ip);
  if (!state || state.attempts < 5) return 0;
  const remaining = Math.ceil((state.until - Date.now()) / 1000);
  return Math.max(0, remaining);
}

export function clearAdminLoginFailures(ip) {
  failedLogins.delete(ip);
}

export function requireAdmin(req, res, next) {
  if (!isAdminAuthConfigured()) {
    return res.status(503).json({ error: 'A autenticação administrativa ainda não foi configurada no ambiente.', code: 'ADMIN_NOT_CONFIGURED' });
  }
  if (!isAdminRequest(req)) {
    return res.status(401).json({ error: 'Faça login na área administrativa para continuar.', code: 'ADMIN_AUTH_REQUIRED' });
  }
  return next();
}
