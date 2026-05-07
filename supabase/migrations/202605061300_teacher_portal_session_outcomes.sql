begin;

create table if not exists public.session_outcomes (
  id uuid primary key default gen_random_uuid(),
  teacher_id text,
  class_option_id text,
  class_session text,
  class_date date,
  student_id text,
  person_type text,
  full_name text,
  email text,
  milestone_id text not null,
  question text,
  outcome_result text,
  submitted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_session_outcomes_class
  on public.session_outcomes (class_option_id, class_session, class_date);
create index if not exists idx_session_outcomes_student
  on public.session_outcomes (student_id);

alter table public.session_outcomes enable row level security;

drop policy if exists session_outcomes_staff_select on public.session_outcomes;
create policy session_outcomes_staff_select
on public.session_outcomes
for select to authenticated
using (true);

drop policy if exists session_outcomes_staff_insert on public.session_outcomes;
create policy session_outcomes_staff_insert
on public.session_outcomes
for insert to authenticated
with check (true);

commit;
