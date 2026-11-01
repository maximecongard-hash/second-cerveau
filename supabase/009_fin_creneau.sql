-- Second Cerveau : mise à jour 0.13 (notification de fin de créneau)
-- À coller dans Supabase > SQL Editor > New query, puis "Run". Peut être relancé sans risque.
-- Il faut aussi redéployer la fonction supabase/functions/send-reminders.

-- end_at : instant de fin du créneau, calculé par l'app (heure locale de l'appareil) ;
-- end_notified_at est rempli par la fonction send-reminders quand la notification est partie.
alter table public.items add column if not exists end_at timestamptz;
alter table public.items add column if not exists end_notified_at timestamptz;
create index if not exists items_end_idx on public.items (end_at) where end_notified_at is null;

-- Déplacer le créneau réarme la notification
create or replace function public.rearm_reminder() returns trigger language plpgsql as $$
begin
  if new.remind_at is distinct from old.remind_at then
    new.reminded_at := null;
  end if;
  if new.end_at is distinct from old.end_at then
    new.end_notified_at := null;
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
