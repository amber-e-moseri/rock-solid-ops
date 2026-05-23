-- 202605220010_graduation_engine.sql
-- Centralized graduation eligibility engine: table + 3 RPCs + attendance trigger.
-- Replaces the legacy graduation_review (student_id-based) with a new
-- graduation_eligibility table keyed on applicant_id UUID + batch_id TEXT.
--
-- Gate definitions:
--   Gate 1 — Attendance:     ≥ 6 sessions present OR made_up in attendance_log
--   Gate 2 — Moodle:         HOLY_SPIRIT milestone status = 'completed'
--   Gate 3 — Core milestones: BORN_AGAIN + FILLED_WITH_SPIRIT both completed
--   Gate 4 — Exam grade:     'Overall Course Grade' ≥ 70 in student_grades
--
-- Attendance bridge: attendance_log.student_id TEXT → students.email → applicants.email

BEGIN;

-- ── 1. Seed HOLY_SPIRIT milestone definition ──────────────────────────────────
-- Inserted between FILLED_WITH_SPIRIT (sort 20) and PARTNERSHIP (sort 30).
INSERT INTO public.milestone_definitions (code, label, class_session_number, is_active, sort_order)
VALUES ('HOLY_SPIRIT', 'Filled with the Holy Spirit (Moodle)', NULL, true, 25)
ON CONFLICT (code) DO UPDATE
  SET label                = excluded.label,
      is_active            = excluded.is_active,
      sort_order           = excluded.sort_order,
      updated_at           = now();

-- ── 2. graduation_eligibility table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.graduation_eligibility (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id         UUID        NOT NULL
                       REFERENCES public.applicants(id) ON DELETE CASCADE,
  batch_id             TEXT        NOT NULL
                       REFERENCES public.batches(batch_id) ON DELETE RESTRICT,
  gate1_attendance     BOOLEAN     NOT NULL DEFAULT false,
  gate2_moodle_complete BOOLEAN    NOT NULL DEFAULT false,
  gate3_milestones_met  BOOLEAN    NOT NULL DEFAULT false,
  gate4_exam_passed    BOOLEAN     NOT NULL DEFAULT false,
  eligible             BOOLEAN     GENERATED ALWAYS AS (
    gate1_attendance AND gate2_moodle_complete AND gate3_milestones_met AND gate4_exam_passed
  ) STORED,
  override_eligible    BOOLEAN,        -- NULL = no override; TRUE/FALSE = manual decision
  override_reason      TEXT,
  overridden_by        TEXT,           -- email of the staff member who overrode
  overridden_at        TIMESTAMPTZ,
  last_evaluated_at    TIMESTAMPTZ,
  evaluated_by         TEXT,           -- 'system' or staff email
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (applicant_id, batch_id)
);

ALTER TABLE public.graduation_eligibility ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_grad_elig_applicant ON public.graduation_eligibility (applicant_id);
CREATE INDEX IF NOT EXISTS idx_grad_elig_batch     ON public.graduation_eligibility (batch_id);
CREATE INDEX IF NOT EXISTS idx_grad_elig_eligible  ON public.graduation_eligibility (eligible);

CREATE TRIGGER trg_graduation_eligibility_updated_at
  BEFORE UPDATE ON public.graduation_eligibility
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Admins (superadmin, admin, subgroup_admin, pastor, principal) have full access.
DROP POLICY IF EXISTS grad_elig_admin_all ON public.graduation_eligibility;
CREATE POLICY grad_elig_admin_all ON public.graduation_eligibility
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Teachers and regional_secretaries can read (to view their students' eligibility).
DROP POLICY IF EXISTS grad_elig_staff_read ON public.graduation_eligibility;
CREATE POLICY grad_elig_staff_read ON public.graduation_eligibility
  FOR SELECT TO authenticated
  USING (public.current_profile_role() IN ('teacher', 'regional_secretary'));


-- ── 3. RPC: evaluate_graduation_eligibility ───────────────────────────────────
-- Evaluates all four gates for a single applicant, upserts graduation_eligibility,
-- and returns the current row (including any manual override).
CREATE OR REPLACE FUNCTION public.evaluate_graduation_eligibility(
  p_applicant_id UUID,
  p_batch_id     TEXT DEFAULT NULL
)
RETURNS TABLE (
  applicant_id          UUID,
  batch_id              TEXT,
  gate1_attendance      BOOLEAN,
  gate2_moodle_complete BOOLEAN,
  gate3_milestones_met  BOOLEAN,
  gate4_exam_passed     BOOLEAN,
  eligible              BOOLEAN,
  override_eligible     BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS
$$
DECLARE
  v_batch_id   TEXT;
  v_email      TEXT;
  v_student_id TEXT;
  v_att_count  INTEGER;
  v_g1         BOOLEAN;
  v_g2         BOOLEAN;
  v_g3         BOOLEAN;
  v_g4         BOOLEAN;
BEGIN
  -- Resolve batch_id
  IF p_batch_id IS NOT NULL THEN
    v_batch_id := p_batch_id;
  ELSE
    SELECT a.batch_id INTO v_batch_id
    FROM public.applicants a
    WHERE a.id = p_applicant_id
    LIMIT 1;
  END IF;

  IF v_batch_id IS NULL THEN
    RETURN;
  END IF;

  -- Bridge: applicants.email → students.student_id (attendance_log uses student_id TEXT)
  SELECT a.email INTO v_email
  FROM public.applicants a
  WHERE a.id = p_applicant_id
  LIMIT 1;

  SELECT s.student_id INTO v_student_id
  FROM public.students s
  WHERE s.email = v_email
  LIMIT 1;

  -- Gate 1: ≥ 6 sessions where student was present OR did a makeup
  IF v_student_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_att_count
    FROM public.attendance_log al
    WHERE al.student_id = v_student_id
      AND al.batch_id   = v_batch_id
      AND (al.present = true OR al.made_up = true);
  ELSE
    v_att_count := 0;
  END IF;
  v_g1 := v_att_count >= 6;

  -- Gate 2: Moodle course completed (stored as HOLY_SPIRIT milestone)
  SELECT EXISTS(
    SELECT 1 FROM public.student_milestone_status sms
    WHERE sms.applicant_id  = p_applicant_id::TEXT
      AND sms.milestone_code = 'HOLY_SPIRIT'
      AND sms.status         = 'completed'
  ) INTO v_g2;

  -- Gate 3: Both BORN_AGAIN and FILLED_WITH_SPIRIT milestones completed
  SELECT (
    COUNT(*) FILTER (
      WHERE sms.milestone_code IN ('BORN_AGAIN', 'FILLED_WITH_SPIRIT')
        AND sms.status = 'completed'
    ) >= 2
  ) INTO v_g3
  FROM public.student_milestone_status sms
  WHERE sms.applicant_id = p_applicant_id::TEXT;

  -- Gate 4: Overall course grade ≥ 70 in student_grades
  SELECT EXISTS(
    SELECT 1 FROM public.student_grades sg
    WHERE sg.applicant_id  = p_applicant_id
      AND sg.course_name   = 'Overall Course Grade'
      AND sg.grade        >= 70
  ) INTO v_g4;

  -- Upsert: preserve override fields on conflict
  INSERT INTO public.graduation_eligibility (
    applicant_id, batch_id,
    gate1_attendance, gate2_moodle_complete, gate3_milestones_met, gate4_exam_passed,
    last_evaluated_at, evaluated_by, updated_at
  )
  VALUES (
    p_applicant_id, v_batch_id,
    v_g1, v_g2, v_g3, v_g4,
    now(), 'system', now()
  )
  ON CONFLICT (applicant_id, batch_id) DO UPDATE SET
    gate1_attendance      = excluded.gate1_attendance,
    gate2_moodle_complete = excluded.gate2_moodle_complete,
    gate3_milestones_met  = excluded.gate3_milestones_met,
    gate4_exam_passed     = excluded.gate4_exam_passed,
    last_evaluated_at     = now(),
    evaluated_by          = 'system',
    updated_at            = now();

  -- Return the stored row (includes override fields written by override_graduation_eligibility)
  RETURN QUERY
    SELECT ge.applicant_id, ge.batch_id,
           ge.gate1_attendance, ge.gate2_moodle_complete, ge.gate3_milestones_met, ge.gate4_exam_passed,
           ge.eligible, ge.override_eligible
    FROM public.graduation_eligibility ge
    WHERE ge.applicant_id = p_applicant_id
      AND ge.batch_id     = v_batch_id;
END;
$$;

COMMENT ON FUNCTION public.evaluate_graduation_eligibility IS
'Evaluates all 4 graduation gates for one applicant and upserts graduation_eligibility. Override fields are preserved.';

GRANT EXECUTE ON FUNCTION public.evaluate_graduation_eligibility TO authenticated;


-- ── 4. RPC: evaluate_batch_graduation ─────────────────────────────────────────
-- Iterates every non-inactive applicant in a batch and calls evaluate_graduation_eligibility.
CREATE OR REPLACE FUNCTION public.evaluate_batch_graduation(p_batch_id TEXT)
RETURNS TABLE (processed INTEGER, eligible INTEGER, not_eligible INTEGER)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS
$$
DECLARE
  v_processed    INTEGER := 0;
  v_eligible     INTEGER := 0;
  v_not_eligible INTEGER := 0;
  rec            RECORD;
BEGIN
  FOR rec IN
    SELECT a.id AS applicant_id
    FROM public.applicants a
    WHERE a.batch_id = p_batch_id
      AND a.registration_status NOT IN ('INACTIVE', 'DUPLICATE')
  LOOP
    PERFORM public.evaluate_graduation_eligibility(rec.applicant_id, p_batch_id);
    v_processed := v_processed + 1;
  END LOOP;

  -- Tally from the freshly-upserted rows
  SELECT
    COUNT(*) FILTER (WHERE ge.eligible = true  OR ge.override_eligible = true),
    COUNT(*) FILTER (WHERE (ge.eligible IS NULL OR ge.eligible = false)
                       AND (ge.override_eligible IS NULL OR ge.override_eligible = false))
  INTO v_eligible, v_not_eligible
  FROM public.graduation_eligibility ge
  WHERE ge.batch_id = p_batch_id;

  RETURN QUERY SELECT v_processed, v_eligible, v_not_eligible;
END;
$$;

COMMENT ON FUNCTION public.evaluate_batch_graduation IS
'Bulk-evaluates graduation eligibility for all active applicants in a batch.';

GRANT EXECUTE ON FUNCTION public.evaluate_batch_graduation TO authenticated;


-- ── 5. RPC: override_graduation_eligibility ───────────────────────────────────
-- Sets a manual override on a single applicant's eligibility row.
-- Pass p_eligible = NULL to clear the override.
CREATE OR REPLACE FUNCTION public.override_graduation_eligibility(
  p_applicant_id UUID,
  p_batch_id     TEXT,
  p_eligible     BOOLEAN,
  p_reason       TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS
$$
DECLARE
  v_actor TEXT;
BEGIN
  SELECT p.email INTO v_actor
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.graduation_eligibility (
    applicant_id, batch_id,
    gate1_attendance, gate2_moodle_complete, gate3_milestones_met, gate4_exam_passed,
    override_eligible, override_reason, overridden_by, overridden_at, updated_at
  )
  VALUES (
    p_applicant_id, p_batch_id,
    false, false, false, false,
    p_eligible, p_reason, v_actor, now(), now()
  )
  ON CONFLICT (applicant_id, batch_id) DO UPDATE SET
    override_eligible = excluded.override_eligible,
    override_reason   = excluded.override_reason,
    overridden_by     = excluded.overridden_by,
    overridden_at     = now(),
    updated_at        = now();
END;
$$;

COMMENT ON FUNCTION public.override_graduation_eligibility IS
'Sets or clears a manual eligibility override for a single applicant. Pass p_eligible = NULL to clear.';

GRANT EXECUTE ON FUNCTION public.override_graduation_eligibility TO authenticated;


-- ── 6. Trigger: re-evaluate on attendance changes ─────────────────────────────
-- Fires AFTER INSERT or UPDATE of the present/made_up columns so that eligibility
-- is kept fresh without a full batch re-run. Uses the student_id → email → applicant bridge.
CREATE OR REPLACE FUNCTION public.trigger_graduation_reeval()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS
$$
DECLARE
  v_applicant_id UUID;
BEGIN
  SELECT a.id INTO v_applicant_id
  FROM public.students s
  JOIN public.applicants a ON a.email = s.email
  WHERE s.student_id = NEW.student_id
    AND (NEW.batch_id IS NULL OR a.batch_id = NEW.batch_id)
  LIMIT 1;

  IF v_applicant_id IS NOT NULL THEN
    PERFORM public.evaluate_graduation_eligibility(v_applicant_id, NEW.batch_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_graduation_reeval ON public.attendance_log;
CREATE TRIGGER trg_attendance_graduation_reeval
  AFTER INSERT OR UPDATE OF present, made_up
  ON public.attendance_log
  FOR EACH ROW EXECUTE FUNCTION public.trigger_graduation_reeval();

COMMIT;
