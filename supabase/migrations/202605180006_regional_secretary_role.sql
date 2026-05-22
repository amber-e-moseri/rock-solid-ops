-- Allow regional_secretary as a valid profile role
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN (
  'superadmin','admin','subgroup_admin','pastor',
  'principal','teacher','pending','regional_secretary'
));

-- Update is_staff() to include regional_secretary
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN (
      'superadmin','admin','subgroup_admin','pastor',
      'principal','teacher','regional_secretary'
    )
    AND is_active = true
  )
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
