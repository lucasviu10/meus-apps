# Viudezbook — V1

Sua biblioteca de audiobooks. Você envia um PDF (ou adiciona um clássico em domínio público), o app limpa o texto, divide em capítulos e lê para você, com a voz do ElevenLabs ou com a voz do celular (grátis).

A especificação completa está em [VIUDEZBOOK-SPEC.md](VIUDEZBOOK-SPEC.md).

## O que a V1 faz

- **Login** por e-mail com link mágico, sem senha.
- **Enviar PDF:** lê o texto no celular. Se a página for imagem escaneada, usa OCR em português.
- **Limpeza:** tira número de página, cabeçalho, rodapé e hífen de fim de linha, e divide em capítulos.
- **Descobrir:** pesquisa livros em domínio público no Projeto Gutenberg e adiciona com um toque. Cada livro guarda a fonte, o link, a licença e a data da coleta.
- **Biblioteca:** abas Todos, Ouvindo, Quero ler, Li e ★ Favoritos. Busca por título, autor e palavra dentro do texto. Nota de 1 a 5 ao marcar "Li". Exportar em arquivo.
- **Voz ElevenLabs:** gerada por capítulo. A estimativa de custo e o seu saldo aparecem **antes**, e só gera depois de **Confirmar e gerar**. O que já foi gerado nunca é gerado de novo.
- **Voz do celular:** grátis, menos natural, sem gastar crédito.
- **Player:** velocidade de 0,5x a 3x sem mudar o tom, ±15 e 30 segundos, capítulo anterior e próximo, botões do fone e da tela bloqueada. Retoma no mesmo segundo, em qualquer aparelho.

## Peças

```
viudezbook/
├── src/                       app (React), roda no celular
│   ├── lib/                   PDF, OCR, tocadores, progresso, conexão
│   └── telas/                 Login, Biblioteca, Descobrir, Enviar PDF, Livro, Player
├── supabase/
│   ├── migrations/            tabelas vb_*, proteção RLS e pastas de arquivos
│   └── functions/
│       ├── _shared/texto.ts   limpeza e divisão em capítulos (com testes)
│       ├── preparar-texto/    limpa o texto do PDF e salva os capítulos
│       ├── coletar-livro/     busca e baixa livros do Projeto Gutenberg
│       └── gerar-voz/         única peça que conhece a chave do ElevenLabs
└── tests/                     testes automáticos (npm test)
```

As tabelas começam com `vb_` para não misturar com os outros apps do projeto `meus-apps`.

---

## Passo a passo para colocar no ar (uma vez só)

### 1. Banco de dados no Supabase
1. Entre em **supabase.com** e abra o projeto **meus-apps**. Se ele não existir, clique em **New project**, dê o nome `meus-apps` e escolha a região **South America (São Paulo)**.
2. No menu da esquerda, clique em **SQL Editor** e depois em **New query**.
3. Abra o arquivo `supabase/migrations/20261122000000_viudezbook_v1.sql`, copie tudo, cole na tela e clique em **Run**.
4. Deve aparecer **Success. No rows returned**.

### 2. Login por e-mail
1. No Supabase: **Authentication** → **Sign In / Providers** → confira se **Email** está ligado.
2. Depois que a Vercel der o endereço do app (passo 5), volte em **Authentication** → **URL Configuration**:
   - Em **Site URL**, coloque o endereço do app (ex.: `https://viudezbook.vercel.app`).
   - Em **Redirect URLs**, clique em **Add URL** e coloque o mesmo endereço.
3. Atenção: o e-mail grátis do Supabase manda poucos links por hora. Se aparecer "Muitos pedidos seguidos", espere alguns minutos.

### 3. Chave do ElevenLabs (fica só no Supabase)
1. Entre em **elevenlabs.io** → **Developers** → **API Keys** → **Create API Key**.
2. Dê o nome `viudezbook`. Nas permissões, deixe ligado pelo menos **Text to Speech**, **Voices (Read)** e **User (Read)**, que mostra o seu saldo.
3. Copie a chave. **Não cole em nenhum outro lugar.**
4. No Supabase: **Edge Functions** → **Secrets** → **Add new secret**.
   - Name: `ELEVENLABS_API_KEY`
   - Value: a chave copiada
   - Clique em **Save**.

### 4. Publicar as funções de servidor (automático pelo GitHub)
1. No Supabase, clique na sua foto → **Account preferences** → **Access Tokens** → **Generate new token**. Dê o nome `github-meus-apps` e copie o token.
2. No Supabase, abra **Project Settings** → **General** e copie o **Project ID**.
3. No GitHub, abra o repositório **meus-apps** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Crie dois:
   - `SUPABASE_ACCESS_TOKEN` = o token do item 1
   - `SUPABASE_PROJECT_REF` = o Project ID do item 2
4. Com este código já na branch `main`, vá em **Actions** → **Viudezbook - publicar funções no Supabase** → **Run workflow** → **Run workflow**.
5. Espere ficar verde ✅. A partir daí, toda mudança nas funções é publicada sozinha.

### 5. Colocar o app online na Vercel
1. Entre em **vercel.com** com a sua conta do GitHub.
2. Clique em **Add New…** → **Project** → em `meus-apps`, clique em **Import**.
3. Em **Root Directory**, clique em **Edit** e escolha **viudezbook**. O **Framework Preset** fica **Vite**.
4. Abra **Environment Variables** e adicione os dois valores que ficam em Supabase → **Project Settings** → **API**:
   - `VITE_SUPABASE_URL` = o **Project URL**
   - `VITE_SUPABASE_ANON_KEY` = a chave **anon public** (ou **publishable**). Essa chave é pública e pode ficar no app.
5. Clique em **Deploy**. No fim aparece o endereço do app. Use esse endereço no passo 2.2.

### 6. Instalar no Android
1. Abra o endereço do app no **Chrome** do celular.
2. Toque nos **três pontinhos (⋮)** → **Instalar app** (ou **Adicionar à tela inicial**).
3. Entre com o seu e-mail e toque no link que chegar.

---

## Custos (conferir sempre no site de cada serviço)

- **ElevenLabs grátis:** a sua conta tem 10.000 créditos por mês, um capítulo médio. No modo "Mais natural", 1 letra gasta 1 crédito. No "Econômico", ½ crédito. O app mostra a estimativa antes de gerar. O plano grátis pode ter regras próprias, como uso de vozes da biblioteca e atribuição: **preciso confirmar no site**.
- **Supabase grátis:** tem limite de espaço e pode pausar o projeto se ficar uma semana sem uso. Áudio ocupa espaço, então gere por capítulo.
- **Vercel grátis:** suficiente para uso pessoal.

## Para quem for mexer no código

```bash
npm install
cp .env.example .env.local   # preencha com os dados públicos do Supabase
npm run dev                   # abre em http://localhost:5173
npm test                      # testes da limpeza de texto
npm run build                 # versão final
```

Nenhuma chave secreta vai para o repositório. O `.env.local` está no `.gitignore`.
