-- 202605221001_student_grades_extend.sql
-- Extend student_grades with per-grade-item columns needed for Moodle gradebook sync.
-- Add grade_sync_available flag to moodle_enrollment_sync for API detection.

ALTER TABLE public.student_grades
  ADD COLUMN IF NOT EXISTS email            TEXT,
  ADD COLUMN IF NOT EXISTS moodle_course_id TEXT,
  ADD COLUMN IF NOT EXISTS course_name      TEXT,
  ADD COLUMN IF NOT EXISTS grade_max        NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS last_synced_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS raw_response     JSONB;

-- Unique target for grade item upserts: one row per student × Moodle course × item name.
-- NULLs are excluded from Postgres UNIQUE enforcement, so pre-existing NULL rows are safe.
ALTER TABLE public.student_grades
  ADD CONSTRAINT student_grades_unique
  UNIQUE (student_id, moodle_course_id, course_name);

-- NULL  = not yet attempted; FALSE = API unavailable; skip grade sync for this row.
ALTER TABLE public.moodle_enrollment_sync
  ADD COLUMN IF NOT EXISTS grade_sync_available BOOLEAN;
