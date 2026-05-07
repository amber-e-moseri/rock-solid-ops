BEGIN;

DROP POLICY IF EXISTS attendance_admin_all ON public.attendance_log;

CREATE POLICY attendance_admin_all
ON public.attendance_log
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP FUNCTION IF EXISTS public.is_admin_like();

COMMIT;
