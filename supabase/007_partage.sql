-- Brain 0.11 : plusieurs utilisateurs et partage de projets / tâches
-- À coller en entier dans Supabase > SQL Editor > New query, puis "Run". Relançable sans risque.
-- Il faut aussi déployer la fonction supabase/functions/add-user pour créer des comptes depuis l'app.

-- ---------------------------------------------------------------------------
-- Profils : un par compte (email, nom affiché, administrateur)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null default '',
  name       text not null default '',
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, coalesce(new.email, ''),
          coalesce(nullif(btrim(new.raw_user_meta_data->>'name'), ''), split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- comptes déjà présents ; le plus ancien devient administrateur s'il n'y en a pas
insert into public.profiles (id, email, name, created_at)
select u.id, coalesce(u.email, ''), split_part(coalesce(u.email, ''), '@', 1), u.created_at from auth.users u
on conflict (id) do nothing;

update public.profiles set is_admin = true
where id = (select id from public.profiles order by created_at limit 1)
  and not exists (select 1 from public.profiles where is_admin);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Partages : un élément (projet, tâche…) partagé avec un autre compte
-- Un projet partagé donne aussi accès à ses tâches (parent_id).
-- ---------------------------------------------------------------------------
create table if not exists public.shares (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.items(id) on delete cascade,
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'edit' check (role in ('view', 'edit')),
  created_at timestamptz not null default now(),
  unique (item_id, user_id),
  check (owner_id <> user_id)
);
create index if not exists shares_user_idx on public.shares (user_id);

alter table public.shares enable row level security;
drop policy if exists "shares_read" on public.shares;
create policy "shares_read" on public.shares
  for select to authenticated using (owner_id = auth.uid() or user_id = auth.uid());
-- le propriétaire retire un partage, l'invité le quitte ; la création passe par share_item()
drop policy if exists "shares_delete" on public.shares;
create policy "shares_delete" on public.shares
  for delete to authenticated using (owner_id = auth.uid() or user_id = auth.uid());

-- Droit de l'utilisateur courant sur une ligne : 'owner', 'edit', 'view' ou null
create or replace function public.row_role(p_id uuid, p_parent uuid, p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_user = auth.uid() then 'owner'
    else coalesce(
      (select s.role from public.shares s
        where s.user_id = auth.uid() and s.item_id in (p_id, p_parent)
        order by (s.role = 'edit') desc limit 1),
      (select 'owner' from public.items p where p.id = p_parent and p.user_id = auth.uid())
    )
  end;
$$;
revoke all on function public.row_role(uuid, uuid, uuid) from public;
grant execute on function public.row_role(uuid, uuid, uuid) to authenticated;

create or replace function public.item_role(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select public.row_role(i.id, i.parent_id, i.user_id) from public.items i where i.id = p_id;
$$;
revoke all on function public.item_role(uuid) from public;
grant execute on function public.item_role(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Éléments : le propriétaire, les invités du partage, et le propriétaire d'un projet
-- voit les tâches que ses invités y ajoutent
-- ---------------------------------------------------------------------------
drop policy if exists "items_owner" on public.items;
drop policy if exists "items_select" on public.items;
drop policy if exists "items_insert" on public.items;
drop policy if exists "items_update" on public.items;
drop policy if exists "items_delete" on public.items;

create policy "items_select" on public.items
  for select to authenticated
  using (public.row_role(id, parent_id, user_id) is not null);

create policy "items_insert" on public.items
  for insert to authenticated
  with check (
    (user_id = auth.uid() and (parent_id is null or public.item_role(parent_id) in ('owner', 'edit')))
    or public.row_role(id, parent_id, user_id) in ('owner', 'edit')
  );

create policy "items_update" on public.items
  for update to authenticated
  using (public.row_role(id, parent_id, user_id) in ('owner', 'edit'))
  with check (public.row_role(id, parent_id, user_id) in ('owner', 'edit'));

create policy "items_delete" on public.items
  for delete to authenticated
  using (user_id = auth.uid());

-- le propriétaire d'une ligne ne change jamais (un invité qui modifie garde le user_id d'origine)
create or replace function public.keep_item_owner() returns trigger language plpgsql as $$
begin
  new.user_id := old.user_id;
  return new;
end $$;
drop trigger if exists items_keep_owner on public.items;
create trigger items_keep_owner before update on public.items
  for each row execute function public.keep_item_owner();

-- ---------------------------------------------------------------------------
-- Profils : visibles de tous les comptes (petit groupe privé), pour choisir avec qui partager
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles
  for select to authenticated
  using (true);
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- seul le nom est modifiable depuis l'app
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Partager un élément avec un compte, par email (ou changer son droit)
-- Le propriétaire seul peut partager. Les éléments concernés sont « touchés »
-- pour que l'invité les reçoive à sa prochaine synchro.
-- ---------------------------------------------------------------------------
create or replace function public.share_item(p_item uuid, p_email text, p_role text default 'edit')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_guest uuid;
  v_role  text := case when p_role = 'view' then 'view' else 'edit' end;
  v_share uuid;
  v_prof  public.profiles;
begin
  select user_id into v_owner from public.items where id = p_item;
  if v_owner is distinct from auth.uid() then
    raise exception 'Tu ne peux partager que tes propres éléments';
  end if;
  select id into v_guest from auth.users where lower(email) = lower(btrim(p_email));
  if v_guest is null then
    raise exception 'Aucun compte avec cet email';
  end if;
  if v_guest = auth.uid() then
    raise exception 'C’est déjà ton compte';
  end if;

  insert into public.shares (item_id, owner_id, user_id, role)
  values (p_item, auth.uid(), v_guest, v_role)
  on conflict (item_id, user_id) do update set role = excluded.role
  returning id into v_share;

  update public.items set updated_at = updated_at where id = p_item or parent_id = p_item;

  select * into v_prof from public.profiles where id = v_guest;
  return jsonb_build_object('id', v_share, 'item_id', p_item, 'owner_id', auth.uid(), 'user_id', v_guest, 'role', v_role,
                            'email', v_prof.email, 'name', v_prof.name);
end $$;
revoke all on function public.share_item(uuid, text, text) from public;
grant execute on function public.share_item(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
