-- Waitlist simplification: rename NO_MATCHING_TIME → NO_SUITABLE_TIME for WAITLISTED students with no class assigned
UPDATE public.applicants
SET availability_status = 'NO_SUITABLE_TIME'
WHERE registration_status = 'WAITLISTED'
  AND availability_status != 'CLASS_ASSIGNED'
  AND class_option_id IS NULL;
