-- Stabilize class option creation flow from teacher availability approvals

alter table if exists public.teacher_availability
  add column if not exists class_option_sync_status text not null default 'PENDING',
  add column if not exists class_option_sync_error text,
  add column if not exists class_option_sync_attempts integer not null default 0,
  add column if not exists class_option_sync_last_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_teacher_availability_class_option_sync_status'
      AND conrelid = 'public.teacher_availability'::regclass
  ) THEN
    ALTER TABLE public.teacher_availability
      ADD CONSTRAINT chk_teacher_availability_class_option_sync_status
      CHECK (class_option_sync_status IN ('PENDING','PROCESSING','SUCCESS','FAILED'));
  END IF;
END $$;

create unique index if not exists ux_class_options_teacher_subgroup_day_time_active
  on public.class_options (teacher_id, subgroup_id, day, class_time)
  where deleted_at is null;

create index if not exists idx_teacher_availability_sync_status
  on public.teacher_availability (class_option_sync_status);
