import { createHash } from 'node:crypto';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_IP = 30;
const MAX_REQUESTS_PER_PHONE = 5;
const ipBuckets = new Map();
const phoneBuckets = new Map();

function digestPhone(rawValue) {
  let digits = String(rawValue ?? '').replace(/\D/g, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  if (![10, 11].includes(digits.length)) return null;
  // Nunca armazena o número em claro no mapa do rate limiter.
  return createHash('sha256').update(digits).digest('hex');
}

function pruneExpired(map, now) {
  for (const [key, entry] of map) {
    if (entry.resetAt <= now) map.delete(key);
  }
}

function consume(map, key, maxRequests, now) {
  let entry = map.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { attempts: 0, resetAt: now + WINDOW_MS };
    map.set(key, entry);
  }
  if (entry.attempts >= maxRequests) {
    return Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  }
  entry.attempts += 1;
  return 0;
}

/** Limita tentativas por IP e por telefone para reduzir abuso sem bloquear redes de convidados. */
export function limitGuestRecovery(req, res, next) {
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 120);
  const now = Date.now();

  // Limpeza periódica evita crescimento indefinido do armazenamento em memória.
  if (ipBuckets.size > 1000) pruneExpired(ipBuckets, now);
  if (phoneBuckets.size > 1000) pruneExpired(phoneBuckets, now);

  let retryAfter = consume(ipBuckets, ip, MAX_REQUESTS_PER_IP, now);
  if (!retryAfter) {
    const phoneHash = digestPhone(req.body?.whatsapp ?? req.body?.phone);
    if (phoneHash) retryAfter = consume(phoneBuckets, phoneHash, MAX_REQUESTS_PER_PHONE, now);
  }

  if (retryAfter) {
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'Muitas tentativas de recuperação. Aguarde alguns minutos e tente novamente.',
      code: 'GUEST_RECOVERY_RATE_LIMITED',
    });
  }
  return next();
}
