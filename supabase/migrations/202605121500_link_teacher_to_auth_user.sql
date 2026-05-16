-- Adds teacher_user_id column and a helper RPC that admins can call to link
-- a teacher's email to their Supabase auth account, resolving INVALID_TEACHER_MAPPING errors.

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS teacher_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON public.teachers(teacher_user_id);

CREATE OR REPLACE FUNCTION public.link_teacher_to_auth_user(teacher_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id  uuid;
  v_teacher_id    text;
  v_normalized    text;
BEGIN
  v_normalized := lower(trim(teacher_email));

  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE lower(email) = v_normalized
  LIMIT 1;

  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No auth user found with email: ' || v_normalized);
  END IF;

  SELECT teacher_id INTO v_teacher_id
  FROM public.teachers
  WHERE lower(email) = v_normalized
  LIMIT 1;

  IF v_teacher_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No teacher row found with email: ' || v_normalized);
  END IF;

  UPDATE public.teachers
  SET
    teacher_user_id = v_auth_user_id,
    email           = v_normalized,
    updated_at      = now()
  WHERE teacher_id = v_teacher_id;

  RETURN jsonb_build_object(
    'ok',           true,
    'teacher_id',   v_teacher_id,
    'auth_user_id', v_auth_user_id,
    'email',        v_normalized
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_teacher_to_auth_user(text) TO authenticated;
