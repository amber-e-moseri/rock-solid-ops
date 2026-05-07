begin;

alter table if exists public.moodle_enrollment_sync
  add column if not exists registration_id uuid,
  add column if not exists status text;

update public.moodle_enrollment_sync
set registration_id = coalesce(registration_id, applicant_id),
    status = coalesce(status, sync_status)
where registration_id is null
   or status is null;

create index if not exists idx_moodle_enrollment_sync_registration_id
  on public.moodle_enrollment_sync (registration_id);

commit;

