-- Second Cerveau : clés d'accès nommées, avec compteur d'utilisations (0.17.3)
-- À coller dans Supabase > SQL Editor > New query, puis "Run". Peut être relancé sans risque.
-- Les anciens « jetons de capture » deviennent des clés d'accès : la table garde son nom (`capture_tokens`)
-- pour ne pas casser les raccourcis. Chaque clé reçoit un nom, la date de dernière utilisation et un compteur
-- par porte : capture, agenda (raccourci « Agenda Apple »), widget.

alter table public.capture_tokens add column if not exists name         text;
alter table public.capture_tokens add column if not exists uses         jsonb not null default '{}'::jsonb;
alter table public.capture_tokens add column if not exists last_used_at timestamptz;

-- Vérifie la clé, compte l'utilisation et rend le compte propriétaire (appelée par les fonctions ci-dessous)
create or replace function public.use_token(p_token text, p_door text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  update public.capture_tokens
     set uses = jsonb_set(uses, array[p_door], to_jsonb(coalesce((uses ->> p_door)::int, 0) + 1)),
         last_used_at = now()
   where token = p_token
   returning user_id into v_user;
  return v_user;
end $$;

revoke all on function public.use_token(text, text) from public;

-- Les trois portes comptent leurs appels : on remplace la ligne de vérification du jeton
do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in select * from (values
      ('capture',     'public.capture(text, text, text, text)'),
      ('sync_events', 'public.sync_events(text, text)'),
      ('widget_today','public.widget_today(text, date)')) as t(door, sig)
  loop
    v_def := pg_get_functiondef(r.sig::regprocedure);
    v_new := replace(v_def,
      'select user_id into v_user from public.capture_tokens where token = p_token;',
      'v_user := public.use_token(p_token, ' || quote_literal(case r.door when 'sync_events' then 'agenda' when 'widget_today' then 'widget' else 'capture' end) || ');');
    if v_new = v_def then
      raise notice 'Fonction % déjà à jour ou ligne introuvable', r.door;
    else
      if r.door = 'widget_today' then
        v_new := replace(v_new, ' STABLE ', ' VOLATILE ');  -- elle écrit maintenant le compteur
      end if;
      execute v_new;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
