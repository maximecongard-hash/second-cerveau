-- Second Cerveau : mise à jour 0.8 (Calendrier Apple dans les deux sens)
-- À coller dans Supabase > SQL Editor > New query, puis "Run". Peut être relancé sans risque.

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

-- recharge le cache de l'API
notify pgrst, 'reload schema';
