import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import app from './app.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../.env') });

const port = Number(process.env.PORT) || 3001;

app.listen(port, '0.0.0.0', () => {
  console.log(`Nosso Story API disponível em http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/api/health`);
});
