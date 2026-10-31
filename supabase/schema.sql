-- Second Cerveau : schéma Supabase
-- À coller en entier dans Supabase > SQL Editor > New query, puis "Run".
-- Le script peut être relancé sans risque (il ne supprime aucune donnée).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Éléments : inbox, tâches, projets, notes et domaines dans une seule table
-- ---------------------------------------------------------------------------
create table if not exists public.items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind           text not null default 'inbox' check (kind in ('inbox','task','project','note','area')),
  status         text not null default 'active' check (status in ('active','waiting','someday','done','trashed')),
  title          text not null default '',
  body           text not null default '',
  url            text,
  image_path     text,
  parent_id      uuid references public.items(id) on delete set null,
  contexts       text[] not null default '{}',
  tags           text[] not null default '{}',
  duration_min   int,
  energy         text check (energy in ('low','medium','high')),
  due_date       date,
  scheduled_date date,
  scheduled_time time,
  day_order      double precision,
  waiting_for    text,
  recurrence     text check (recurrence in ('daily','weekdays','weekly','monthly','yearly')),
  source         text not null default 'app',
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists items_user_updated_idx on public.items (user_id, updated_at);

-- updated_at est toujours fixé par le serveur : il sert de curseur de synchro
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists items_touch on public.items;
create trigger items_touch
  before insert or update on public.items
  for each row execute function public.touch_updated_at();

alter table public.items enable row level security;
drop policy if exists "items_owner" on public.items;
create policy "items_owner" on public.items
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Préférences (contextes, date de dernière revue…)
-- ---------------------------------------------------------------------------
create table if not exists public.prefs (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.prefs enable row level security;
drop policy if exists "prefs_owner" on public.prefs;
create policy "prefs_owner" on public.prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Jetons de capture pour les raccourcis iOS (générés depuis l'app)
-- ---------------------------------------------------------------------------
create table if not exists public.capture_tokens (
  token      text primary key check (length(token) >= 32),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.capture_tokens enable row level security;
drop policy if exists "tokens_owner" on public.capture_tokens;
create policy "tokens_owner" on public.capture_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.capture_token_valid(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.capture_tokens where token = p_token);
$$;

revoke all on function public.capture_token_valid(text) from public;
grant execute on function public.capture_token_valid(text) to anon, authenticated;

-- Point d'entrée du raccourci : ajoute un élément dans l'Inbox
create or replace function public.capture(
  p_token      text,
  p_text       text default null,
  p_url        text default null,
  p_image_path text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid;
  v_id    uuid;
  v_text  text := btrim(coalesce(p_text, ''));
  v_url   text := nullif(btrim(coalesce(p_url, '')), '');
  v_img   text := nullif(btrim(coalesce(p_image_path, '')), '');
  v_title text;
  v_body  text := '';
  v_nl    int;
begin
  select user_id into v_user from public.capture_tokens where token = p_token;
  if v_user is null then
    raise exception 'Jeton de capture invalide' using errcode = '28000';
  end if;

  -- un lien partagé seul arrive souvent comme texte
  if v_url is null and v_text ~ '^https?://\S+$' then
    v_url := v_text;
    v_text := '';
  end if;

  -- une image doit venir du dossier de ce jeton
  if v_img is not null and v_img not like 'inbox/' || p_token || '/%' then
    v_img := null;
  end if;

  if v_text = '' and v_url is null and v_img is null then
    raise exception 'Capture vide';
  end if;

  v_nl := position(E'\n' in v_text);
  if v_nl > 0 then
    v_title := btrim(left(v_text, v_nl - 1));
    v_body  := btrim(substr(v_text, v_nl + 1));
  else
    v_title := v_text;
  end if;
  if v_title = '' then
    v_title := coalesce(v_url, 'Photo');
  end if;

  insert into public.items (user_id, kind, title, body, url, image_path, source)
  values (v_user, 'inbox', left(v_title, 500), v_body, v_url, v_img, 'shortcut')
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.capture(text, text, text, text) from public;
grant execute on function public.capture(text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Stockage des photos (bucket privé)
--   app       : <user_id>/<fichier>.jpg
--   raccourci : inbox/<jeton>/<fichier>.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('captures', 'captures', false, 10485760,
        array['image/jpeg','image/png','image/heic','image/webp','image/gif'])
on conflict (id) do nothing;

drop policy if exists "captures_owner" on storage.objects;
create policy "captures_owner" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'captures' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        (storage.foldername(name))[1] = 'inbox'
        and exists (
          select 1 from public.capture_tokens t
          where t.token = (storage.foldername(name))[2] and t.user_id = auth.uid()
        )
      )
    )
  )
  with check (
    bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "captures_shortcut_upload" on storage.objects;
create policy "captures_shortcut_upload" on storage.objects
  for insert to anon
  with check (
    bucket_id = 'captures'
    and (storage.foldername(name))[1] = 'inbox'
    and public.capture_token_valid((storage.foldername(name))[2])
  );
