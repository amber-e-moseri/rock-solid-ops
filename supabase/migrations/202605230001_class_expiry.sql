ALTER TABLE public.class_options
ADD COLUMN IF NOT EXISTS enrollment_closes_at TIMESTAMPTZ;
