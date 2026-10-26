# Nosso Story — base inicial

Aplicação web para compartilhar fotos de um casamento. Esta primeira versão contém a tela inicial responsiva e a comunicação entre React/Vite e a API Node.js/Express. Cadastro, câmera, upload, story, telão, banco de dados e painel administrativo serão implementados em etapas posteriores.

## Tecnologias

- Node.js (compatível com versões `>=22.0.0 <25.0.0`)
- React + Vite
- Node.js + Express
- npm workspaces para instalar e executar o monorepositório

## Requisitos

Instale o Node.js em uma versão suportada pelo `package.json`. O npm vem junto com o Node. Instale também o Git se ainda não estiver instalado.

Verifique no terminal:

```bash
node -v
npm -v
git --version
```

## Executar localmente

Na pasta raiz `nosso-story`:

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie o arquivo de ambiente do backend copiando `server/.env.example` para `server/.env`.

   No PowerShell do Windows:

   ```powershell
   Copy-Item server/.env.example server/.env
   ```

   No macOS/Linux:

   ```bash
   cp server/.env.example server/.env
   ```

3. Inicie frontend e backend em terminais coordenados:

   ```bash
   npm run dev
   ```

4. Abra `http://localhost:5173` no navegador. O Vite encaminha `/api/*` para o backend na porta `3001`.

O backend pode ser consultado diretamente em `http://localhost:3001/api/health`. A resposta esperada é um JSON com `status: "ok"`.

Para compilar o frontend e validar os arquivos principais:

```bash
npm run check
```

Para simular produção localmente:

```bash
npm run build
npm start
```

Depois, acesse `http://localhost:3001`. Para sair do modo de produção local, interrompa o processo com `Ctrl+C`.

## Publicar pelo Git e Render

O projeto foi preparado para ser implantado como **um único Web Service Node.js** no Render. O Express entrega o frontend compilado e também atende a API. Assim, a aplicação inicial não precisa de dois serviços separados.

1. Crie um repositório vazio no GitHub (por exemplo, `nosso-story`).
2. Inicialize o Git na pasta deste projeto, faça o primeiro commit e envie para o repositório remoto. Consulte os comandos completos abaixo.
3. No Render, escolha **New + → Web Service** e conecte o repositório.
4. Configure:

   | Campo | Valor |
   |---|---|
   | Runtime / Language | Node |
   | Root Directory | deixe vazio (raiz do repositório) |
   | Build Command | `npm install --include=dev && npm run build` |
   | Start Command | `npm start` |
   | Health Check Path | `/api/health` |

5. Crie o serviço e acompanhe o primeiro deploy nos logs do Render. O backend escuta em `0.0.0.0` e utiliza a variável `PORT` fornecida pela plataforma.

A configuração final pode ser vista na documentação oficial: https://render.com/docs/web-services e https://render.com/docs/node-version.

## Git: preparar o repositório local (Windows PowerShell)

Na primeira vez, descompacte o projeto, abra o PowerShell dentro da pasta `nosso-story` e execute:

```powershell
.\scripts\preparar-git.ps1
```

O script verifica se o Git está instalado, inicializa o repositório local na branch `main` caso necessário e cria o commit inicial. Se sua identidade Git ainda não estiver configurada, ele perguntará o nome e o e-mail e os salvará apenas neste repositório.

Em seguida, crie um repositório vazio no GitHub (por exemplo, `nosso-story`), sem README, licença ou `.gitignore` inicial. Depois, execute os comandos a seguir na mesma pasta, trocando `SEU-USUARIO` pela sua conta:

```powershell
git remote add origin https://github.com/SEU-USUARIO/nosso-story.git
git push -u origin main
```

Se preferir não usar o script, você pode configurar e inicializar o Git manualmente:

Execute os comandos a seguir dentro da pasta `nosso-story`. Substitua o nome e o e-mail pelos dados associados à sua conta Git. A configuração `--global` normalmente só precisa ser feita uma vez por computador.

```powershell
git config --global user.name "Seu Nome"
git config --global user.email "seu-email@example.com"
git init -b main
git add .
git commit -m "chore: estrutura inicial React e Express"
git remote add origin https://github.com/SEU-USUARIO/nosso-story.git
git push -u origin main
```

Antes do `git remote add`, crie o repositório no GitHub sem README, licença ou `.gitignore` inicial, para evitar conflitos no primeiro envio. Troque `SEU-USUARIO` pela sua conta. Se o repositório já tiver um remoto, veja-o com `git remote -v` antes de adicionar outro.

## Estrutura

```text
nosso-story/
├── client/                 # Aplicação React + Vite
│   └── src/
│       ├── styles/         # Estilos responsivos
│       ├── App.jsx         # Primeira tela e verificação da API
│       └── main.jsx
├── server/                 # API Express
│   ├── src/
│   │   ├── app.js           # Health check e entrega do build
│   │   └── server.js        # Inicialização do servidor
│   └── .env.example
├── database/migrations/    # Migrações futuras do banco
├── package.json            # Scripts e npm workspaces
└── README.md
```

## Próxima etapa prevista

Implementar o banco de dados e o cadastro de convidados, com nome único validado no frontend e no backend, WhatsApp opcional e sessão segura para associar as fotos ao convidado.
