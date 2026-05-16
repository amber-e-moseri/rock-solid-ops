-- Add trace_id to scheduled_notifications and email_queue so a single
-- notification can be traced end-to-end across both tables.
--
-- Pipeline:
--   scheduled_notifications.trace_id  (generated on insert)
--   → reminder-processor propagates it →
--   email_queue.trace_id              (copied from the source notification)
--
-- Existing scheduled_notifications rows are backfilled with unique UUIDs.
-- Existing email_queue rows have trace_id = NULL (pre-pipeline visibility).

-- ── scheduled_notifications ───────────────────────────────────────────────

ALTER TABLE public.scheduled_notifications
  ADD COLUMN IF NOT EXISTS trace_id UUID;

-- Backfill existing rows: each gets its own UUID (gen_random_uuid called per row).
UPDATE public.scheduled_notifications
  SET trace_id = gen_random_uuid()
  WHERE trace_id IS NULL;

-- Lock in NOT NULL + default for future rows.
ALTER TABLE public.scheduled_notifications
  ALTER COLUMN trace_id SET NOT NULL,
  ALTER COLUMN trace_id SET DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS scheduled_notifications_trace_id_idx
  ON public.scheduled_notifications(trace_id);

-- ── email_queue ───────────────────────────────────────────────────────────

ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS trace_id UUID;

-- Nullable: pre-migration rows and rows not originating from
-- scheduled_notifications legitimately have no trace_id.

CREATE INDEX IF NOT EXISTS email_queue_trace_id_idx
  ON public.email_queue(trace_id);
