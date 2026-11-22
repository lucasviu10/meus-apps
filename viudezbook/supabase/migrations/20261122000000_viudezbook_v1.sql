-- Viudezbook V1: tabelas, proteção RLS e pastas de arquivos.
-- Todas as tabelas começam com "vb_" para não misturar com os outros apps
-- do mesmo projeto Supabase (meus-apps).
-- Pode rodar de novo sem estragar nada.

-- ---------- Livros ----------
create table if not exists public.vb_livros (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo text not null,
  autor text,
  idioma text default 'pt',
  ano int,
  capa_url text,
  status text not null default 'quero_ler'
    check (status in ('quero_ler', 'ouvindo', 'li', 'abandonado')),
  favorito boolean not null default false,
  nota int check (nota between 1 and 5),
  iniciado_em timestamptz,
  terminado_em timestamptz,
  num_capitulos int not null default 0,
  total_caracteres int not null default 0,
  duracao_total numeric not null default 0,
  voz_id text,
  voz_nome text,
  modelo text not null default 'eleven_multilingual_v2',
  pdf_caminho text,
  -- origem (direitos autorais)
  fonte text,
  link_original text,
  licenca text,
  licenca_confirmada boolean not null default false,
  coletado_em timestamptz,
  -- processamento
  estado text not null default 'novo' check (estado in ('novo', 'processando', 'pronto', 'erro')),
  erro text,
  criado_em timestamptz not null default now()
);
create unique index if not exists vb_livros_link_unico
  on public.vb_livros (usuario_id, link_original) where link_original is not null;
create index if not exists vb_livros_usuario on public.vb_livros (usuario_id, criado_em desc);

-- ---------- Capítulos ----------
create table if not exists public.vb_capitulos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  livro_id uuid not null references public.vb_livros(id) on delete cascade,
  numero int not null,
  titulo text,
  texto text not null,
  caracteres int not null default 0,
  blocos int not null default 1, -- quantos arquivos de áudio o capítulo terá
  busca tsvector generated always as
    (to_tsvector('portuguese', coalesce(titulo, '') || ' ' || texto)) stored,
  unique (livro_id, numero)
);
create index if not exists vb_capitulos_busca on public.vb_capitulos using gin (busca);

-- ---------- Áudios (um arquivo por bloco de texto) ----------
create table if not exists public.vb_audios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  livro_id uuid not null references public.vb_livros(id) on delete cascade,
  capitulo_id uuid not null references public.vb_capitulos(id) on delete cascade,
  bloco int not null,
  voz_id text not null,
  modelo text not null,
  hash text not null, -- impressão digital de (texto + voz + modelo): evita gerar de novo
  caminho text not null,
  caracteres int not null,
  duracao numeric not null,
  tamanho int,
  gerado_em timestamptz not null default now(),
  unique (capitulo_id, bloco, hash)
);
create index if not exists vb_audios_capitulo on public.vb_audios (capitulo_id, voz_id, modelo, bloco);

-- ---------- Progresso (onde parei) ----------
create table if not exists public.vb_progresso (
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  livro_id uuid not null references public.vb_livros(id) on delete cascade,
  capitulo_id uuid references public.vb_capitulos(id) on delete set null,
  segundo numeric not null default 0,
  trecho int not null default 0, -- posição na voz do celular
  velocidade numeric not null default 1 check (velocidade between 0.5 and 3),
  modo text not null default 'elevenlabs' check (modo in ('elevenlabs', 'celular')),
  aparelho text,
  atualizado_em timestamptz not null default now(),
  primary key (usuario_id, livro_id)
);

-- ---------- RLS: só eu vejo meus dados ----------
do $$
declare t text;
begin
  foreach t in array array['vb_livros', 'vb_capitulos', 'vb_audios', 'vb_progresso'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format(
      'create policy "dono" on public.%I for all to authenticated
         using (usuario_id = (select auth.uid()))
         with check (usuario_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ---------- Arquivos (Storage) ----------
-- Pastas privadas. Cada arquivo fica em <meu id>/..., e só eu acesso.
insert into storage.buckets (id, name, public, file_size_limit)
values ('vb-pdfs', 'vb-pdfs', false, 52428800),
       ('vb-audios', 'vb-audios', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "vb dono le" on storage.objects;
drop policy if exists "vb dono grava" on storage.objects;
drop policy if exists "vb dono altera" on storage.objects;
drop policy if exists "vb dono apaga" on storage.objects;

create policy "vb dono le" on storage.objects for select to authenticated
  using (bucket_id in ('vb-pdfs', 'vb-audios') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "vb dono grava" on storage.objects for insert to authenticated
  with check (bucket_id in ('vb-pdfs', 'vb-audios') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "vb dono altera" on storage.objects for update to authenticated
  using (bucket_id in ('vb-pdfs', 'vb-audios') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "vb dono apaga" on storage.objects for delete to authenticated
  using (bucket_id in ('vb-pdfs', 'vb-audios') and (storage.foldername(name))[1] = (select auth.uid())::text);
