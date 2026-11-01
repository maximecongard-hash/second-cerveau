-- Second Cerveau : correctif 0.13.3 (répétitions « le 25 de chaque mois » et « 1er samedi du mois »)
-- À coller dans Supabase > SQL Editor > New query, puis "Run". Peut être relancé sans risque.
-- La contrainte d'origine n'acceptait que daily, weekdays, weekly, monthly et yearly : une tâche
-- répétée « monthday:25 » ou « nth:1:6 » bloquait la synchro de l'appareil.

alter table public.items drop constraint if exists items_recurrence_check;
alter table public.items add constraint items_recurrence_check
  check (recurrence ~ '^(daily|weekdays|weekly|monthly|yearly|monthday:[0-9]{1,2}|nth:[1-5]:[0-6])$');

notify pgrst, 'reload schema';
