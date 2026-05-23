-- 202605220020_makeup_workflow.sql
-- Makeup class management workflow:
--   1. Enable RLS on makeup_queue with admin + teacher + regional_secretary policies
--   2. Trigger on attendance_log to auto-create makeup entries for absent students
--   3. Notification template for makeup reminders
--
-- Notes on attendance_log columns:
--   class_date DATE and class_number TEXT already exist in the baseline schema.
--   The ALTER TABLE statements below are idempotent guards only.
--
-- Trigger condition replaces the spec's nonexistent 'session_status' column with
-- submitted_by_teacher = true, which is the actual "submitted" signal in the schema.

BEGIN;

-- Idempotent guards for columns that already exist in the baseline
ALTER TABLE public.attendance_log ADD COLUMN IF NOT EXISTS class_date   DATE;
ALTER TABLE public.attendance_log ADD COLUMN IF NOT EXISTS class_number TEXT;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.makeup_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS makeup_admin_all ON public.makeup_queue;
CREATE POLICY makeup_admin_all ON public.makeup_queue
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Teachers: read-only for students in their assigned classes
DROP POLICY IF EXISTS makeup_teacher_select ON public.makeup_queue;
CREATE POLICY makeup_teacher_select ON public.makeup_queue
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.class_options co ON co.class_option_id = s.class_option_id
      JOIN public.teachers t ON t.teacher_id = co.teacher_id
      WHERE s.student_id = makeup_queue.student_id
        AND t.teacher_user_id = auth.uid()
    )
  );

-- Regional secretaries: read access across all makeups (for cross-subgroup visibility)
DROP POLICY IF EXISTS makeup_regional_secretary_select ON public.makeup_queue;
CREATE POLICY makeup_regional_secretary_select ON public.makeup_queue
  FOR SELECT TO authenticated
  USING (public.current_profile_role() = 'regional_secretary');


-- ── Auto-create trigger ───────────────────────────────────────────────────────
-- Fires AFTER INSERT OR UPDATE OF present, made_up on attendance_log.
-- Creates a makeup_queue entry when a student is absent (present = false, made_up = false)
-- and a makeup does not already exist for this student + batch + class_number.
-- Idempotent: duplicate entries are blocked by the WHERE NOT EXISTS guard.
CREATE OR REPLACE FUNCTION public.trigger_makeup_queue_auto_create()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS
$$
BEGIN
  IF (NEW.present IS NULL OR NEW.present = false)
     AND (NEW.made_up IS NULL OR NEW.made_up = false)
     AND NEW.class_number IS NOT NULL
     AND NEW.batch_id     IS NOT NULL
     AND NEW.student_id   IS NOT NULL
  THEN
    INSERT INTO public.makeup_queue (
      student_id, subgroup_id, batch_id, class_number,
      makeup_type, deadline, makeup_completed
    )
    SELECT
      NEW.student_id,
      NEW.subgroup_id,
      NEW.batch_id,
      NEW.class_number,
      'Standard',
      CASE WHEN NEW.class_date IS NOT NULL
           THEN (NEW.class_date + INTERVAL '21 days')::DATE
           ELSE NULL
      END,
      false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.makeup_queue mq
      WHERE mq.student_id   = NEW.student_id
        AND mq.batch_id     = NEW.batch_id
        AND mq.class_number = NEW.class_number
        AND mq.makeup_completed = false
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_makeup_create ON public.attendance_log;
CREATE TRIGGER trg_attendance_makeup_create
  AFTER INSERT OR UPDATE OF present, made_up
  ON public.attendance_log
  FOR EACH ROW EXECUTE FUNCTION public.trigger_makeup_queue_auto_create();


-- ── Notification template ─────────────────────────────────────────────────────
INSERT INTO public.notification_templates (template_key, subject, body_html, active)
VALUES (
  'makeup_reminder',
  'Reminder: You have a makeup class due',
  '<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Makeup Class Reminder</title>
  <style>
    body { margin: 0; padding: 0; background: #f5f3ff; font-family: ''Manrope'', ''DM Sans'', Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(76,42,146,.10); }
    .header { background: #4C2A92; padding: 32px 40px 24px; text-align: center; }
    .header h1 { margin: 0; color: #fff; font-size: 22px; font-weight: 800; letter-spacing: -.01em; }
    .header p { margin: 6px 0 0; color: rgba(255,255,255,.75); font-size: 14px; }
    .body { padding: 32px 40px; color: #1a1a2e; }
    .body p { margin: 0 0 16px; line-height: 1.65; font-size: 15px; }
    .body .name { font-weight: 800; color: #4C2A92; }
    .detail-box { background: #fef9c3; border-left: 4px solid #b45309; border-radius: 8px; padding: 14px 18px; margin: 20px 0; font-size: 14px; color: #7c2d12; line-height: 1.6; }
    .deadline { font-weight: 800; font-size: 16px; }
    .cta { text-align: center; margin: 28px 0; }
    .cta a { display: inline-block; background: #4C2A92; color: #fff; text-decoration: none; padding: 13px 32px; border-radius: 999px; font-weight: 800; font-size: 15px; }
    .footer { border-top: 1px solid #ede9ff; padding: 20px 40px; text-align: center; color: #888; font-size: 12px; line-height: 1.6; }
    .footer strong { color: #4C2A92; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Rock Solid Foundation School</h1>
      <p>BLW Canada</p>
    </div>
    <div class="body">
      <p>Hi <span class="name">{{first_name}}</span>,</p>
      <p>This is a friendly reminder that you have a makeup session due for a missed Foundation School class.</p>
      <div class="detail-box">
        <strong>Missed class:</strong> Class {{class_number}}<br />
        <span class="deadline">Makeup deadline: {{deadline}}</span>
      </div>
      <p>To complete your makeup, please reach out to your teacher or class coordinator. Completing your makeup class is important — it counts toward your graduation eligibility.</p>
      <p>If you have any questions or need help arranging your makeup session, please contact us right away.</p>
      <div class="cta">
        <a href="mailto:foundation@lwcanada.org">Contact Us</a>
      </div>
      <p>We are cheering you on!<br /><strong>The Rock Solid Foundation School Team</strong><br />BLW Canada</p>
    </div>
    <div class="footer">
      <strong>LoveWorld Canada &mdash; BLW Canada</strong><br />
      You are receiving this because you are registered for Rock Solid Foundation School.<br />
      Questions? Email <a href="mailto:foundation@lwcanada.org" style="color:#4C2A92;">foundation@lwcanada.org</a>
    </div>
  </div>
</body>
</html>',
  true
)
ON CONFLICT (template_key) DO UPDATE
  SET subject    = excluded.subject,
      body_html  = excluded.body_html,
      active     = excluded.active,
      updated_at = now();

COMMIT;
