import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGuestName, normalizeWhatsApp, setGuestSessionCookie, getSessionMaxAgeMs } from '../src/lib/guest-session.js';
import { setAdminSessionCookie } from '../src/lib/admin-session.js';
import { fetchWithRetry } from '../../client/src/lib/fetchWithRetry.js';
import { limitGuestRecovery } from '../src/lib/guest-recovery-limit.js';

function mockRequest({ secure = false, forwardedProto = 'http' } = {}) {
  return {
    secure,
    get(name) {
      if (name.toLowerCase() === 'x-forwarded-proto') return forwardedProto;
      return undefined;
    },
  };
}

function mockResponse() {
  return {
    cookieArgs: null,
    cookie(...args) { this.cookieArgs = args; },
    clearCookie(...args) { this.clearCookieArgs = args; },
  };
}

test('normaliza nome removendo espaços extras e diferenças de caixa', () => {
  assert.equal(normalizeGuestName('  ANA   Paula Oliveira '), 'ana paula oliveira');
});

test('normaliza telefone nacional e telefone com código +55', () => {
  assert.equal(normalizeWhatsApp('(71) 99999-9999'), '71999999999');
  assert.equal(normalizeWhatsApp('+55 (71) 99999-9999'), '71999999999');
  assert.equal(normalizeWhatsApp('71 3333-4444'), '7133334444');
  assert.equal(normalizeWhatsApp('  '), null);
});

test('cookies de convidado são HttpOnly, Secure em produção e SameSite=Lax', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const res = mockResponse();
    setGuestSessionCookie(res, mockRequest({ secure: false, forwardedProto: 'http' }), 'guest-token');
    const [name, token, options] = res.cookieArgs;
    assert.equal(name, 'nosso_story_guest');
    assert.equal(token, 'guest-token');
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, true);
    assert.equal(options.sameSite, 'lax');
    assert.ok(options.maxAge > 0);
    assert.ok(getSessionMaxAgeMs() > 0);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('cookie do master usa HttpOnly, Secure em produção e SameSite=Lax', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const res = mockResponse();
    setAdminSessionCookie(res, mockRequest(), 'admin-token');
    const [name, token, options] = res.cookieArgs;
    assert.equal(name, 'nosso_story_admin');
    assert.equal(token, 'admin-token');
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, true);
    assert.equal(options.sameSite, 'lax');
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('fetchWithRetry tenta novamente em falha transitória HTTP', async () => {
  const previousFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) return new Response('temporarily unavailable', { status: 503 });
    return new Response('{"status":"ok"}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const response = await fetchWithRetry('/api/test', {}, { retries: 1, baseDelayMs: 100, maxDelayMs: 100 });
    assert.equal(response.status, 200);
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = previousFetch;
  }
});


test('limita recuperações por telefone sem compartilhar o número em texto claro', () => {
  const ip = `test-phone-${Math.random()}`;
  const phone = `71${String(Math.floor(Math.random() * 1000000000)).padStart(9, '0')}`;
  const makeResponse = () => ({
    headers: {}, statusCode: 200, body: null,
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = makeResponse();
    let continued = false;
    limitGuestRecovery({ ip, body: { whatsapp: phone } }, res, () => { continued = true; });
    assert.equal(continued, true);
  }
  const res = makeResponse();
  let continued = false;
  limitGuestRecovery({ ip, body: { whatsapp: phone } }, res, () => { continued = true; });
  assert.equal(continued, false);
  assert.equal(res.statusCode, 429);
  assert.ok(Number(res.headers['Retry-After']) > 0);
  assert.equal(res.body.code, 'GUEST_RECOVERY_RATE_LIMITED');
});


test('cookies não usam Secure em desenvolvimento HTTP local', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const res = mockResponse();
    setGuestSessionCookie(res, mockRequest({ secure: false, forwardedProto: 'http' }), 'guest-token');
    assert.equal(res.cookieArgs[2].secure, false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('limita tentativas de recuperação por IP para evitar abuso em lote', () => {
  const ip = `test-ip-${Math.random()}`;
  const makeResponse = () => ({
    headers: {}, statusCode: 200, body: null,
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const res = makeResponse();
    let continued = false;
    const phone = `71${String(attempt).padStart(9, '0')}`;
    limitGuestRecovery({ ip, body: { whatsapp: phone } }, res, () => { continued = true; });
    assert.equal(continued, true);
  }
  const res = makeResponse();
  let continued = false;
  limitGuestRecovery({ ip, body: { whatsapp: '71912345678' } }, res, () => { continued = true; });
  assert.equal(continued, false);
  assert.equal(res.statusCode, 429);
});
