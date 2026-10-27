-- Nosso Story: estrutura inicial do banco e bucket privado de fotografias.
-- Execute este arquivo inteiro no SQL Editor do projeto Supabase.

create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  normalized_name text not null unique,
  whatsapp text null check (whatsapp is null or char_length(whatsapp) between 10 and 15),
  session_token_hash text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists guests_created_at_idx
  on public.guests (created_at desc);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  storage_path text not null unique,
  caption text null check (caption is null or char_length(caption) <= 100),
  emoji text null check (emoji is null or char_length(emoji) <= 8),
  filter_key text not null default 'natural'
    check (filter_key in ('natural', 'warm', 'mono', 'rose', 'soft')),
  status text not null default 'published'
    check (status in ('pending', 'published', 'hidden')),
  created_at timestamptz not null default now()
);

create index if not exists photos_guest_created_at_idx
  on public.photos (guest_id, created_at desc);
create index if not exists photos_published_created_at_idx
  on public.photos (created_at desc)
  where status = 'published';

-- Configurações do evento, usadas pelo painel master em uma próxima etapa.
create table if not exists public.app_settings (
  id boolean primary key default true check (id = true),
  couple_names text not null default 'Nosso casamento',
  logo_path text null,
  primary_color text not null default '#A64E68',
  background_color text not null default '#FBF8F4',
  text_color text not null default '#30272C',
  slideshow_interval_seconds integer not null default 7
    check (slideshow_interval_seconds between 3 and 30),
  auto_publish boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id)
values (true)
on conflict (id) do nothing;

-- As tabelas não são acessíveis diretamente pelo navegador. O backend usa uma chave
-- privilegiada guardada em variável de ambiente e faz validação de sessão por cookie.
alter table public.guests enable row level security;
alter table public.photos enable row level security;
alter table public.app_settings enable row level security;

revoke all on table public.guests from anon, authenticated;
revoke all on table public.photos from anon, authenticated;
revoke all on table public.app_settings from anon, authenticated;
grant all on table public.guests to service_role;
grant all on table public.photos to service_role;
grant all on table public.app_settings to service_role;

-- Bucket privado: o backend envia arquivos e cria URLs assinadas temporárias.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wedding-photos', 'wedding-photos', false, 8388608, array['image/jpeg']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg']::text[];

-- Não são criadas policies para anon/authenticated em storage.objects. O upload e
-- leitura passam exclusivamente pelo backend; service_role tem acesso privilegiado.
