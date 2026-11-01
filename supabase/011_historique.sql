-- Second Cerveau : mise à jour 0.14 (« terminé par » et historique des projets)
-- À coller dans Supabase > SQL Editor > New query, puis "Run". Peut être relancé sans risque.

-- ---------------------------------------------------------------------------
-- Qui a terminé une tâche : fixé par le serveur, l'app ne peut pas le falsifier
-- ---------------------------------------------------------------------------
alter table public.items add column if not exists completed_by uuid references auth.users(id) on delete set null;

create or replace function public.set_completed_by() returns trigger language plpgsql as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_by := coalesce(auth.uid(), new.completed_by);
    else
      new.completed_by := old.completed_by;
    end if;
  else
    new.completed_by := null;
  end if;
  return new;
end $$;
drop trigger if exists items_set_completed_by on public.items;
create trigger items_set_completed_by before insert or update on public.items
  for each row execute function public.set_completed_by();

-- ---------------------------------------------------------------------------
-- Historique : une ligne par évènement sur un projet ou l'une de ses tâches
-- Écrit uniquement par le trigger ci-dessous. Lisible par ceux qui ont accès au projet.
-- ---------------------------------------------------------------------------
create table if not exists public.item_events (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  item_id    uuid not null,
  kind       text not null,
  actor      uuid references auth.users(id) on delete set null,
  action     text not null,
  title      text not null default '',
  detail     text not null default '',
  at         timestamptz not null default now()
);
create index if not exists item_events_project_idx on public.item_events (project_id, at desc);

alter table public.item_events enable row level security;
drop policy if exists "item_events_read" on public.item_events;
create policy "item_events_read" on public.item_events
  for select to authenticated using (public.item_role(project_id) is not null);

create or replace function public.log_item_event() returns trigger language plpgsql security definer set search_path = public as $$
declare
  r      public.items;
  v_proj uuid;
  v_name text;
  v_old  text;
  v_new  text;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  if r.kind not in ('task', 'project') then return null; end if;
  v_proj := case when r.kind = 'project' then r.id else r.parent_id end;

  if tg_op = 'INSERT' then
    if v_proj is not null then
      insert into public.item_events (project_id, item_id, kind, actor, action, title) values (v_proj, r.id, r.kind, auth.uid(), 'created', r.title);
    end if;
  elsif tg_op = 'DELETE' then
    if v_proj is not null then
      insert into public.item_events (project_id, item_id, kind, actor, action, title) values (v_proj, r.id, r.kind, auth.uid(), 'deleted', r.title);
    end if;
  else
    if new.status is distinct from old.status and v_proj is not null then
      v_name := case
        when new.status = 'trashed' then 'trashed'
        when old.status = 'trashed' then 'restored'
        when new.status = 'done' then 'done'
        when old.status = 'done' then 'reopened'
        else null end;
      if v_name is not null then
        insert into public.item_events (project_id, item_id, kind, actor, action, title) values (v_proj, new.id, new.kind, auth.uid(), v_name, new.title);
      end if;
    end if;
    if new.title is distinct from old.title and v_proj is not null and old.title <> '' then
      insert into public.item_events (project_id, item_id, kind, actor, action, title, detail) values (v_proj, new.id, new.kind, auth.uid(), 'renamed', new.title, old.title);
    end if;
    if new.kind = 'task' and new.parent_id is distinct from old.parent_id then
      select title into v_old from public.items where id = old.parent_id;
      select title into v_new from public.items where id = new.parent_id;
      if new.parent_id is not null then
        insert into public.item_events (project_id, item_id, kind, actor, action, title, detail) values (new.parent_id, new.id, 'task', auth.uid(), 'moved_in', new.title, coalesce(v_old, ''));
      end if;
      if old.parent_id is not null then
        insert into public.item_events (project_id, item_id, kind, actor, action, title, detail) values (old.parent_id, new.id, 'task', auth.uid(), 'moved_out', new.title, coalesce(v_new, ''));
      end if;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists items_log_event on public.items;
create trigger items_log_event after insert or update or delete on public.items
  for each row execute function public.log_item_event();

notify pgrst, 'reload schema';
