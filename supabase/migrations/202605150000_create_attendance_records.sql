begin;

-- Creates public.attendance_records canonically.
-- attendance_records did not previously exist in this environment.
-- All conditional to_regclass guards in edge functions can now be removed
--   in a follow-up cleanup pass.
-- Dedupe key: (student_id, class_option_id, class_number, class_date)
--   for roster rows. Guests deduped by name within session.

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  student_id text references public.students(student_id) on delete cascade,
  class_option_id text not null references public.class_options(class_option_id) on delete cascade,
  class_number integer not null,
  class_date date not null,
  status text not null check (status in ('present','absent','excused')),
  attendance_type text not null default 'roster' check (attendance_type in ('roster','guest')),
  guest_name text default null,
  guest_phone text default null,
  guest_email text default null,
  notes text default null,
  submitted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_guest_name_required
    check (attendance_type != 'guest' or guest_name is not null),
  constraint attendance_roster_student_required
    check (attendance_type != 'roster' or student_id is not null)
);

create unique index if not exists attendance_records_dedupe
  on public.attendance_records (student_id, class_option_id, class_number, class_date)
  where attendance_type = 'roster';

create unique index if not exists attendance_records_guest_dedupe
  on public.attendance_records (class_option_id, class_number, class_date, guest_name)
  where attendance_type = 'guest';

drop trigger if exists attendance_records_updated_at on public.attendance_records;
create trigger attendance_records_updated_at
  before update on public.attendance_records
  for each row execute function public.handle_updated_at();

alter table public.attendance_records enable row level security;

-- Teachers can read attendance for their own class only.
drop policy if exists attendance_records_teacher_select_own on public.attendance_records;
create policy attendance_records_teacher_select_own
on public.attendance_records
for select to authenticated
using (
  exists (
    select 1
    from public.class_options co
    where co.class_option_id = attendance_records.class_option_id
      and co.teacher_id = public.current_teacher_id()
  )
);

-- Teachers can insert attendance for their own class only.
drop policy if exists attendance_records_teacher_insert_own on public.attendance_records;
create policy attendance_records_teacher_insert_own
on public.attendance_records
for insert to authenticated
with check (
  exists (
    select 1
    from public.class_options co
    where co.class_option_id = attendance_records.class_option_id
      and co.teacher_id = public.current_teacher_id()
  )
);

-- Teachers can update attendance for their own class only.
drop policy if exists attendance_records_teacher_update_own on public.attendance_records;
create policy attendance_records_teacher_update_own
on public.attendance_records
for update to authenticated
using (
  exists (
    select 1
    from public.class_options co
    where co.class_option_id = attendance_records.class_option_id
      and co.teacher_id = public.current_teacher_id()
  )
)
with check (
  exists (
    select 1
    from public.class_options co
    where co.class_option_id = attendance_records.class_option_id
      and co.teacher_id = public.current_teacher_id()
  )
);

-- Admins and superadmins have full access.
drop policy if exists attendance_records_admin_all on public.attendance_records;
create policy attendance_records_admin_all
on public.attendance_records
for all to authenticated
using (coalesce(public.current_profile_role() in ('admin', 'superadmin'), false))
with check (coalesce(public.current_profile_role() in ('admin', 'superadmin'), false));

-- Pastors can read attendance for their subgroup's classes only.
drop policy if exists attendance_records_pastor_select_subgroup on public.attendance_records;
create policy attendance_records_pastor_select_subgroup
on public.attendance_records
for select to authenticated
using (
  coalesce(public.current_profile_role() = 'pastor', false)
  and exists (
    select 1
    from public.class_options co
    join public.teachers t
      on t.teacher_id = co.teacher_id
    where co.class_option_id = attendance_records.class_option_id
      and t.subgroup_id is not distinct from (
        select t2.subgroup_id
        from public.teachers t2
        where t2.teacher_id = public.current_teacher_id()
        limit 1
      )
  )
);

grant select, insert, update on public.attendance_records to authenticated;

alter table public.students
  add column if not exists enrollment_start_session integer default null;

comment on column public.students.enrollment_start_session is
'NULL = student attends from session 1.
 N = student joined at session N; suppress absence flags for sessions < N.';

commit;

