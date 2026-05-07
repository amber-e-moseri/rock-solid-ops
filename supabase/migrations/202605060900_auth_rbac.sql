begin;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role text not null check (role in ('teacher', 'principal', 'admin', 'superadmin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;

create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_profiles_updated_at();

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
    'teacher'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;

create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute function public.handle_new_auth_user_profile();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.user_id = auth.uid()
    and p.is_active = true
  limit 1;
$$;

create or replace function public.is_admin_like()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('admin', 'superadmin'), false);
$$;

alter table public.profiles enable row level security;

drop policy if exists profiles_self_select on public.profiles;

create policy profiles_self_select
on public.profiles
for select
to authenticated
using (user_id = auth.uid() or public.is_admin_like());

drop policy if exists profiles_self_update on public.profiles;

create policy profiles_self_update
on public.profiles
for update
to authenticated
using (user_id = auth.uid() or public.is_admin_like())
with check (user_id = auth.uid() or public.is_admin_like());

alter table if exists public.applicants enable row level security;
alter table if exists public.class_options enable row level security;
alter table if exists public.attendance_log enable row level security;
alter table if exists public.email_queue enable row level security;

drop policy if exists applicants_admin_all on public.applicants;

create policy applicants_admin_all
on public.applicants
for all
to authenticated
using (public.is_admin_like())
with check (public.is_admin_like());

drop policy if exists applicants_teacher_select_assigned on public.applicants;

create policy applicants_teacher_select_assigned
on public.applicants
for select
to authenticated
using (
  exists (
    select 1
    from public.class_options co
    join public.teachers t
      on t.teacher_id::text = co.teacher_id::text
    where lower(trim(t.email)) = lower(trim(auth.jwt()->>'email'))
      and co.class_option_id::text = applicants.class_option_id::text
  )
);

drop policy if exists class_options_admin_all on public.class_options;

create policy class_options_admin_all
on public.class_options
for all
to authenticated
using (public.is_admin_like())
with check (public.is_admin_like());

drop policy if exists class_options_teacher_select_assigned on public.class_options;

create policy class_options_teacher_select_assigned
on public.class_options
for select
to authenticated
using (
  exists (
    select 1
    from public.teachers t
    where lower(trim(t.email)) = lower(trim(auth.jwt()->>'email'))
      and t.teacher_id::text = class_options.teacher_id::text
  )
);

drop policy if exists attendance_admin_all on public.attendance_log;

create policy attendance_admin_all
on public.attendance_log
for all
to authenticated
using (public.is_admin_like())
with check (public.is_admin_like());

drop policy if exists attendance_teacher_rw_assigned on public.attendance_log;

create policy attendance_teacher_rw_assigned
on public.attendance_log
for all
to authenticated
using (
  exists (
    select 1
    from public.class_options co
    join public.teachers t
      on t.teacher_id::text = co.teacher_id::text
    where lower(trim(t.email)) = lower(trim(auth.jwt()->>'email'))
      and co.class_option_id::text = attendance_log.class_option_id::text
  )
)
with check (
  exists (
    select 1
    from public.class_options co
    join public.teachers t
      on t.teacher_id::text = co.teacher_id::text
    where lower(trim(t.email)) = lower(trim(auth.jwt()->>'email'))
      and co.class_option_id::text = attendance_log.class_option_id::text
  )
);

drop policy if exists email_queue_admin_all on public.email_queue;

create policy email_queue_admin_all
on public.email_queue
for all
to authenticated
using (public.is_admin_like())
with check (public.is_admin_like());

commit;