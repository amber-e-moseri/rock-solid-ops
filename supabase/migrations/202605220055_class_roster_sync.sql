DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'class_roster_unique'
      AND conrelid = 'public.class_roster'::regclass
  ) THEN
    ALTER TABLE public.class_roster
      ADD CONSTRAINT class_roster_unique UNIQUE (student_id, class_option_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_applicant_to_students()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_teacher_id TEXT;
  v_teacher_name TEXT;
  v_student_id TEXT;
BEGIN
  IF NEW.registration_status = 'ASSIGNED'
     AND (OLD.registration_status IS NULL
          OR OLD.registration_status != 'ASSIGNED')
     AND NEW.class_option_id IS NOT NULL THEN

    SELECT co.teacher_id, t.full_name
    INTO v_teacher_id, v_teacher_name
    FROM public.class_options co
    LEFT JOIN public.teachers t
      ON t.teacher_id = co.teacher_id
    WHERE co.class_option_id = NEW.class_option_id
    LIMIT 1;

    INSERT INTO public.students (
      student_id,
      full_name,
      email,
      phone,
      group_id,
      subgroup_id,
      fellowship_code,
      batch_id,
      class_option_id,
      teacher_id,
      teacher_name,
      status,
      created_at,
      updated_at
    ) VALUES (
      NEW.id::text,
      COALESCE(NULLIF(NEW.full_name, ''), TRIM(CONCAT(COALESCE(NEW.first_name, ''), ' ', COALESCE(NEW.last_name, '')))),
      NEW.email,
      NEW.phone,
      NEW.group_id,
      NEW.subgroup_id,
      NEW.fellowship_code,
      NEW.batch_id,
      NEW.class_option_id,
      v_teacher_id,
      v_teacher_name,
      'Active',
      now(),
      now()
    )
    ON CONFLICT (email) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      phone = EXCLUDED.phone,
      group_id = EXCLUDED.group_id,
      subgroup_id = EXCLUDED.subgroup_id,
      fellowship_code = EXCLUDED.fellowship_code,
      batch_id = EXCLUDED.batch_id,
      class_option_id = EXCLUDED.class_option_id,
      teacher_id = EXCLUDED.teacher_id,
      teacher_name = EXCLUDED.teacher_name,
      status = 'Active',
      updated_at = now();

    SELECT s.student_id
    INTO v_student_id
    FROM public.students s
    WHERE s.email = NEW.email
    LIMIT 1;

    IF v_student_id IS NOT NULL AND NEW.class_option_id IS NOT NULL THEN
      INSERT INTO public.class_roster (
        id,
        student_id,
        class_option_id,
        batch_id,
        group_id,
        subgroup_id,
        status,
        enrolled_at,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        v_student_id,
        NEW.class_option_id,
        NEW.batch_id,
        NEW.group_id,
        NEW.subgroup_id,
        'Active',
        now(),
        now(),
        now()
      )
      ON CONFLICT (student_id, class_option_id)
      DO UPDATE SET
        status = 'Active',
        updated_at = now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

INSERT INTO public.class_roster (
  id,
  student_id,
  class_option_id,
  batch_id,
  group_id,
  subgroup_id,
  status,
  enrolled_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  s.student_id,
  s.class_option_id,
  s.batch_id,
  s.group_id,
  s.subgroup_id,
  'Active',
  now(),
  now(),
  now()
FROM public.students s
WHERE s.class_option_id IS NOT NULL
ON CONFLICT (student_id, class_option_id)
DO UPDATE SET
  status = 'Active',
  updated_at = now();
