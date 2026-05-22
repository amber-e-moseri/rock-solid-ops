-- Add retry count tracking for Moodle enrollment sync retries
ALTER TABLE public.moodle_enrollment_sync
ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;
