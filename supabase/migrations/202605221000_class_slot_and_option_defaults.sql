-- 202605221000_class_slot_and_option_defaults.sql
-- Add default UUID/text IDs for class slot/option primary keys.

ALTER TABLE public.class_slots
ALTER COLUMN class_slot_id
SET DEFAULT gen_random_uuid()::text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'class_options'
      AND column_name = 'class_option_id'
      AND column_default IS NULL
  ) THEN
    ALTER TABLE public.class_options
    ALTER COLUMN class_option_id
    SET DEFAULT 'CO-' || upper(substring(gen_random_uuid()::text, 1, 8));
  END IF;
END
$$;
