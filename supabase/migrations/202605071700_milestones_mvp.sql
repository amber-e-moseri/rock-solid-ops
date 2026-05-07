begin;

create table if not exists public.milestone_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  class_session_number integer null check (class_session_number between 1 and 52),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_milestone_status (
  id uuid primary key default gen_random_uuid(),
  applicant_id text not null,
  student_id text null,
  milestone_code text not null references public.milestone_definitions(code) on update cascade on delete restrict,
  status text not null default 'pending' check (status in ('pending','completed')),
  completed_at timestamptz null,
  completed_by text null,
  updated_at timestamptz not null default now(),
  updated_by text null
);

create unique index if not exists ux_student_milestone_status_applicant_code
  on public.student_milestone_status (applicant_id, milestone_code);

create index if not exists idx_student_milestone_status_milestone
  on public.student_milestone_status (milestone_code);

create index if not exists idx_student_milestone_status_updated_at
  on public.student_milestone_status (updated_at desc);

alter table public.milestone_definitions enable row level security;
alter table public.student_milestone_status enable row level security;

drop policy if exists milestone_definitions_admin_read on public.milestone_definitions;
create policy milestone_definitions_admin_read
on public.milestone_definitions
for select
to authenticated
using (public.is_admin());

drop policy if exists milestone_definitions_superadmin_write on public.milestone_definitions;
create policy milestone_definitions_superadmin_write
on public.milestone_definitions
for all
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists student_milestone_status_admin_read on public.student_milestone_status;
create policy student_milestone_status_admin_read
on public.student_milestone_status
for select
to authenticated
using (public.is_admin());

drop policy if exists student_milestone_status_admin_write on public.student_milestone_status;
create policy student_milestone_status_admin_write
on public.student_milestone_status
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.milestone_definitions (code, label, class_session_number, is_active, sort_order)
values
  ('BORN_AGAIN', 'Born Again', 1, true, 10),
  ('FILLED_WITH_SPIRIT', 'Filled with the Spirit', 2, true, 20),
  ('PARTNERSHIP', 'Partnership', null, true, 30),
  ('SOUL_WINNING', 'Soul Winning', null, true, 40)
on conflict (code) do update
set
  label = excluded.label,
  class_session_number = excluded.class_session_number,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

commit;

