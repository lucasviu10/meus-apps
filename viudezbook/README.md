# Viudezbook — V1

Sua biblioteca de audiobooks. Você envia um PDF (ou adiciona um clássico em domínio público), o app limpa o texto, divide em capítulos e lê para você, com a voz do ElevenLabs ou com a voz do celular (grátis).

A especificação completa está em [VIUDEZBOOK-SPEC.md](VIUDEZBOOK-SPEC.md).

## O que a V1 faz

- **Login** por e-mail com link mágico, sem senha.
- **Enviar PDF:** lê o texto no celular. Se a página for imagem escaneada, usa OCR em português.
- **Limpeza:** tira número de página, cabeçalho, rodapé e hífen de fim de linha, e divide em capítulos.
- **Descobrir:** pesquisa livros em domínio público no Projeto Gutenberg e adiciona com um toque. Cada livro guarda a fonte, o link, a licença e a data da coleta.
- **Biblioteca:** abas Todos, Ouvindo, Quero ler, Li e ★ Favoritos. Busca por título, autor e palavra dentro do texto. Nota de 1 a 5 ao marcar "Li". Exportar em arquivo.
- **Todas as vozes num lugar só**, escolhidas por livro:
  | Voz | Custo | Onde gera |
  |---|---|---|
  | **Piper** | Grátis e ilimitada | No celular (na 1ª vez baixa a voz; use Wi-Fi) |
  | **Google** | Cota grátis por mês (confirmar no site) | No servidor |
  | **Microsoft (Azure)** | Cota grátis por mês (confirmar no site) | No servidor |
  | **ElevenLabs** | Créditos do seu plano | No servidor |
- **Comparar vozes:** ouça cada voz lendo um trecho do seu livro e toque em **Usar**.
- **Minha voz:** grave você lendo um texto pronto (1 a 2 minutos). O app confere volume e duração, guarda a gravação na sua conta e cria a sua voz no ElevenLabs com um toque. Criar voz exige o plano Starter do ElevenLabs ou acima (pago; confira o preço no site). Só a sua voz, nunca a de outra pessoa.
- **Custo antes:** nos serviços pagos, a estimativa e o saldo aparecem antes, e só gera depois de **Confirmar e gerar**. O que já foi gerado nunca é gerado de novo, em nenhuma voz.
- **Leitura ao vivo:** voz do próprio celular, na hora, sem gerar arquivo. Pode parar quando a tela apaga.
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

### 3b. Google e Microsoft (opcionais, para comparar)
Sem eles o app funciona com o Piper e o ElevenLabs. Eles aparecem como "falta configurar" até você cadastrar.

**Google**
1. Entre em **console.cloud.google.com**, crie um projeto (ex.: `viudezbook`) e, se pedir, cadastre o cartão. O Google exige o cartão mesmo dentro da cota grátis: confira os limites e coloque um **alerta de orçamento** em **Faturamento** → **Orçamentos e alertas**.
2. No menu: **APIs e serviços** → **Biblioteca** → procure **Cloud Text-to-Speech API** → **Ativar**.
3. **APIs e serviços** → **Credenciais** → **Criar credenciais** → **Chave de API**. Depois clique em **Restringir chave** e escolha só a **Cloud Text-to-Speech API**.
4. No Supabase, em **Edge Functions** → **Secrets** → **Add new secret**: `GOOGLE_TTS_API_KEY` = a chave.

**Microsoft (Azure)**
1. Entre em **portal.azure.com** → **Criar um recurso** → procure **Speech** (Fala) → **Criar**.
2. Em **Tipo de preço**, escolha **Free F0**. Em **Região**, escolha **Brazil South**.
3. Depois de criado, abra **Chaves e Ponto de Extremidade** e copie a **Chave 1**.
4. No Supabase, em **Secrets**, crie `AZURE_SPEECH_KEY` = a chave e `AZURE_SPEECH_REGION` = `brazilsouth`.

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

### 6b. Gravar a sua voz
1. No app, toque em **☰** → **Gravar minha voz**.
2. Marque **“Esta é a minha própria voz”** e toque em **● Começar a gravar**. Na 1ª vez, o Chrome pergunta: toque em **Permitir** no microfone.
3. Leia o texto inteiro no seu tom normal e toque em **■ Parar**. Ouça; se aparecer aviso, grave de novo.
4. Toque em **Guardar gravação** e depois em **Criar minha voz no ElevenLabs**.
5. A voz aparece como **“Minha voz”** em **Comparar vozes** → ElevenLabs. Toque em **Usar**.

### 7. Para tocar com a tela apagada (estilo Spotify)
O áudio gerado (Piper, Google, Microsoft ou ElevenLabs) toca com a tela apagada e aparece na notificação com os botões. Para o Android não cortar o som:
1. **Configurações** → **Apps** → **Chrome** → **Bateria** → **Sem restrições**. Se o app aparecer na lista como **Viudezbook**, faça o mesmo nele.
2. A **Leitura ao vivo** (voz do celular na hora) não tem essa garantia: use áudio gerado quando for apagar a tela.

---

## Custos (conferir sempre no site de cada serviço)

- **Piper:** grátis e sem limite. Gasta só bateria e espaço: cerca de 30 MB por hora de áudio no Supabase.
- **Google e Microsoft:** cota grátis por mês. Os valores mudam, então **preciso confirmar no site** de cada um.
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
