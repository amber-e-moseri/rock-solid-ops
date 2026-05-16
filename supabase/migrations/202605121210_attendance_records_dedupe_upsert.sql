begin;

-- BUG 3 hardening: prevent duplicate attendance rows for same student/session key.
-- Preferred key: student_id + class_option_id + class_number + class_date.
-- Keep behavior idempotent when class_date is null (NULLS NOT DISTINCT).

do $$
begin
  -- Canonical table used by modern flows.
  if to_regclass('public.attendance_log') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'uq_attendance_no_dup'
        and conrelid = 'public.attendance_log'::regclass
    ) then
      execute '
        alter table public.attendance_log
        add constraint uq_attendance_no_dup
        unique nulls not distinct (student_id, class_option_id, class_number, class_date)
      ';
    end if;
  end if;

  -- Legacy table still referenced by legacy attendance submission paths.
  if to_regclass('public.attendance_records') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'uq_attendance_records_no_dup'
        and conrelid = 'public.attendance_records'::regclass
    ) then
      execute '
        alter table public.attendance_records
        add constraint uq_attendance_records_no_dup
        unique nulls not distinct (student_id, class_option_id, class_number, class_date)
      ';
    end if;
  end if;
end
$$;

commit;

