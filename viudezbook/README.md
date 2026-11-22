# Viudezbook — V1

Sua biblioteca de audiobooks. Você envia um PDF (ou adiciona um clássico em domínio público), o app limpa o texto, divide em capítulos e lê para você, com a voz do ElevenLabs ou com a voz do celular (grátis).

A especificação completa está em [VIUDEZBOOK-SPEC.md](VIUDEZBOOK-SPEC.md).

## O que a V1 faz

- **Login** por e-mail com link mágico, sem senha.
- **Enviar PDF:** lê o texto no celular. Se a página for imagem escaneada, usa OCR em português.
- **Limpeza:** tira número de página, cabeçalho, rodapé e hífen de fim de linha, e divide em capítulos.
- **Descobrir:** pesquisa livros em domínio público no Projeto Gutenberg e adiciona com um toque. Cada livro guarda a fonte, o link, a licença e a data da coleta.
- **Biblioteca:** abas Todos, Ouvindo, Quero ler, Li e ★ Favoritos. Busca por título, autor e palavra dentro do texto. Nota de 1 a 5 ao marcar "Li". Exportar em arquivo.
- **Vozes grátis**, escolhidas por livro:
  | Voz | Custo | Onde gera |
  |---|---|---|
  | **Piper** | Grátis e ilimitada | No celular (na 1ª vez baixa a voz; use Wi-Fi) |
  | **ElevenLabs** | Plano grátis (~10 mil letras por mês) | No servidor |
- **Comparar vozes:** ouça cada voz lendo um trecho do seu livro e toque em **Usar**.
- **Resumo em ~12 minutos:** o Gemini (Google, cota grátis) escreve um resumo para ouvir. Ele vira o “★ Resumo” no topo dos capítulos: dá para ler, gerar a voz e ouvir. Uso pessoal.
- **Minha voz:** grave você lendo um texto pronto (1 a 2 minutos). A gravação fica guardada para a próxima etapa: criar a sua voz de graça (via Kaggle).
- **Nunca gera de novo** o que já foi gerado, em nenhuma voz. No ElevenLabs, o app mostra quanto do plano grátis vai usar antes de gerar.
- **Leitura ao vivo:** voz do próprio celular, na hora. Pode parar quando a tela apaga.
- **Player:** velocidade de 0,5x a 3x sem mudar o tom, ±15 e 30 segundos, capítulos, botões do fone e da tela bloqueada. Retoma no mesmo segundo, em qualquer aparelho.

**Tudo aqui é grátis e nenhum serviço pede cartão.** Se alguma tela pedir cartão, pare.

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
## Passo a passo (só serviços grátis)

### Você faz (uma vez só)
1. **Token do Supabase:** em supabase.com/dashboard/account/tokens → **Generate new token** → em **Select projects** marque **meus-apps** → **Preset: Full access** → **Review access** → **Generate token**. Cole no formulário seguro que o Claude abrir.
2. **Chave do ElevenLabs (grátis):** elevenlabs.io → **Developers** → **API Keys** → **Create API Key**. No Supabase: **Edge Functions** → **Secrets** → **Add new secret** → `ELEVENLABS_API_KEY`.
3. **Chave do Gemini (grátis, para o resumo):** aistudio.google.com/apikey → **Create API key**. No Supabase, em **Secrets**: `GEMINI_API_KEY`. (No plano grátis, o Google pode usar o texto enviado para melhorar os produtos dele: preciso confirmar a regra atual no site.)
4. **Vercel (plano Hobby, grátis):** vercel.com/new → **Continue with GitHub** → em `meus-apps` toque em **Import** → **Root Directory**: `viudezbook` → **Deploy**. As duas variáveis (`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`) o Claude te passa prontas para colar em **Environment Variables**.
5. **No Android:** abra o endereço do app no **Chrome** → **⋮** → **Instalar app**. Depois **Configurações** → **Apps** → **Chrome** → **Bateria** → **Sem restrições** (para tocar com a tela apagada).

### O Claude faz sozinho (com o token do passo 1)
- Cria as tabelas, a proteção RLS e as pastas de arquivos no projeto `meus-apps`.
- Publica as funções de servidor.
- Configura o login por e-mail com o endereço da Vercel.
- Testa tudo no seu Supabase de verdade e te diz o que passou.

## Limites do grátis (conferir no site de cada serviço)
- **Supabase:** cerca de 1 GB de arquivos; o projeto pode pausar após uma semana sem uso (reativa com um clique). Áudio ocupa espaço: dá para apagar o áudio de um livro já ouvido.
- **ElevenLabs:** cerca de 10 mil letras por mês (mais ou menos 1 capítulo). Para o resto, use o Piper.
- **Gemini:** cota diária; se acabar, tente no dia seguinte.
- **Vercel Hobby:** sobra para uso pessoal.

## Para quem for mexer no código

```bash
npm install
cp .env.example .env.local   # preencha com os dados públicos do Supabase
npm run dev                   # abre em http://localhost:5173
npm test                      # testes da limpeza de texto
npm run build                 # versão final
```

Nenhuma chave secreta vai para o repositório. O `.env.local` está no `.gitignore`.
