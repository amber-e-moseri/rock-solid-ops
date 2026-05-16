-- Add failure_reason column to moodle_enrollment_sync
-- Stores the specific 403 cause code (MOODLE_WAF_BLOCK, MOODLE_REST_DISABLED,
-- MOODLE_PERMISSION_DENIED, MOODLE_403_UNKNOWN) for operational visibility.

ALTER TABLE moodle_enrollment_sync
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;
