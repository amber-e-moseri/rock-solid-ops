-- Waitlist simplification: students with no class_option_id should use NO_MATCHING_TIME
UPDATE public.applicants
SET availability_status = 'NO_MATCHING_TIME'
WHERE registration_status = 'WAITLISTED'
  AND availability_status != 'CLASS_ASSIGNED'
  AND class_option_id IS NULL;
