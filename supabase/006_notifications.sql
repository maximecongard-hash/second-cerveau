-- Second Cerveau : mise à jour 0.9 (notifications de Brain)
-- À coller dans Supabase > SQL Editor > New query, puis "Run". Peut être relancé sans risque.
-- Avant : Database > Extensions, active pg_cron et pg_net (ce script essaie aussi de les activer).

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

notify pgrst, 'reload schema';
