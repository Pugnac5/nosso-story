const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(response, attempt, baseDelayMs, maxDelayMs) {
  const retryAfter = Number(response?.headers?.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(maxDelayMs, retryAfter * 1000);
  }
  return Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
}

/**
 * Repete GETs e operações idempotentes em falhas transitórias. Para uploads, sempre envie
 * a mesma Idempotency-Key e o mesmo Blob em todas as tentativas.
 */
export async function fetchWithRetry(input, init = {}, options = {}) {
  const retries = Math.max(0, Math.min(4, Number(options.retries ?? 2)));
  const baseDelayMs = Math.max(100, Number(options.baseDelayMs ?? 500));
  const maxDelayMs = Math.max(baseDelayMs, Number(options.maxDelayMs ?? 4000));
  let lastNetworkError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response;
    try {
      response = await fetch(input, init);
    } catch (error) {
      lastNetworkError = error;
      if (attempt >= retries) {
        throw new Error('A conexão foi interrompida. Verifique a internet e tente novamente.');
      }
      await wait(Math.min(maxDelayMs, baseDelayMs * (2 ** attempt)));
      continue;
    }

    if (!RETRYABLE_STATUSES.has(response.status) || attempt >= retries) return response;
    const delay = retryDelay(response, attempt, baseDelayMs, maxDelayMs);
    try { await response.body?.cancel(); } catch { /* A resposta já pode ter sido consumida. */ }
    await wait(delay);
  }

  throw new Error(lastNetworkError?.message || 'Não foi possível concluir a solicitação. Tente novamente.');
}
