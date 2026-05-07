begin;

-- Prevent duplicate outcome rows for the same person milestone in the same class session/date.
-- Natural dedupe key:
--   class_option_id + class_session + class_date + student_id + milestone_id
-- NULLS NOT DISTINCT ensures repeated submissions with null class_date are also deduped.
--
-- Pre-dedupe cleanup:
-- Keep the newest row per natural key and remove older duplicates before enforcing unique index.
with ranked as (
  select
    id,
    row_number() over (
      partition by
        class_option_id,
        class_session,
        class_date,
        student_id,
        milestone_id
      order by created_at desc nulls last, id desc
    ) as rn
  from public.session_outcomes
)
delete from public.session_outcomes so
using ranked r
where so.id = r.id
  and r.rn > 1;

create unique index if not exists ux_session_outcomes_dedupe
  on public.session_outcomes (
    class_option_id,
    class_session,
    class_date,
    student_id,
    milestone_id
  ) nulls not distinct;

commit;
