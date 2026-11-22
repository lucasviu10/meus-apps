# VIUDEZBOOK-SPEC.md

Especificação completa do app **Viudezbook**, a biblioteca de audiobooks do Lucas.
Data: 22/11/2026. Idioma do app e das respostas: português.

---

## 0. Levantamento: tudo que foi pedido

| # | O que você pediu | Onde está resolvido |
| --- | --- | --- |
| 1 | Fazer um audiobook: eu envio o PDF e a voz lê para mim | Seções 5 e 6 |
| 2 | Tom humano, sem parecer robô | Seção 5 |
| 3 | Poder mudar a velocidade | Seções 5.4 e 6 |
| 4 | Poder usar a minha própria voz | Seção 5.3 |
| 5 | Não quero programar: quero saber o que o programa completo precisa ter, algo robusto | Este documento inteiro e o prompt da seção 15 |
| 6 | Banco de dados vindo de sites públicos que oferecem PDF para download, tudo armazenado | Seções 3 e 7 |
| 7 | Livros que eu li e livros que eu quero ler | Seção 4.1 |
| 8 | Buscar de forma fácil | Seção 4.3 |
| 9 | Classificar por categorias e "tudo mais" | Seções 4.2 e 4.4 |
| 10 | Poder levar os livros comigo | Seções 4.5 e 6 (offline e exportar) |
| 11 | O app se chama Viudezbook e a logo é bem criativa | Seção 9 |
| 12 | Qual repositório uso no Claude Code | Seção 10: `meus-apps`, pasta `viudezbook` |
| 13 | Backup de tudo junto, no mesmo lugar (esquema do ecossistema) | Seção 10.3 |
| 14 | Posso usar meus outros apps nesse ecossistema | Seção 10.3: sim, o Viudezbook é o 6º app |
| 15 | Quero fazer o Viudezbook agora, não o ecossistema | Seção 13: V1 funciona sozinha; o ecossistema liga depois |
| 16 | Receber o SPEC completo, como os outros | Este arquivo |

---

## 1. Objetivo

Um app no celular onde eu:
- envio um PDF, ou escolho um livro em domínio público de sites públicos, e ele vira audiobook com voz de tom humano;
- ouço com velocidade ajustável, retomando exatamente de onde parei;
- organizo tudo em: quero ler, ouvindo, li, com categorias, tags e busca fácil;
- posso usar uma voz minha;
- levo os livros comigo, mesmo sem internet;
- tenho tudo salvo na nuvem com backup, junto com os meus outros apps.

Nome: **Viudezbook**. Não quero programar: o Claude Code constrói, seguindo este documento.

---

## 2. Quem faz o quê

| Peça | Quem faz |
| --- | --- |
| Buscar e baixar PDFs de fontes públicas | Funções de servidor do app (Supabase) |
| Guardar livros, status, categorias, progresso e arquivos | Supabase (banco e armazenamento) |
| Limpar o texto do PDF e dividir em capítulos | Função de servidor do app |
| Transformar texto em voz | ElevenLabs |
| Player, velocidade, retomar, offline | App no celular |
| Escrever e ajustar o código | Claude Code |

Observação: o Claude do chat não guarda os livros. O banco e os arquivos ficam no seu Supabase.

---

## 3. Fontes de livros

A coleta automática trata só de livros em **domínio público**. PDFs que eu comprei entram por upload manual, privados.

| Fonte | O que tem | Observação |
| --- | --- | --- |
| Domínio Público (MEC), dominiopublico.gov.br | Obras em português, muitos PDFs | Maior acervo oficial em PT-BR; muitos PDFs são imagem escaneada e precisam de OCR |
| Biblioteca Nacional Digital, bndigital.bn.gov.br | Acervo histórico brasileiro | Conferir a licença de cada item |
| Projeto Gutenberg, gutenberg.org | Clássicos em vários idiomas, inclusive português | Já vem em texto, ótimo para voz |
| Wikisource em português | Obras transcritas por voluntários | Texto limpo, sem OCR |
| Internet Archive, archive.org | Milhões de itens | A licença varia item a item |
| Brasiliana Guita e José Mindlin (USP) | Obras raras brasileiras | Bom para clássicos nacionais |
| LibriVox, librivox.org | Audiolivros de voluntários | Já em áudio e em domínio público, mas não na minha voz |

Regras:
- No Brasil, uma obra entra em domínio público 70 anos depois da morte do autor, contados a partir de 1º de janeiro do ano seguinte (Lei 9.610/1998). Outros países têm prazos diferentes.
- Tradução, revisão e edição modernas podem ter direitos próprios. O app só marca "licença confirmada" quando a fonte diz isso.
- Ler os termos de uso de cada site antes de coletar em volume, e coletar devagar.
- Cada livro guarda: fonte, link original, licença e data da coleta.
- PDF comprado: uso pessoal; o áudio gerado dele nunca é compartilhado.

---

## 4. Biblioteca

### 4.1 Status
Quero ler, Ouvindo, Li, Abandonado. Ao marcar "Li", o app pede nota de 1 a 5 e guarda a data de término. O app guarda também a data de início.

### 4.2 Categorias e organização
- Categorias de gênero (romance, poesia, filosofia, negócios, história, finanças e outras que eu criar), cada uma com cor.
- Tags livres.
- Coleções, como "Para ouvir no carro" ou "Clássicos brasileiros".
- Campos por livro: autor, idioma, ano, época, capa, duração, número de capítulos.

### 4.3 Busca fácil
- Uma caixa de busca no topo, sempre à mão.
- Busca por título, autor, tag e dentro do texto do livro (busca de texto completo no banco).
- Filtros combináveis: status, categoria, autor, idioma, duração, nota.
- Ordenação: mais recente, mais curto, melhor nota, ordem alfabética.
- Busca nas fontes públicas na tela Descobrir (seção 8).

### 4.4 Tudo mais
- **Notas e trechos:** marcar uma frase enquanto ouve, escrever uma nota, ver todas em uma tela.
- **Metas:** livros por mês, minutos por dia, sequência de dias ouvindo.
- **Estatísticas:** livros por mês, tempo ouvido, categorias mais ouvidas.
- **Sugestões:** livros curtos primeiro e obras parecidas com as de nota alta.
- **Duplicados:** avisar se o livro já está na biblioteca.

### 4.5 Levar os livros
- Baixar o livro para ouvir sem internet.
- Exportar a biblioteca (lista, status, notas) em arquivo JSON.
- Baixar o texto do livro em arquivo.

---

## 5. Motor de áudio

### 5.1 Do PDF ao áudio
1. Extrair o texto do PDF; se for imagem escaneada, rodar OCR.
2. Limpar: tirar número de página, cabeçalho, rodapé, notas e hífens de fim de linha.
3. Dividir em capítulos e em blocos pequenos, respeitando o limite de caracteres por geração do ElevenLabs (confirmar no site).
4. Marcar pausas, títulos e diálogos. Manter um dicionário de pronúncia para nomes, siglas e números.
5. Gerar o áudio de cada bloco com a voz escolhida e juntar por capítulo.
6. Guardar o arquivo de áudio e o tempo de cada parágrafo, para o texto acompanhar.
7. Nunca gerar de novo o que já existe. Só se mudar o texto ou a voz.
8. Modo "ouvir já": gerar primeiro o capítulo 1 e liberar para ouvir enquanto os outros geram.
9. Antes de gerar, mostrar a estimativa de custo e pedir confirmação.

### 5.2 Voz de tom humano
- O app lista as vozes do ElevenLabs que falam português e eu escolho uma voz padrão e, se quiser, uma por livro.
- Cada voz tem uma amostra de 10 segundos para testar.
- Antes de gerar um livro inteiro, gerar só um capítulo de teste para conferir o português e a naturalidade.
- Dá para criar uma voz nova por descrição (por exemplo, "voz masculina, grave e calma") e salvá-la.

### 5.3 Minha própria voz
- O ElevenLabs oferece clonagem de voz a partir de uma gravação minha. Plano, requisitos e regras: confirmar no site.
- A clonagem é feita no site do ElevenLabs; o app guarda o código da voz e a usa como qualquer outra.
- Regras: só a minha voz, nunca a de outra pessoa sem autorização; a voz fica na minha conta e não é compartilhada.

### 5.4 Velocidade
- Principal: no player, de 0,5x a 3x, sem custo e sem gerar de novo, mantendo o tom natural da voz.
- Avançado: ritmo de fala na geração, só se eu quiser mudar a naturalidade.

### 5.5 Plano B grátis
Voz do próprio celular, menos natural, para ouvir sem gastar crédito.

---

## 6. Player

- Velocidade de 0,5x a 3x, em passos pequenos, sem mudar o tom; a velocidade fica salva por livro.
- Retomar no mesmo ponto, em qualquer aparelho.
- Pular 15 ou 30 segundos; capítulo anterior e próximo.
- Timer para dormir: 15, 30, 60 minutos ou fim do capítulo.
- Marcadores e notas com um toque durante a audição.
- Texto acompanhando: o parágrafo atual fica destacado; tocar em um parágrafo leva o áudio até ele.
- Segundo plano: continua com a tela bloqueada e responde aos botões do fone e do carro (confirmar o comportamento no meu celular na V1).
- Offline: baixar o livro para ouvir sem internet.
- Modo carro: botões grandes e poucas opções.

---

## 7. Banco de dados (Supabase)

Todas as tabelas têm `usuario_id` e proteção RLS: só eu vejo meus dados.

| Tabela | Campos principais |
| --- | --- |
| livros | id, título, subtítulo, idioma, ano, capa, status, nota, iniciado_em, terminado_em, duração_total, criado_em |
| autores | id, nome, ano_nascimento, ano_morte |
| livro_autor | livro_id, autor_id |
| fontes | id, nome, endereço_site, regra_licença |
| origem_livro | livro_id, fonte_id, link_original, licença, licença_confirmada, coletado_em |
| categorias | id, nome, cor |
| livro_categoria | livro_id, categoria_id |
| tags e livro_tag | id, nome; livro_id, tag_id |
| colecoes e colecao_livros | id, nome; colecao_id, livro_id, ordem |
| arquivos | id, livro_id, tipo (pdf, texto, capa), caminho, tamanho |
| capitulos | id, livro_id, número, título, texto, duração |
| audios | id, capitulo_id, voz_id, caminho, duração, tempos_por_parágrafo, gerado_em |
| vozes | id, nome, código_elevenlabs, tipo (pronta, criada, minha), idioma |
| pronuncias | id, livro_id (ou geral), palavra, como_falar |
| progresso | livro_id, capitulo_id, segundo, velocidade, aparelho, atualizado_em |
| notas | id, livro_id, capitulo_id, segundo, trecho, texto, criado_em |
| metas | id, tipo, valor, período |
| fila_processamento | id, livro_id, etapa (baixar, ocr, limpar, voz), estado, erro, atualizado_em |

Armazenamento (Supabase Storage): pastas para PDFs, textos, áudios e capas.
Busca no texto: busca de texto completo do próprio Postgres.

---

## 8. Telas

| Tela | O que mostra |
| --- | --- |
| Início | Continuar ouvindo, últimos adicionados, meta do dia |
| Biblioteca | Abas Quero ler, Ouvindo e Li; busca; filtros |
| Descobrir | Busca nas fontes públicas, botão "Adicionar" e aviso de licença |
| Livro | Capa, resumo, capítulos, status, nota, categorias, notas e trechos |
| Player | Controles, velocidade, texto acompanhando, timer, marcador |
| Fila | Download, OCR e geração de voz de cada livro, com erro e "tentar de novo" |
| Vozes | Lista, amostra, criar voz, usar a minha |
| Estatísticas e metas | Livros por mês, minutos por dia, sequência, categorias |

Menu: Backup, Restaurar, Conta, Exportar biblioteca, Modo escuro, Sobre.
No Hub "Meus Apps", o Viudezbook é o 6º cartão, com a sua logo.

---

## 9. Marca e logo

Nome: **Viudezbook** (sobrenome + livro). A logo precisa ser original e bem criativa, ligando livro e áudio. Três direções:
1. **V-livro:** um "V" formado por duas páginas abertas, com uma onda sonora no meio.
2. **Livro de fone:** a capa de um livro usando fones de ouvido.
3. **Página que fala:** uma página com a dobra em formato de balão de fala.

Regras:
- Nada parecido com logos conhecidos. Como o nome termina em "book", evitar letra isolada e azul-e-branco de redes sociais.
- Uma cor forte única mais neutros.
- Funcionar em tamanho pequeno de ícone.

Entregas: ícone quadrado do app, versão clara e escura, versão de uma cor só, tela de abertura.
Se algum material for divulgado na Ademicon, precisa de aprovação do Trade Marketing; para uso pessoal, não.

---

## 10. Arquitetura, repositório e ecossistema

### 10.1 Peças

```
Fontes públicas -> Funções de servidor (coletar, limpar, gerar voz) <-> ElevenLabs
                              |
                              v
                      Supabase (banco, arquivos, login)
                              ^
                              |
                   App Viudezbook no celular
```

- As chaves secretas (ElevenLabs e outras) ficam só no servidor, nunca no app e nunca no repositório.
- Funções de servidor previstas: `coletar-livro`, `preparar-texto`, `gerar-voz`.

### 10.2 Repositório
Use o repositório **`meus-apps`** (github.com/lucasviu10/meus-apps), que já existe. O app fica na pasta `viudezbook`. Não usar `Nestle`, `ADEMICON` nem `meus-gastos`, que são de outros apps.

### 10.3 Ecossistema
- O Viudezbook é o 6º app do ecossistema: Nestlé, Ademicon (Painel de Vendas), Minha Casa, Treino, Rotina e Viudezbook.
- Os apps continuam separados. Só o "núcleo" é comum: login, salvamento na nuvem, atualização automática e backup.
- O Viudezbook **não depende** do ecossistema para começar. A V1 funciona sozinha, com login por e-mail (link mágico) no mesmo projeto Supabase `meus-apps`. Quando o núcleo existir, o Viudezbook se liga a ele (fase V4).
- Backup: entram biblioteca, status, categorias, notas, progresso, metas e o texto dos livros. **Não entram os arquivos de áudio**, que são pesados e podem ser gerados de novo a partir do texto.
- Atualização automática pelo próprio app, sem reinstalar; ao abrir e ao voltar do segundo plano.

---

## 11. Segurança, LGPD e direitos autorais

- Nada de CPF ou documento em nenhum lugar do app.
- Proteção RLS em todas as tabelas.
- Nenhuma chave secreta no repositório. Só o código vai para o GitHub.
- Ativar verificação em duas etapas no GitHub e no Supabase.
- A voz clonada é dado pessoal: fica só na minha conta.
- Direitos autorais: campo de licença obrigatório e aviso na tela (seção 3).

---

## 12. Custos e riscos

Valores de planos e limites: confirmar no site de cada serviço antes de decidir.

| Risco | Por que importa | Como o app trata |
| --- | --- | --- |
| Custo da voz | Livro grande tem muito texto | Gerar por capítulo, usar cache, mostrar estimativa antes |
| Espaço de armazenamento | Áudio de livro longo é pesado | Arquivo compactado, opção de apagar o áudio e manter o texto |
| PDF escaneado | O OCR erra palavras e a voz lê o erro | Revisão por amostra e botão de corrigir o texto do capítulo |
| Direitos autorais | Nem todo PDF público é de domínio público | Licença obrigatória e aviso |
| Voz clonada | É dado pessoal | Só a minha voz, só na minha conta |
| Chaves de acesso | Quem tiver a chave gasta os créditos | Chaves só no servidor |
| Qualidade em português | Nem toda voz lê bem em PT-BR | Teste de um capítulo antes do livro |
| Pausa do projeto grátis | O Supabase grátis pode pausar sem uso | Conferir regras do plano; usar o app com frequência |

---

## 13. Fases

1. **V1, ouvir um livro:** upload de PDF, limpeza do texto, uma voz, player com velocidade e retomar de onde parou. Pronta quando eu ouço um livro inteiro, do começo ao fim.
2. **V2, biblioteca de verdade:** status, categorias, tags, busca; busca nas fontes públicas e download automático. Pronta quando eu adiciono um clássico sem sair do app.
3. **V3, vozes e conforto:** escolher e criar voz, usar a minha, dicionário de pronúncia, texto acompanhando, offline e timer. Pronta quando a leitura não soa robótica para mim.
4. **V4, hábito e ecossistema:** metas, estatísticas, notas, trechos, sugestões; ligação ao núcleo (backup e atualização automáticos) e cartão no Hub. Pronta quando eu ouço todo dia por duas semanas.
5. **V5, extras:** modo carro, widgets, listas compartilháveis de livros em domínio público.

Só avançar quando a fase anterior passar na lista da seção 14.

---

## 14. Perícia: o que precisa funcionar

- [ ] Subir um PDF de texto e receber o áudio do capítulo 1.
- [ ] Subir um PDF escaneado e o OCR gerar texto legível.
- [ ] O texto não traz número de página, cabeçalho nem rodapé.
- [ ] A voz de teste soa natural em português.
- [ ] Mudar a velocidade no player não muda o tom e não gera áudio novo.
- [ ] Fechar o app e abrir de novo: retoma no mesmo segundo.
- [ ] Ouvir com a tela bloqueada e usar os botões do fone.
- [ ] Gerar o mesmo capítulo de novo não gasta crédito (cache).
- [ ] A estimativa de custo aparece antes de gerar.
- [ ] Mover um livro entre Quero ler, Ouvindo e Li.
- [ ] Criar categoria e tag, e filtrar por elas.
- [ ] Buscar por título, autor e por uma palavra dentro do texto.
- [ ] Buscar um livro nas fontes públicas, adicionar e ouvir.
- [ ] Cada livro mostra fonte, licença e data da coleta.
- [ ] Baixar um livro e ouvir sem internet.
- [ ] Exportar a biblioteca em arquivo.
- [ ] Usar a minha voz (clonada) em um capítulo.
- [ ] Marcar um trecho e vê-lo na tela de notas.
- [ ] Entrar com a mesma conta em outro aparelho: biblioteca e progresso iguais.
- [ ] Backup automático roda todo dia e aparece com data e hora (a partir da V4).
- [ ] Restaurar um backup devolve biblioteca e notas.
- [ ] Nenhuma chave secreta no repositório.

---

## 15. Prompt para colar no Claude Code

Anexe este arquivo na conversa do Claude Code, dentro do repositório `meus-apps`, e cole:

> Leia o arquivo VIUDEZBOOK-SPEC.md. Salve-o em `viudezbook/VIUDEZBOOK-SPEC.md` no repositório meus-apps. Antes de codar, me faça no máximo 5 perguntas e mostre a estrutura de pastas. Depois implemente **só a V1** (seção 13): upload de PDF, extração e limpeza do texto (com OCR quando for imagem), divisão em capítulos, geração de voz com o ElevenLabs por função de servidor, e player com velocidade de 0,5x a 3x e retomar de onde parou. Use o projeto Supabase meus-apps, com login por e-mail (link mágico) e proteção RLS. A chave do ElevenLabs fica só no servidor e nunca no repositório. Nunca gere de novo o áudio que já existe e mostre a estimativa de custo antes de gerar. Ao final, rode a lista da seção 14 que couber na V1 e me diga o que passou e o que falhou. Explique cada passo manual com os nomes dos botões em português e responda sempre em português.

---

## 16. Para confirmar antes de começar

- Entendi "sites públicos" como sites de livros em domínio público. Confirmar.
- Ter conta no ElevenLabs e conferir o plano (limites de caracteres e clonagem de voz).
- Confirmar se o celular é Android ou iPhone, para testar o áudio com a tela bloqueada.
- Escolher 1 livro curto de domínio público para o teste da V1.
- Definir se a minha voz será clonada já na V3 (preciso de uma gravação limpa, sem ruído).
- Conferir os limites do plano grátis do Supabase (armazenamento e pausa por inatividade).
- Qual das três direções de logo seguir, ou pedir novas.
