import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const app = express();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(currentDir, '../../client/dist');

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'nosso-story-api',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || (process.env.PORT ? 'production' : 'development'),
  });
});

// Retorna JSON para endpoints /api inexistentes, em vez de devolver o HTML do React.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint da API não encontrado.' });
});

// Em produção, o Express entrega os arquivos gerados pelo Vite.
app.use(express.static(clientDistPath, { index: false }));

app.get(/.*/, (_req, res) => {
  const indexPath = path.join(clientDistPath, 'index.html');

  if (!existsSync(indexPath)) {
    return res.status(404).send(
      'Frontend não compilado. Execute "npm run build" na raiz do projeto.',
    );
  }

  return res.sendFile(indexPath);
});

export default app;
