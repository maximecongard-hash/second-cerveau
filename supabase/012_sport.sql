-- Second Cerveau : module Sport (0.15)
-- À coller dans Supabase > SQL Editor > New query, puis "Run". Peut être relancé sans risque.
-- Ajoute la colonne `meta` (JSON) qui porte le contenu d'une séance : blocs de course, exercices,
-- séries, résultat. Les types d'éléments `workout`, `workout_tpl` et `program` sont déjà acceptés
-- par la contrainte de `kind` (migration 004).

alter table public.items add column if not exists meta jsonb;

notify pgrst, 'reload schema';
