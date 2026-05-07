begin;

create table if not exists public.moodle_enrollment_sync (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid references public.applicants(id) on delete set null,
  student_id text references public.students(student_id) on delete set null,
  email text not null,
  full_name text,
  batch_id text references public.batches(batch_id) on delete set null,
  class_option_id text references public.class_options(class_option_id) on delete set null,
  course_id text,
  moodle_user_id text,
  registration_status text not null default 'ASSIGNED',
  sync_status text not null default 'PENDING',
  sync_attempts integer not null default 0,
  last_attempt_at timestamptz,
  synced_at timestamptz,
  last_error text,
  error_code text,
  retry_count integer not null default 0,
  retry_requested_at timestamptz,
  dedupe_key text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint moodle_enrollment_sync_status_chk check (sync_status in ('PENDING','PROCESSING','SYNCED','FAILED','RETRYING','RESOLVED','SKIPPED')),
  constraint moodle_enrollment_sync_registration_chk check (registration_status in ('ASSIGNED','WAITLISTED','DUPLICATE','REVIEW','PENDING','INACTIVE','COMPLETED'))
);

create unique index if not exists uq_moodle_enrollment_sync_applicant on public.moodle_enrollment_sync(applicant_id) where applicant_id is not null;
create unique index if not exists uq_moodle_enrollment_sync_dedupe on public.moodle_enrollment_sync(dedupe_key) where dedupe_key is not null;
create index if not exists idx_moodle_enrollment_sync_status on public.moodle_enrollment_sync(sync_status);
create index if not exists idx_moodle_enrollment_sync_created on public.moodle_enrollment_sync(created_at desc);
create index if not exists idx_moodle_enrollment_sync_last_attempt on public.moodle_enrollment_sync(last_attempt_at desc);

alter table public.moodle_enrollment_sync enable row level security;

drop policy if exists moodle_enrollment_sync_admin_select on public.moodle_enrollment_sync;
create policy moodle_enrollment_sync_admin_select
on public.moodle_enrollment_sync
for select
to authenticated
using (public.is_admin());

drop policy if exists moodle_enrollment_sync_admin_update on public.moodle_enrollment_sync;
create policy moodle_enrollment_sync_admin_update
on public.moodle_enrollment_sync
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists moodle_enrollment_sync_admin_insert on public.moodle_enrollment_sync;
create policy moodle_enrollment_sync_admin_insert
on public.moodle_enrollment_sync
for insert
to authenticated
with check (public.is_admin());

insert into public.moodle_enrollment_sync (
  applicant_id,
  student_id,
  email,
  full_name,
  batch_id,
  course_id,
  moodle_user_id,
  registration_status,
  sync_status,
  sync_attempts,
  last_attempt_at,
  synced_at,
  last_error,
  payload,
  dedupe_key
)
select
  null,
  ms.student_id,
  coalesce(st.email, ''),
  st.full_name,
  ms.batch_id,
  null,
  null,
  'COMPLETED',
  'SYNCED',
  1,
  ms.synced_at,
  ms.synced_at,
  null,
  jsonb_build_object('migrated_from', 'moodle_sync', 'legacy_id', ms.id),
  'legacy-moodle-sync:' || ms.id::text
from public.moodle_sync ms
left join public.students st on st.student_id = ms.student_id
where not exists (
  select 1
  from public.moodle_enrollment_sync mes
  where mes.dedupe_key = 'legacy-moodle-sync:' || ms.id::text
);

commit;
