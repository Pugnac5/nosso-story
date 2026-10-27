import { createClient } from '@supabase/supabase-js';

let cachedClient;
let cachedSignature;

/**
 * Cliente privilegiado: deve ser usado exclusivamente no backend.
 * A chave escolhida nunca é enviada ao navegador.
 */
export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();

  if (!url || !key) return null;

  const signature = `${url}:${key}`;
  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { 'X-Client-Info': 'nosso-story-server' },
      },
    });
    cachedSignature = signature;
  }

  return cachedClient;
}

export function getStorageBucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'wedding-photos';
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.SUPABASE_URL?.trim()
      && (process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  );
}
