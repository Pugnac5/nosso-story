import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import guestsRouter from './routes/guests.routes.js';
import photosRouter from './routes/photos.routes.js';
import { isSupabaseConfigured } from './lib/supabase.js';

const app = express();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(currentDir, '../../client/dist');

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'nosso-story-api',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || (process.env.PORT ? 'production' : 'development'),
    supabaseConfigured: isSupabaseConfigured(),
  });
});

app.use('/api/guests', guestsRouter);
app.use('/api/photos', photosRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint da API não encontrado.' });
});

app.use((error, req, res, _next) => {
  if (error?.type === 'entity.too.large' || error?.status === 413) {
    return res.status(413).json({ error: 'A imagem é muito grande. O limite é 8 MB.' });
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'O corpo da requisição contém JSON inválido.' });
  }

  console.error('Erro na API:', error?.message || error);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Ocorreu um erro no servidor. Tente novamente.' });
  }
  return res.status(500).send('Ocorreu um erro inesperado.');
});

app.use(express.static(clientDistPath, { index: false }));

app.get(/.*/, (_req, res) => {
  const indexPath = path.join(clientDistPath, 'index.html');
  if (!existsSync(indexPath)) {
    return res.status(404).send('Frontend não compilado. Execute "npm run build" na raiz do projeto.');
  }
  return res.sendFile(indexPath);
});

export default app;
