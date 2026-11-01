-- Second Cerveau : mise à jour 0.12 (chronomètre sur les tâches)
-- À coller dans Supabase > SQL Editor > New query, puis "Run". Peut être relancé sans risque.

-- spent_sec : temps déjà passé, en secondes. timer_started_at : début du chrono en cours (null = en pause).
alter table public.items add column if not exists spent_sec int not null default 0;
alter table public.items add column if not exists timer_started_at timestamptz;

notify pgrst, 'reload schema';
