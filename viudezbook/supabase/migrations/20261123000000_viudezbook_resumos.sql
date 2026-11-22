-- Viudezbook: resumo de ~12 minutos de cada livro.
-- O texto do resumo vira o "capítulo 0" do livro (dá para ler, gerar voz e ouvir).
-- Esta tabela só guarda o andamento. Pode rodar de novo sem estragar nada.

create table if not exists public.vb_resumos (
  livro_id uuid primary key references public.vb_livros(id) on delete cascade,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  estado text not null default 'gerando' check (estado in ('gerando', 'pronto', 'erro')),
  provedor text not null check (provedor in ('gemini', 'claude')),
  modelo text,
  capitulo_id uuid references public.vb_capitulos(id) on delete set null,
  palavras int,
  erro text,
  atualizado_em timestamptz not null default now()
);

alter table public.vb_resumos enable row level security;
drop policy if exists "dono" on public.vb_resumos;
create policy "dono" on public.vb_resumos for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));
