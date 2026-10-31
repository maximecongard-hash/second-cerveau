-- Second Cerveau : mise à jour 0.6 (module Notes, signets)
-- À coller dans Supabase > SQL Editor > New query, puis "Run". Peut être relancé sans risque.

-- Le type d'élément n'est plus une liste fermée : chaque module déclare les siens (note, bookmark…).
-- On garde seulement un format sûr (minuscules et _), pour qu'un nouveau module n'exige pas de migration.
alter table public.items drop constraint if exists items_kind_check;
alter table public.items add constraint items_kind_check check (kind ~ '^[a-z][a-z_]*$');

-- recharge le cache de l'API
notify pgrst, 'reload schema';
