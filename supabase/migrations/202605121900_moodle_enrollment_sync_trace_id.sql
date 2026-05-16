-- Add optional trace_id to moodle_enrollment_sync for end-to-end operational tracing.
-- Nullable by design for legacy rows and non-notification-originated sync entries.

begin;

alter table if exists public.moodle_enrollment_sync
  add column if not exists trace_id uuid;

create index if not exists moodle_enrollment_sync_trace_id_idx
  on public.moodle_enrollment_sync(trace_id);

commit;
