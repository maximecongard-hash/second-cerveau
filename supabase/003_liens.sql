-- Second Cerveau : mise à jour 0.5 (liens entre éléments, épingle)
-- À coller dans Supabase > SQL Editor > New query, puis "Run". Peut être relancé sans risque.

-- liens vers d'autres éléments (tâche ↔ note ↔ projet…) : stockés d'un seul côté, lus dans les deux sens
alter table public.items add column if not exists links uuid[] not null default '{}';
-- élément épinglé en tête de sa liste
alter table public.items add column if not exists pinned boolean not null default false;

-- recharge le cache de l'API pour qu'elle voie les nouvelles colonnes tout de suite
notify pgrst, 'reload schema';
