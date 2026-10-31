-- Second Cerveau : schéma Supabase
-- À coller en entier dans Supabase > SQL Editor > New query, puis "Run".
-- Le script peut être relancé sans risque (il ne supprime aucune donnée).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Éléments : inbox, tâches, projets, notes, signets et domaines dans une seule table
-- ---------------------------------------------------------------------------
create table if not exists public.items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- inbox, task, project, area (Organisation), note, bookmark (Notes)… : chaque module déclare les siens
  kind           text not null default 'inbox' constraint items_kind_check check (kind ~ '^[a-z][a-z_]*$'),
  status         text not null default 'active' check (status in ('active','waiting','someday','done','trashed','clarify')),
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
  focus          smallint check (focus between 1 and 3),
  outcome        text,
  review_date    date,
  recurrence     text check (recurrence in ('daily','weekdays','weekly','monthly','yearly')),
  links          uuid[] not null default '{}',
  pinned         boolean not null default false,
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

-- ---------------------------------------------------------------------------
-- Brain vers Calendrier : flux ICS lu par l'abonnement de Calendrier (Edge Function « calendrier »)
-- ---------------------------------------------------------------------------
-- Jeton du lien d'abonnement : distinct du jeton de capture, il ne permet que de lire l'agenda
create table if not exists public.calendar_tokens (
  token      text primary key check (length(token) >= 32),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.calendar_tokens enable row level security;
drop policy if exists "calendar_tokens_owner" on public.calendar_tokens;
create policy "calendar_tokens_owner" on public.calendar_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Éléments placés à une heure, d'un mois en arrière à six mois devant
create or replace function public.calendar_feed(p_token text)
returns table (
  id             uuid,
  kind           text,
  status         text,
  title          text,
  body           text,
  scheduled_date date,
  scheduled_time time,
  duration_min   int,
  project        text,
  updated_at     timestamptz
)
language sql stable security definer set search_path = public as $$
  select i.id, i.kind, i.status, i.title, left(i.body, 2000), i.scheduled_date, i.scheduled_time,
         i.duration_min, p.title, i.updated_at
  from public.calendar_tokens t
  join public.items i on i.user_id = t.user_id
  left join public.items p on p.id = i.parent_id and p.status <> 'trashed'
  where t.token = p_token
    and i.scheduled_date is not null and i.scheduled_time is not null
    and i.status in ('active', 'waiting', 'done')
    and i.scheduled_date between current_date - 31 and current_date + 183
  order by i.scheduled_date, i.scheduled_time
  limit 2000;
$$;

revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Calendrier vers Brain : événements Apple envoyés par le raccourci « Agenda Apple »
-- Lecture seule dans l'app ; seul le raccourci (jeton de capture) les remplace.
-- Heures locales sans fuseau, comme les créneaux de Brain.
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  calendar   text not null default '',
  title      text not null default '',
  location   text not null default '',
  starts_at  timestamp not null,
  ends_at    timestamp not null,
  all_day    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists events_user_start_idx on public.events (user_id, starts_at);

alter table public.events enable row level security;
drop policy if exists "events_owner_read" on public.events;
create policy "events_owner_read" on public.events
  for select to authenticated
  using (user_id = auth.uid());

-- p_lines : un événement par enregistrement, séparés par ␞, champs séparés par une tabulation :
--   calendrier, début, fin, journée entière, titre, lieu   (dates au format 2026-11-02T09:30)
-- Remplace les événements à partir du premier début reçu, ignore le calendrier « Brain »
-- (l'abonnement à Brain lui-même) et oublie ceux de plus de deux mois.
create or replace function public.sync_events(p_token text, p_lines text default '')
returns int language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid;
  v_count int;
begin
  select user_id into v_user from public.capture_tokens where token = p_token;
  if v_user is null then
    raise exception 'Jeton de capture invalide' using errcode = '28000';
  end if;

  with recs as (
    select string_to_array(r, E'\t') as f
    from regexp_split_to_table(coalesce(p_lines, ''), '␞') as r
    where btrim(r, E' \t\r\n') <> ''
    limit 1000
  ), parsed as (
    select f,
           case when btrim(f[2]) ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}' then btrim(f[2])::timestamp end as s,
           case when btrim(f[3]) ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}' then btrim(f[3])::timestamp end as e
    from recs
  ), ev as (
    select left(btrim(f[1]), 200) as calendar,
           left(btrim(regexp_replace(coalesce(f[5], ''), '\s+', ' ', 'g')), 500) as title,
           left(btrim(regexp_replace(coalesce(f[6], ''), '\s+', ' ', 'g')), 500) as location,
           s as starts_at, greatest(s, coalesce(e, s)) as ends_at,
           lower(btrim(coalesce(f[4], ''))) in ('1', 'yes', 'oui', 'true', 'vrai') as all_day
    from parsed
    where s is not null and btrim(f[1]) <> 'Brain'
  ), del as (
    delete from public.events
    where user_id = v_user
      and (starts_at >= (select coalesce(min(starts_at), current_date::timestamp) from ev)
           or starts_at < current_date - 62)
  )
  insert into public.events (user_id, calendar, title, location, starts_at, ends_at, all_day)
  select v_user, calendar, title, location, starts_at, ends_at, all_day from ev;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.sync_events(text, text) from public;
grant execute on function public.sync_events(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Notifications de Brain (identique à 006_notifications.sql)
-- Il faut aussi déployer la fonction supabase/functions/send-reminders (voir le README).
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Heure du rappel d'un élément ; reminded_at est rempli par la fonction send-reminders
-- ---------------------------------------------------------------------------
alter table public.items add column if not exists remind_at timestamptz;
alter table public.items add column if not exists reminded_at timestamptz;
create index if not exists items_remind_idx on public.items (remind_at) where reminded_at is null;

-- Changer l'heure du rappel le réarme
create or replace function public.rearm_reminder() returns trigger language plpgsql as $$
begin
  if new.remind_at is distinct from old.remind_at then
    new.reminded_at := null;
  end if;
  return new;
end $$;
drop trigger if exists items_rearm_reminder on public.items;
create trigger items_rearm_reminder before update on public.items
  for each row execute function public.rearm_reminder();

-- ---------------------------------------------------------------------------
-- Appareils abonnés aux notifications (un par iPhone, Mac…)
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  device     text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_owner" on public.push_subscriptions;
create policy "push_owner" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Réglages de l'envoi : clés VAPID (créées par la fonction au premier appel)
-- et secret qui autorise pg_cron à appeler la fonction. Aucune règle RLS :
-- seule la clé de service (la fonction) peut lire cette table.
-- ---------------------------------------------------------------------------
create table if not exists public.push_config (
  id          int primary key default 1 check (id = 1),
  public_key  text,
  private_jwk jsonb,
  cron_secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
alter table public.push_config enable row level security;
insert into public.push_config (id) values (1) on conflict (id) do nothing;

-- Clé publique VAPID, dont l'app a besoin pour s'abonner
create or replace function public.push_public_key() returns text
language sql security definer set search_path = public stable as $$
  select public_key from public.push_config where id = 1;
$$;
revoke all on function public.push_public_key() from public;
grant execute on function public.push_public_key() to authenticated;

-- ---------------------------------------------------------------------------
-- Chaque minute : appelle la fonction send-reminders
-- ---------------------------------------------------------------------------
select cron.unschedule('brain-reminders') where exists (select 1 from cron.job where jobname = 'brain-reminders');
select cron.schedule('brain-reminders', '* * * * *', $$
  select net.http_post(
    url := 'https://zqdvtbkjvfzkjqtaffbb.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', (select cron_secret from public.push_config where id = 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
$$);
