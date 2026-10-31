-- Second Cerveau : mise à jour 0.2 (Top 3, résultat attendu, date de revue, projets « à clarifier »)
-- À coller dans Supabase > SQL Editor > New query, puis "Run". Peut être relancé sans risque.

alter table public.items add column if not exists focus smallint check (focus between 1 and 3);
alter table public.items add column if not exists outcome text;
alter table public.items add column if not exists review_date date;

alter table public.items drop constraint if exists items_status_check;
alter table public.items add constraint items_status_check
  check (status in ('active','waiting','someday','done','trashed','clarify'));

-- recharge le cache de l'API pour qu'elle voie les nouvelles colonnes tout de suite
notify pgrst, 'reload schema';
