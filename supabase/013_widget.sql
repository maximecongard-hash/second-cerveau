-- Second Cerveau : widget Scriptable (0.17)
-- À coller dans Supabase > SQL Editor > New query, puis "Run". Peut être relancé sans risque.
-- Fonction lue par le widget iPhone avec un jeton de capture : renvoie le résumé de la journée
-- (Top 3, tâches datées, échéances, Inbox, événements de Calendrier). Lecture seule.
-- p_day : le jour vu par l'iPhone (évite le décalage de fuseau du serveur).

create or replace function public.widget_today(p_token text, p_day date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  v_user := public.use_token(p_token, 'widget');  -- compte l'utilisation (migration 014)
  if v_user is null then
    raise exception 'Jeton de capture invalide' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'day', p_day,
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', i.title, 'time', to_char(i.scheduled_time, 'HH24:MI'), 'duration', i.duration_min,
        'focus', i.focus, 'done', i.status = 'done')
        order by i.scheduled_time nulls last, i.day_order nulls last, i.created_at)
      from public.items i
      where i.user_id = v_user and i.kind = 'task' and i.scheduled_date = p_day
        and i.status in ('active', 'waiting', 'done')), '[]'::jsonb),
    'overdue', (
      select count(*) from public.items i
      where i.user_id = v_user and i.kind = 'task' and i.status = 'active'
        and (i.due_date < p_day or i.scheduled_date < p_day)),
    'inbox', (
      select count(*) from public.items i
      where i.user_id = v_user and i.kind = 'inbox' and i.status <> 'trashed'),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', e.title, 'start', to_char(e.starts_at, 'HH24:MI'), 'end', to_char(e.ends_at, 'HH24:MI'),
        'allDay', e.all_day) order by e.all_day desc, e.starts_at)
      from public.events e
      where e.user_id = v_user and e.starts_at::date <= p_day and e.ends_at::date >= p_day), '[]'::jsonb)
  );
end $$;

revoke all on function public.widget_today(text, date) from public;
grant execute on function public.widget_today(text, date) to anon, authenticated;

notify pgrst, 'reload schema';
