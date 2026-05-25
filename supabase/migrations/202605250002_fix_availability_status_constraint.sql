-- Add CLASS_AVAILABLE (needed for class_now_available notification flow)
-- Keep NO_SUITABLE_TIME alongside NO_MATCHING_TIME for backward compatibility
ALTER TABLE public.applicants
  DROP CONSTRAINT IF EXISTS chk_applicants_availability_status;

ALTER TABLE public.applicants
  ADD CONSTRAINT chk_applicants_availability_status
  CHECK (availability_status = ANY (ARRAY[
    'CLASS_ASSIGNED',
    'NO_MATCHING_TIME',
    'NO_SUITABLE_TIME',
    'CLASS_FULL',
    'MANUAL_REVIEW_REQUIRED',
    'NO_CLASS_AVAILABLE',
    'CLASS_AVAILABLE'
  ]));
