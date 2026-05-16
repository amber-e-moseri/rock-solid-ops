-- 202605140001_add_teacher_direct.sql
-- Purpose: Add admin-only direct teacher provisioning RPC that does not send email.
-- Free-plan compatibility: uses Postgres + Supabase Auth Admin workflows only (no SMTP dependency).

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_create_teacher_direct(
  p_full_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_group_id text DEFAULT NULL,
  p_subgroup_id text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_actor_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name text := trim(coalesce(p_full_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_actor text := nullif(trim(coalesce(p_actor_email, '')), '');
  v_teacher_id text;
  v_existing_teacher_id text;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Email is required'
    );
  END IF;

  IF v_full_name = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Full name is required'
    );
  END IF;

  SELECT t.teacher_id
  INTO v_existing_teacher_id
  FROM public.teachers t
  WHERE lower(trim(coalesce(t.email, ''))) = v_email
    AND t.deleted_at IS NULL
  LIMIT 1;

  IF v_existing_teacher_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'A teacher with this email already exists',
      'teacher_id', v_existing_teacher_id
    );
  END IF;

  v_teacher_id :=
    'T-' ||
    upper(
      substring(
        regexp_replace(gen_random_uuid()::text, '[^a-zA-Z0-9]', '', 'g')
        FROM 1 FOR 8
      )
    );

  INSERT INTO public.teachers (
    teacher_id,
    full_name,
    email,
    phone,
    group_id,
    subgroup_id,
    notes,
    status,
    active,
    created_by,
    updated_by
  )
  VALUES (
    v_teacher_id,
    v_full_name,
    v_email,
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_group_id, '')), ''),
    nullif(trim(coalesce(p_subgroup_id, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    'PENDING',
    false,
    coalesce(v_actor, 'admin'),
    coalesce(v_actor, 'admin')
  );

  INSERT INTO public.audit_logs (
    action,
    actor_id,
    target_id,
    entity_type,
    metadata
  )
  VALUES (
    'teacher_created_direct',
    coalesce(v_actor, 'admin'),
    v_teacher_id,
    'teacher',
    jsonb_build_object(
      'full_name', v_full_name,
      'email', v_email,
      'method', 'direct_no_email',
      'group_id', nullif(trim(coalesce(p_group_id, '')), ''),
      'subgroup_id', nullif(trim(coalesce(p_subgroup_id, '')), '')
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'teacher_id', v_teacher_id,
    'email', v_email,
    'status', 'PENDING',
    'note', 'Teacher created directly without email delivery'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_teacher_direct(text, text, text, text, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_create_teacher_direct(text, text, text, text, text, text, text) FROM anon;

COMMIT;
