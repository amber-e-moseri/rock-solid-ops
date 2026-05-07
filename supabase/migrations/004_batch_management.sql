-- =============================================================
-- 004_batch_management.sql
-- Foundation School — Batch lifecycle management
-- =============================================================
--
-- Changes in this migration:
--   1. Extend batches table:
--        - Rename name → batch_name
--        - Add status TEXT (Draft/Open/Active/Completed/Archived/Suspended)
--        - Add archived BOOLEAN + archived_at TIMESTAMPTZ
--        - Add id UUID (surrogate; batch_id TEXT remains the PK + FK anchor)
--        - Backfill status from active/registration_open state
--        - Add partial unique indexes (one active, one reg-open at a time)
--   2. Add batch_id to applicants (registration locking)
--   3. Create batch_moodle_courses (Moodle prep per Task 7)
--   4. is_superadmin() RLS helper function
--   5. Restrict batches writes to superadmin only
--   6. RLS policies for batch_moodle_courses
--
-- NOTE on batch_id vs id:
--   The spec calls for id uuid primary key + batch_id text unique.
--   This migration keeps batch_id as the TEXT PRIMARY KEY because every
--   other table already references it as a FK. Changing the PK would
--   require cascading ALTER TABLE across 15+ tables. The id UUID column
--   is added as a non-PK surrogate for API consumers that prefer UUID refs.
--
-- NOTE on 002_seed_data.sql:
--   002 seeds batch 2025A using column name "name" (pre-rename).
--   When migrations run in order (001→002→003→004) on a fresh DB this is
--   correct — the rename happens after the seed. Do not run 002 standalone
--   after applying 004; use batch_name in any new seed rows.
-- =============================================================

BEGIN;

-- =============================================================
-- 1. Extend batches table
-- =============================================================

-- Rename name → batch_name (guarded so re-runs don't error)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'batches'
      AND column_name = 'name'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'batches'
      AND column_name = 'batch_name'
  ) THEN
    ALTER TABLE public.batches RENAME COLUMN name TO batch_name;
  END IF;
END $$;

-- Add new columns (all IF NOT EXISTS so migration is re-runnable)
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS id          UUID        DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS status      TEXT        NOT NULL DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS archived    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- status CHECK constraint (drop first to allow clean re-runs)
ALTER TABLE batches DROP CONSTRAINT IF EXISTS chk_batches_status;
UPDATE public.batches
SET status = CASE
  WHEN status IS NULL OR trim(status) = '' THEN 'Draft'
  WHEN lower(status) = 'draft' THEN 'Draft'
  WHEN lower(status) = 'open' THEN 'Open'
  WHEN lower(status) = 'active' THEN 'Active'
  WHEN lower(status) = 'completed' THEN 'Completed'
  WHEN lower(status) = 'archived' THEN 'Archived'
  WHEN lower(status) = 'suspended' THEN 'Suspended'
  WHEN lower(status) IN ('inactive', 'closed') THEN 'Archived'
  WHEN lower(status) IN ('pending') THEN 'Draft'
  ELSE 'Draft'
END;

ALTER TABLE public.batches DROP CONSTRAINT IF EXISTS chk_batches_status;

ALTER TABLE public.batches ADD CONSTRAINT chk_batches_status
  CHECK (status IN ('Draft', 'Open', 'Active', 'Completed', 'Archived', 'Suspended'));
-- Ensure batch_name is populated before making NOT NULL
UPDATE batches SET batch_name = batch_id WHERE batch_name IS NULL OR batch_name = '';
ALTER TABLE batches ALTER COLUMN batch_name SET NOT NULL;

-- Backfill start_sunday from start_date where missing
UPDATE batches
  SET start_sunday = start_date
  WHERE start_sunday IS NULL AND start_date IS NOT NULL;

-- Backfill status from legacy active/registration_open flags
UPDATE batches SET status = CASE
  WHEN archived          = true THEN 'Archived'
  WHEN active            = true THEN 'Active'
  WHEN registration_open = true THEN 'Open'
  ELSE 'Draft'
END WHERE status = 'Draft';

-- Partial unique indexes: enforce one active and one open batch at a time.
-- These are advisory constraints — the UI warns before activating,
-- and the DB enforces it as the final gate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_batches_one_active
  ON batches (active) WHERE active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_batches_one_reg_open
  ON batches (registration_open) WHERE registration_open = true;

-- Covering indexes (used by portal queries + phase2-processor)
CREATE INDEX IF NOT EXISTS idx_batches_status             ON batches (status);
CREATE INDEX IF NOT EXISTS idx_batches_registration_open  ON batches (registration_open);


-- =============================================================
-- 2. Add batch_id to applicants
-- =============================================================
-- Registration locking: every applicant must be tied to a batch.
-- Allows phase2-processor to validate class_slots belong to the
-- same batch the applicant registered for.

ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS batch_id TEXT REFERENCES batches(batch_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_applicants_batch_id ON applicants (batch_id);


-- =============================================================
-- 3. Create batch_moodle_courses
-- =============================================================
-- Controls which Moodle course each group (CE/CS/WS) uses per batch.
-- Subgroups (CSGA, CSGB, etc.) inherit from their parent group's course.
-- Example: CSGA + CSGB both resolve to the CS course for batch 2026A.

CREATE TABLE IF NOT EXISTS batch_moodle_courses (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                  TEXT        NOT NULL
                            REFERENCES batches(batch_id) ON DELETE RESTRICT,
  group_id                  TEXT        NOT NULL,
  subgroups                 TEXT[]      NOT NULL DEFAULT '{}',
  moodle_template_course_id TEXT,
  moodle_course_id          TEXT        NOT NULL,
  moodle_course_name        TEXT,
  moodle_course_url         TEXT,
  active                    BOOLEAN     NOT NULL DEFAULT true,
  created_by                TEXT,
  updated_by                TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, group_id),
  CONSTRAINT chk_batch_moodle_group_id CHECK (group_id IN ('CE', 'CS', 'WS'))
);
COMMENT ON TABLE batch_moodle_courses IS
  'Maps Moodle course IDs to batch + group. CE/CS/WS each get one Moodle course per batch; subgroups resolve via group_id. student.batch_id + student.group_id → deterministic Moodle course lookup.';

CREATE INDEX IF NOT EXISTS idx_batch_moodle_batch_id ON batch_moodle_courses (batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_moodle_group_id ON batch_moodle_courses (group_id);
CREATE INDEX IF NOT EXISTS idx_batch_moodle_active   ON batch_moodle_courses (active);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_batch_moodle_courses_updated_at'
  ) THEN
    CREATE TRIGGER trg_batch_moodle_courses_updated_at
      BEFORE UPDATE ON batch_moodle_courses
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  END IF;
END $$;


-- =============================================================
-- 4. RLS — is_superadmin() helper
-- =============================================================
-- Used by batch write policies. Checks the admin_users table for the
-- current authenticated user. SECURITY DEFINER so the function can
-- read admin_users regardless of calling user's RLS context.

CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users
    WHERE auth_user_id = auth.uid() AND role = 'superadmin'
  )
$$;


-- =============================================================
-- 5. Restrict batches writes to superadmin
-- =============================================================
-- Replace the open authenticated policies from 003_rls_policies.sql
-- with superadmin-gated equivalents.

DROP POLICY IF EXISTS batches_staff_insert ON batches;
DROP POLICY IF EXISTS batches_staff_update ON batches;
DROP POLICY IF EXISTS batches_staff_delete ON batches;

CREATE POLICY batches_superadmin_insert ON batches
  FOR INSERT TO authenticated
  WITH CHECK (is_superadmin());

CREATE POLICY batches_superadmin_update ON batches
  FOR UPDATE TO authenticated
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY batches_superadmin_delete ON batches
  FOR DELETE TO authenticated
  USING (is_superadmin());


-- =============================================================
-- 6. RLS for batch_moodle_courses
-- =============================================================

ALTER TABLE batch_moodle_courses ENABLE ROW LEVEL SECURITY;

-- All authenticated staff can read (needed for teacher availability UI)
CREATE POLICY batch_moodle_staff_select ON batch_moodle_courses
  FOR SELECT TO authenticated USING (true);

-- anon can read active mappings (for public Moodle link resolution)
CREATE POLICY batch_moodle_anon_select ON batch_moodle_courses
  FOR SELECT TO anon USING (active = true);

-- Only superadmin can write
CREATE POLICY batch_moodle_superadmin_insert ON batch_moodle_courses
  FOR INSERT TO authenticated WITH CHECK (is_superadmin());

CREATE POLICY batch_moodle_superadmin_update ON batch_moodle_courses
  FOR UPDATE TO authenticated
  USING (is_superadmin()) WITH CHECK (is_superadmin());

CREATE POLICY batch_moodle_superadmin_delete ON batch_moodle_courses
  FOR DELETE TO authenticated USING (is_superadmin());

COMMIT;
