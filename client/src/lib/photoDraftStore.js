const DB_NAME = 'nosso-story-local';
const STORE_NAME = 'photo-drafts';
const DB_VERSION = 1;
const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function openDraftDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('O navegador não oferece armazenamento local persistente.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'guestId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir o armazenamento de rascunhos.'));
  });
}

async function withStore(mode, operation) {
  const db = await openDraftDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = operation(store);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error || new Error('Falha no armazenamento do rascunho.'));
      transaction.onabort = () => reject(transaction.error || new Error('O armazenamento do rascunho foi interrompido.'));
    });
  } finally {
    db.close();
  }
}

export async function readPhotoDraft(guestId) {
  if (!guestId) return null;
  const draft = await withStore('readonly', (store) => store.get(guestId));
  if (!draft) return null;
  if (!Number.isFinite(draft.updatedAt) || Date.now() - draft.updatedAt > DRAFT_TTL_MS) {
    await deletePhotoDraft(guestId);
    return null;
  }
  return draft;
}

export async function savePhotoDraft(guestId, draft) {
  if (!guestId || !draft?.capturedImage) return;
  await withStore('readwrite', (store) => store.put({ ...draft, guestId, updatedAt: Date.now() }));
}

export async function deletePhotoDraft(guestId) {
  if (!guestId) return;
  await withStore('readwrite', (store) => store.delete(guestId));
}
