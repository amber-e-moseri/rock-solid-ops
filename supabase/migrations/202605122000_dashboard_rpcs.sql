-- Dashboard read-only RPCs.
-- All: SECURITY DEFINER, search_path=public, GRANT TO authenticated.
-- All: return empty rows (never raise) when referenced tables are missing.

-- ── 1. Registration status breakdown ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_registration_summary(
  p_batch_id  text    DEFAULT NULL,
  p_subgroups text[]  DEFAULT NULL
)
RETURNS TABLE (reg_status text, cnt bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_col text := 'status';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'applicants'
  ) THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'applicants'
      AND column_name = 'registration_status'
  ) THEN
    v_col := 'registration_status';
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT COALESCE(a.%I, ''UNKNOWN'')::text,
            COUNT(*)::bigint
     FROM applicants a
     LEFT JOIN class_options co ON co.class_option_id = a.class_option_id
     WHERE ($1 IS NULL OR EXISTS (
             SELECT 1 FROM class_slots cs
             WHERE cs.class_option_id = a.class_option_id AND cs.batch_id = $1))
       AND ($2 IS NULL OR cardinality($2) = 0
            OR co.subgroup_id::text = ANY($2))
     GROUP BY 1
     ORDER BY 2 DESC',
    v_col
  ) USING p_batch_id, p_subgroups;
EXCEPTION WHEN OTHERS THEN RETURN;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_registration_summary(text, text[]) TO authenticated;


-- ── 2. Fellowship breakdown ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_fellowship_breakdown(
  p_batch_id  text    DEFAULT NULL,
  p_subgroups text[]  DEFAULT NULL
)
RETURNS TABLE (fellowship text, cnt bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'applicants'
  ) THEN RETURN; END IF;

  RETURN QUERY
    SELECT COALESCE(a.fellowship_code, 'Unknown')::text,
           COUNT(*)::bigint
    FROM applicants a
    LEFT JOIN class_options co ON co.class_option_id = a.class_option_id
    WHERE (p_batch_id IS NULL OR EXISTS (
             SELECT 1 FROM class_slots cs
             WHERE cs.class_option_id = a.class_option_id AND cs.batch_id = p_batch_id))
      AND (p_subgroups IS NULL OR cardinality(p_subgroups) = 0
           OR co.subgroup_id::text = ANY(p_subgroups))
    GROUP BY 1
    ORDER BY 2 DESC;
EXCEPTION WHEN OTHERS THEN RETURN;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_fellowship_breakdown(text, text[]) TO authenticated;


-- ── 3. Weekly registration trend (last 12 weeks) ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_registrations_by_week(
  p_batch_id  text    DEFAULT NULL,
  p_subgroups text[]  DEFAULT NULL
)
RETURNS TABLE (week_start date, cnt bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'applicants'
  ) THEN RETURN; END IF;

  RETURN QUERY
    SELECT date_trunc('week', a.created_at)::date,
           COUNT(*)::bigint
    FROM applicants a
    LEFT JOIN class_options co ON co.class_option_id = a.class_option_id
    WHERE (p_batch_id IS NULL OR EXISTS (
             SELECT 1 FROM class_slots cs
             WHERE cs.class_option_id = a.class_option_id AND cs.batch_id = p_batch_id))
      AND (p_subgroups IS NULL OR cardinality(p_subgroups) = 0
           OR co.subgroup_id::text = ANY(p_subgroups))
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 12;
EXCEPTION WHEN OTHERS THEN RETURN;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_registrations_by_week(text, text[]) TO authenticated;


-- ── 4. Class capacity (enrolled from roster, not denormalized slot counter) ──
CREATE OR REPLACE FUNCTION public.get_capacity_summary(
  p_batch_id  text    DEFAULT NULL,
  p_subgroups text[]  DEFAULT NULL
)
RETURNS TABLE (
  class_option_id text,
  day             text,
  class_time      text,
  fellowship      text,
  batch_id        text,
  max_capacity    integer,
  enrolled_count  bigint,
  pct             numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'class_slots'
  ) THEN RETURN; END IF;

  RETURN QUERY
    SELECT
      co.class_option_id::text,
      co.day::text,
      co.class_time::text,
      COALESCE((co.fellowship_codes)[1], co.subgroup_id::text, 'Unknown')::text,
      cs.batch_id::text,
      COALESCE(cs.max_capacity, co.max_capacity, 0)::integer,
      COUNT(cr.id)::bigint,
      CASE WHEN COALESCE(cs.max_capacity, co.max_capacity, 0) > 0
           THEN ROUND(COUNT(cr.id) * 100.0
                  / NULLIF(COALESCE(cs.max_capacity, co.max_capacity, 0), 0), 1)
           ELSE 0::numeric
      END
    FROM class_slots cs
    JOIN class_options co ON co.class_option_id = cs.class_option_id
    LEFT JOIN class_roster cr
           ON cr.class_option_id = co.class_option_id
          AND cr.batch_id        = cs.batch_id
          AND cr.status          = 'Active'
    WHERE cs.status != 'Cancelled'
      AND (p_batch_id IS NULL OR cs.batch_id = p_batch_id)
      AND (p_subgroups IS NULL OR cardinality(p_subgroups) = 0
           OR co.subgroup_id::text = ANY(p_subgroups))
    GROUP BY co.class_option_id, co.day, co.class_time,
             co.fellowship_codes, co.subgroup_id,
             cs.batch_id, cs.max_capacity, co.max_capacity
    ORDER BY co.day, co.class_time;
EXCEPTION WHEN OTHERS THEN RETURN;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_capacity_summary(text, text[]) TO authenticated;


-- ── 5. Stale REVIEW queue count (> 48 h) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_stale_queue_items(
  p_batch_id  text    DEFAULT NULL,
  p_subgroups text[]  DEFAULT NULL
)
RETURNS TABLE (cnt bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'applicants'
  ) THEN
    RETURN QUERY SELECT 0::bigint; RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'applicants'
      AND column_name = 'registration_status'
  ) THEN
    RETURN QUERY SELECT 0::bigint; RETURN;
  END IF;

  RETURN QUERY
    SELECT COUNT(*)::bigint
    FROM applicants a
    LEFT JOIN class_options co ON co.class_option_id = a.class_option_id
    WHERE a.registration_status = 'REVIEW'
      AND COALESCE(a.reviewed_at, a.created_at) < NOW() - INTERVAL '48 hours'
      AND (p_batch_id IS NULL OR EXISTS (
             SELECT 1 FROM class_slots cs
             WHERE cs.class_option_id = a.class_option_id AND cs.batch_id = p_batch_id))
      AND (p_subgroups IS NULL OR cardinality(p_subgroups) = 0
           OR co.subgroup_id::text = ANY(p_subgroups));
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 0::bigint;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_stale_queue_items(text, text[]) TO authenticated;


-- ── 6. Failed sync counts (moodle + email) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_failed_sync_counts(
  p_subgroups text[] DEFAULT NULL
)
RETURNS TABLE (source text, cnt bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'moodle_enrollment_sync'
  ) THEN
    RETURN QUERY
      SELECT 'moodle_sync'::text, COUNT(*)::bigint
      FROM moodle_enrollment_sync
      WHERE sync_status IN ('FAILED', 'ERROR');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'email_queue'
  ) THEN
    RETURN QUERY
      SELECT 'email_queue'::text, COUNT(*)::bigint
      FROM email_queue
      WHERE status IN ('Failed', 'FAILED');
  END IF;
EXCEPTION WHEN OTHERS THEN RETURN;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_failed_sync_counts(text[]) TO authenticated;


-- ── 7. Escalation task summary (clickup_task_links) ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_escalation_summary(
  p_subgroups text[] DEFAULT NULL
)
RETURNS TABLE (source_type text, task_status text, cnt bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clickup_task_links'
  ) THEN RETURN; END IF;

  RETURN QUERY
    SELECT ctl.source_type::text,
           ctl.status::text,
           COUNT(*)::bigint
    FROM clickup_task_links ctl
    GROUP BY ctl.source_type, ctl.status
    ORDER BY 3 DESC;
EXCEPTION WHEN OTHERS THEN RETURN;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_escalation_summary(text[]) TO authenticated;
