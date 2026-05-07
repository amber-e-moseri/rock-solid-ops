begin;

-- RBAC hardening: normalize profile role hierarchy and safe signup default.
-- Role hierarchy (least to most privilege):
-- pending -> teacher -> principal -> subgroup_admin/pastor/admin -> superadmin
-- `pending` is the secure default for new signups and has no elevated access.

-- 1) Safely replace profiles.role CHECK constraint without assuming legacy constraint name.
do $$
declare
  v_profiles regclass;
  v_role_attnum int2;
  rec record;
begin
  v_profiles := to_regclass('public.profiles');
  if v_profiles is null then
    raise notice 'public.profiles not found; skipping role constraint migration';
    return;
  end if;

  select a.attnum
    into v_role_attnum
  from pg_attribute a
  where a.attrelid = v_profiles
    and a.attname = 'role'
    and a.attisdropped = false
  limit 1;

  if v_role_attnum is null then
    raise notice 'public.profiles.role not found; skipping role constraint migration';
    return;
  end if;

  -- Drop any CHECK constraint bound to the role column.
  for rec in
    select c.conname
    from pg_constraint c
    where c.conrelid = v_profiles
      and c.contype = 'c'
      and array_position(c.conkey, v_role_attnum) is not null
  loop
    execute format('alter table public.profiles drop constraint if exists %I', rec.conname);
  end loop;

  -- Add canonical role constraint.
  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('pending', 'teacher', 'principal', 'admin', 'superadmin', 'subgroup_admin', 'pastor'));
end $$;

comment on column public.profiles.role is
'Canonical profile role. Allowed values: pending, teacher, principal, subgroup_admin, pastor, admin, superadmin. pending is the secure signup default and is non-elevated.';

-- 2) New auth users default to pending.
create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'pending'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_auth_user_profile() is
'Creates profile row for new auth users with role=pending by default. pending is intentionally non-elevated until staff assignment.';

-- 3) Helper functions: explicitly keep pending non-elevated.
create or replace function public.current_profile_role()
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_role text;
begin
  if to_regclass('public.profiles') is not null then
    select p.role
      into v_role
    from public.profiles p
    where p.user_id = auth.uid()
      and coalesce(p.is_active, true) = true
    limit 1;
  end if;

  if v_role is null and to_regclass('public.admin_users') is not null then
    select a.role
      into v_role
    from public.admin_users a
    where a.auth_user_id = auth.uid()
    limit 1;
  end if;

  return v_role;
end;
$$;

comment on function public.current_profile_role() is
'Returns effective caller role. pending remains non-elevated and receives no admin rights.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    public.current_profile_role() in ('superadmin','admin','subgroup_admin','pastor','principal'),
    false
  )
$$;

comment on function public.is_admin() is
'True only for elevated staff roles (principal, subgroup_admin, pastor, admin, superadmin). pending/teacher are non-admin.';

create or replace function public.is_admin_like()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    public.current_user_role() in ('superadmin','admin','subgroup_admin','pastor','principal'),
    false
  );
$$;

comment on function public.is_admin_like() is
'Legacy admin helper. pending is non-elevated and never treated as admin.';

commit;
