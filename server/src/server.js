import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../.env') });

// Importação dinâmica após dotenv para que configurações lidas durante a inicialização
// dos módulos já estejam disponíveis.
const { default: app } = await import('./app.js');
const port = Number(process.env.PORT) || 3001;

app.listen(port, '0.0.0.0', () => {
  console.log(`Nosso Story API disponível em http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/api/health`);
  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.warn('Supabase ainda não configurado. Defina SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente.');
  }
});
