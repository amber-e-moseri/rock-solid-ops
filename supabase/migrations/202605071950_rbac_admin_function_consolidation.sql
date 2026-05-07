begin;

-- Canonical role resolver and admin-check source of truth.
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
'Canonical role resolver for RLS and backend authorization. Single source of truth for effective caller role.';

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
'Canonical admin-like authorization check. Single source of truth for elevated staff access decisions.';

-- Rewrite any RLS policies that still reference legacy is_admin_like() to use is_admin().
do $$
declare
  pol record;
  v_roles text;
  v_cmd text;
  v_permissive text;
  v_qual text;
  v_with_check text;
  v_sql text;
begin
  for pol in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ilike '%is_admin_like(%'
        or coalesce(with_check, '') ilike '%is_admin_like(%'
      )
  loop
    v_roles := (
      select string_agg(quote_ident(r::text), ', ')
      from unnest(coalesce(pol.roles, array['public'::name])) as r
    );

    v_cmd := upper(coalesce(pol.cmd, 'ALL'));
    v_permissive := upper(coalesce(pol.permissive, 'PERMISSIVE'));

    v_qual := replace(coalesce(pol.qual, ''), 'public.is_admin_like()', 'public.is_admin()');
    v_qual := replace(v_qual, 'is_admin_like()', 'is_admin()');

    v_with_check := replace(coalesce(pol.with_check, ''), 'public.is_admin_like()', 'public.is_admin()');
    v_with_check := replace(v_with_check, 'is_admin_like()', 'is_admin()');

    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);

    v_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      pol.policyname,
      pol.schemaname,
      pol.tablename,
      v_permissive,
      v_cmd,
      coalesce(v_roles, 'public')
    );

    if nullif(trim(v_qual), '') is not null then
      v_sql := v_sql || format(' using (%s)', v_qual);
    end if;

    if nullif(trim(v_with_check), '') is not null then
      v_sql := v_sql || format(' with check (%s)', v_with_check);
    end if;

    execute v_sql;
  end loop;
end $$;

-- Drop legacy helper only after policies no longer depend on it.
do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ilike '%is_admin_like(%'
        or coalesce(with_check, '') ilike '%is_admin_like(%'
      )
  ) then
    raise exception 'Cannot drop public.is_admin_like(): one or more RLS policies still reference it.';
  end if;

  drop function if exists public.is_admin_like();
end $$;

commit;
