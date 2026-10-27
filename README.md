# Nosso Story — cadastro, câmera e galeria (v0.2)

Aplicação web para compartilhar fotos de um casamento. Esta versão adiciona:

- Integração server-side com Supabase/PostgreSQL e Storage privado;
- Cadastro de convidados com nome único, normalizado no servidor e no banco, e WhatsApp opcional;
- Sessão de convidado em cookie `HttpOnly` (o token é salvo no banco apenas como hash);
- Verificação de disponibilidade de nome na interface e validação definitiva no banco;
- Câmera do navegador, opção para escolher uma imagem do dispositivo, prévia, cinco filtros, texto e emojis;
- Upload de JPEG editado para Storage, galeria pessoal, story compartilhado e exclusão da própria foto;
- URLs assinadas para exibir fotos guardadas em bucket privado;
- Rotina SQL versionada em `database/migrations/001_initial.sql`.

## Requisitos

- Node.js `22.12+` (recomendado Node.js 24 LTS) e npm;
- Git;
- Conta Supabase;
- Um navegador moderno. A câmera requer HTTPS em produção ou `localhost` no desenvolvimento.

Confira versões:

```powershell
node -v
npm -v
git --version
```

## 1. Criar o projeto no Supabase

1. Acesse https://supabase.com/dashboard e crie um projeto para o Nosso Story.
2. Aguarde a criação do banco PostgreSQL.
3. Abra **SQL Editor → New query**.
4. Copie o conteúdo de `database/migrations/001_initial.sql`, cole no editor e execute.
5. Confirme que as tabelas `guests`, `photos`, `app_settings` e o bucket `wedding-photos` foram criados.
6. Em **Project Settings → API Keys**, copie a URL do projeto e uma **Secret key** para uso exclusivo do servidor. Em projetos que ainda usam a chave legada, pode usar `service_role`.

**Segurança:** nunca coloque a `Secret key`/`service_role` em arquivos React, variáveis `VITE_*`, commits, screenshots ou mensagens. Essa chave ignora as políticas RLS, portanto só fica nas variáveis de ambiente do backend. O bucket de fotos é privado; a aplicação entrega URLs assinadas de validade limitada.

## 2. Configurar ambiente local (Windows PowerShell)

Na raiz do repositório `nosso-story`:

```powershell
Copy-Item server/.env.example server/.env
notepad server/.env
```

Preencha os campos abaixo com os dados do seu projeto Supabase:

```dotenv
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SECRET_KEY=COLE_A_SECRET_KEY_AQUI
SUPABASE_STORAGE_BUCKET=wedding-photos
PORT=3001
NODE_ENV=development
GUEST_SESSION_DAYS=30
```

Deixe `SUPABASE_SERVICE_ROLE_KEY` vazio se estiver usando `SUPABASE_SECRET_KEY`. Se seu projeto só exibir a chave legada `service_role`, cole-a em `SUPABASE_SERVICE_ROLE_KEY` e deixe a outra vazia. Não preencha os dois campos com chaves diferentes.

O arquivo `server/.env` está coberto pelo `.gitignore`.

## 3. Instalar e iniciar

Como adicionamos uma dependência no backend, instale novamente a partir da pasta raiz:

```powershell
npm install
npm run dev
```

Abra http://localhost:5173. A API fica disponível em http://localhost:3001/api/health.

No Health Check, `supabaseConfigured: true` indica que a URL e a chave foram detectadas no processo do backend. A primeira tentativa de cadastro e o upload confirmam o acesso real ao banco e ao Storage.

Se você já tinha o app aberto, reinicie `npm run dev` depois de editar `server/.env`.

## 4. Teste o fluxo

1. Digite um nome com pelo menos dois caracteres. A interface consulta se ele está disponível.
2. O WhatsApp é opcional; se for preenchido, informe DDD e número (10 a 15 dígitos, podendo conter espaços, `+`, parênteses e hífen).
3. Clique em **Continuar para a câmera**. O backend grava o convidado e devolve um cookie de sessão `HttpOnly`.
4. Permita o acesso à câmera ou selecione uma imagem do dispositivo.
5. Teste um filtro, uma mensagem e/ou um emoji; confirme a prévia e clique **Publicar foto**.
6. Abra **Minhas fotos** para ver/excluir suas imagens e **Story do casamento** para conferir a galeria compartilhada.
7. Confira os registros em **Supabase → Table Editor** e os objetos em **Storage → wedding-photos**.

O nome é normalizado (maiúsculas/minúsculas e espaços repetidos) antes da verificação. A constraint `unique` em `normalized_name` no PostgreSQL é a proteção definitiva contra cadastros simultâneos com o mesmo nome. O WhatsApp não é retornado pela API pública de stories.

### Sobre o acesso do convidado

Não há senha nesta etapa. A sessão está vinculada ao navegador que fez o cadastro. Apagar cookies/dados do navegador ou trocar de aparelho significa perder o acesso àquela sessão; ainda não há recuperação automática de conta. O nome não pode ser reutilizado depois do logout, pois permanece único no evento.

As fotos publicadas ficam acessíveis na galeria compartilhada do casamento. O WhatsApp é privado, mas o nome do convidado, a foto e a mensagem publicada podem ser exibidos aos demais participantes. Só compartilhe fotografias de pessoas que concordem com a publicação.

## 5. Publicar no Render

O projeto usa um único Web Service Node.js: Express serve o frontend compilado e a API. No serviço Render já conectado ao repositório:

- **Build Command:** `npm install --include=dev && npm run build`
- **Start Command:** `npm start`
- **Health Check Path:** `/api/health`
- **Root Directory:** vazio
- **Branch:** `main`

Em **Environment**, adicione os valores do Supabase como variáveis do serviço (não como arquivos do repositório):

| KEY | VALUE |
|---|---|
| `NODE_VERSION` | `24.22.1` |
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | URL do seu projeto Supabase |
| `SUPABASE_SECRET_KEY` | Secret key do Supabase — valor secreto |
| `SUPABASE_STORAGE_BUCKET` | `wedding-photos` |
| `GUEST_SESSION_DAYS` | `30` |

Se usar a chave legada, configure `SUPABASE_SERVICE_ROLE_KEY` em vez de `SUPABASE_SECRET_KEY`. Depois, faça o deploy. Não configure `PORT` manualmente no Render; ele é injetado pela plataforma.

## 6. Enviar as alterações ao GitHub

Esta entrega não inclui a pasta `.git` nem um `.env` real. Copie os arquivos deste pacote para sua pasta de projeto existente, preservando a pasta `.git` que já está no seu computador. Depois, na raiz do repositório:

```powershell
npm install
npm run check
npm run dev
```

Com o teste local validado:

```powershell
git status
git add .
git commit -m "feat: conectar Supabase e publicar fotos"
git push
```

O Render fará um novo deploy automaticamente após o push, por causa da opção `On Commit`.

## Endpoints desta versão

| Método | Endpoint | Uso |
|---|---|---|
| `GET` | `/api/health` | Estado da API e detecção da configuração Supabase |
| `GET` | `/api/guests/check-name?name=...` | Verificar disponibilidade do nome |
| `POST` | `/api/guests` | Criar convidado e sessão |
| `GET` | `/api/guests/me` | Consultar convidado da sessão atual |
| `POST` | `/api/guests/logout` | Encerrar sessão neste navegador |
| `GET` | `/api/guests/me/photos` | Listar fotos do convidado atual |
| `POST` | `/api/photos?caption=...&emoji=...&filter=...` | Enviar JPEG já editado (máximo 8 MB) |
| `GET` | `/api/photos/stories` | Galeria pública de fotos publicadas |
| `DELETE` | `/api/photos/:photoId` | Excluir foto pertencente ao convidado autenticado |

## Estrutura relevante

```text
nosso-story/
├── client/src/App.jsx
├── client/src/styles/global.css
├── server/.env.example
├── server/src/lib/supabase.js
├── server/src/lib/guest-session.js
├── server/src/routes/guests.routes.js
├── server/src/routes/photos.routes.js
├── server/src/app.js
├── server/src/server.js
└── database/migrations/001_initial.sql
```
