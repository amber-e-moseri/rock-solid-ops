begin;

alter table if exists public.moodle_enrollment_sync
  add column if not exists moodle_course_id text,
  add column if not exists error_message text,
  add column if not exists attempts integer;

update public.moodle_enrollment_sync
set moodle_course_id = coalesce(moodle_course_id, course_id),
    error_message = coalesce(error_message, last_error),
    attempts = coalesce(attempts, sync_attempts)
where moodle_course_id is null
   or error_message is null
   or attempts is null;

commit;
