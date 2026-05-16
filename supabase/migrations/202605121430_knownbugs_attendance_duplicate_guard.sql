begin;

-- KNOWNBUGS duplicate attendance risk guard
-- Natural key: one record per student per class slot/session date
--   (student_id, class_option_id, class_number, class_date)
--
-- This migration is idempotent and safe on environments where either
-- attendance_log or attendance_records may not exist.

do $$
begin
  -- Canonical table.
  if to_regclass('public.attendance_log') is not null then
    -- Remove duplicate rows before enforcing uniqueness.
    execute $sql$
      delete from public.attendance_log a
      using public.attendance_log b
      where a.ctid < b.ctid
        and a.student_id is not distinct from b.student_id
        and a.class_option_id is not distinct from b.class_option_id
        and a.class_number is not distinct from b.class_number
        and a.class_date is not distinct from b.class_date
    $sql$;

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

  -- Legacy table.
  if to_regclass('public.attendance_records') is not null then
    execute $sql$
      delete from public.attendance_records a
      using public.attendance_records b
      where a.ctid < b.ctid
        and a.student_id is not distinct from b.student_id
        and a.class_option_id is not distinct from b.class_option_id
        and a.class_number is not distinct from b.class_number
        and a.class_date is not distinct from b.class_date
    $sql$;

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

