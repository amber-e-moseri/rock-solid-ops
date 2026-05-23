-- Fix is_admin() and is_admin_like() to include regional_secretary
-- Previously regional_secretary was blocked from viewing applicants, 
-- students, attendance, batches, teachers, and email_queue

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
  SELECT coalesce(
    public.current_profile_role() IN (
      'superadmin', 'admin', 'subgroup_admin', 
      'pastor', 'principal', 'regional_secretary'
    ),
    false
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_like()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    public.current_user_role() IN (
      'admin', 'superadmin', 'regional_secretary',
      'subgroup_admin', 'pastor', 'principal'
    ),
    false
  )
$function$;
