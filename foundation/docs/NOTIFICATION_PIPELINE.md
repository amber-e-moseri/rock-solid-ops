# Notification Pipeline

Authoritative reference for the Foundation School email notification pipeline.
Keep this document up to date when pipeline functions change.

Last updated: May 23, 2026

---

## Canonical Flow

```
┌─────────────────────────────────────────────────────┐
│         scheduled_notifications                     │
│         status = PENDING, scheduled_for <= now()    │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼  (batch, every run)
         ┌─────────────────────────┐
         │    notification-batch-processor   │  ← CANONICAL BATCH PROCESSOR
         │                         │
         │  Reads:  scheduled_notifications (PENDING, due)
         │  Writes: email_queue (status=Pending)
         │  Marks:  scheduled_notifications (status=SENT)
         │  Logs:   audit_logs
         └──────────────┬──────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│         email_queue                                 │
│         status = Pending                            │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼  (cron: daily 07:00 EST)
         ┌─────────────────────────┐
         │      email-sender       │  ← CANONICAL DELIVERY WORKER
         │                         │
         │  Reads:  email_queue (status=Pending, batch 50)
         │  Resolves: body_html from row or email_templates
         │  Sends:  Resend API
         │  Marks:  email_queue (status=Sent | Failed)
         └─────────────────────────┘
```

---

## Function Responsibilities

### notification-batch-processor — CANONICAL BATCH PROCESSOR

**File:** `supabase/functions/notification-batch-processor/index.ts`
**Schedule:** Not on a fixed cron; invoked on-demand or by upstream trigger.
**Status:** Active — canonical.

Responsibility:
- Reads `scheduled_notifications` where `status = PENDING` and `scheduled_for <= now()`
- For each row: inserts a corresponding `email_queue` row (`status = Pending`)
- Marks the notification `SENT` and increments `attempts`
- Writes an `audit_logs` entry per notification queued
- On row-level error: marks notification `FAILED` or leaves at `PENDING` if retries remain

This is the **only** function that should move scheduled_notifications into email_queue.

---

### email-sender — CANONICAL DELIVERY WORKER

**File:** `supabase/functions/email-sender/index.ts`
**Schedule:** `0 12 * * *` (daily 07:00 EST / 12:00 UTC winter)
**Status:** Active — canonical.

Responsibility:
- Reads up to 50 `email_queue` rows where `status = Pending`
- Resolves email content: uses `body_html` on the row if present, otherwise fetches from
  `email_templates` table by `template_key`
- Substitutes `{{variables}}` from row fields and `metadata`
- Sends via Resend API using `RESEND_API_KEY` env var
- On success: marks row `Sent`, sets `sent_at`
- On failure: marks row `Failed`, sets `error_message`
- Logs run summary to `sync_log`

---

### retry-worker — UNIFIED RETRY + MOODLE SWEEP

**File:** `supabase/functions/retry-worker/index.ts`
**Schedule:** `0 * * * *` (hourly)
**Status:** Active — canonical retry handler.

Responsibility:
- **`action: "retry"`** — single-item retry for `email_queue` or `scheduled_notifications`:
  - Reads row, validates status is FAILED/ERROR/PENDING (case-insensitive)
  - Increments `attempts`
  - For `email_queue`: resets `status = "Pending"`, clears `error_message` / `last_error`
  - For `scheduled_notifications`: resets `status = "PENDING"`, resets `scheduled_for = now()`, clears `last_error`
- **`action: "sweep"`** — auto-sweeps Moodle enrollment failures, retries failed syncs
- On the hourly cron: runs the Moodle sweep automatically

This function merges all logic previously split across `email-retry` and `notification-retry-helper`.
Both of those functions are now tombstoned (HTTP 410).

---

### sender-worker — DELETED

**File:** `supabase/functions/sender-worker/index.ts`
**Schedule:** None.
**Status:** DELETED — removed May 18, 2026. No historical stuck rows remained.

Legacy reconciliation behavior is retired. See git history for one-off reconcile script.

---

## Retry Behavior

### Notification-level retry (scheduled_notifications)

When a notification is FAILED or stuck PENDING, an operator can trigger a retry via the
Retry Center. This calls `retry-worker` with `{ action: "retry", source: "scheduled_notifications", id }`,
which resets it to `PENDING` with `scheduled_for = now()`. On the next `notification-batch-processor` run,
it will be picked up and re-queued to `email_queue`.

### Email-level retry (email_queue)

When an `email_queue` row is `Failed`, the operator can reset it to `Pending` via the
Retry Center. This calls `retry-worker` with `{ action: "retry", source: "email_queue", id }`.
On the next `email-sender` cron run (daily 07:00 EST), it will be retried.

### Retry limits

| Table | Max attempts field | Behavior at limit |
|---|---|---|
| `scheduled_notifications` | `max_attempts` | Marked FAILED, not re-queued |
| `email_queue` | No built-in limit | Manual reset required |

---

## Operational Troubleshooting

### Notification sent but email not received

1. Check `scheduled_notifications` row status — should be `SENT`.
2. Check `email_queue` for a matching row with `template_key` and `recipient_email`.
3. Check `email_queue.status` — `Failed` means Resend rejected it; see `error_message`.
4. Check `email_queue.status = Sent` + `sent_at` — confirms successful Resend delivery.
5. If `email_queue` row is `Pending` and `sent_at` is null, `email-sender` has not run yet
   (cron fires daily at 07:00 EST).

### Notification stuck as PENDING

1. Confirm `scheduled_for <= now()` on the row.
2. Confirm `notification-batch-processor` has run (check `audit_logs` for `SCHEDULED_NOTIFICATION_QUEUED`).
3. If not run: trigger `notification-batch-processor` manually via the Retry Center or admin API.
4. If `attempts >= max_attempts`: row will not be picked up — use Retry Center to reset.

### email_queue row stuck as Pending

1. Confirm `email-sender` cron is active (check `supabase/functions/email-sender/config.toml`).
2. Trigger `email-sender` manually if needed.
3. Check `RESEND_API_KEY` env var is configured.

### Notification marked FAILED unexpectedly

If a notification is FAILED with `last_error` like "No matching email_queue row found":
this is the `sender-worker` reconciliation behavior. `sender-worker` must be unscheduled.
Confirm it has no cron and has not been manually triggered. Reset the notification via the
Retry Center.

---

## Active Cron Summary

| Function | Schedule | Role |
|---|---|---|
| `email-sender` | `0 12 * * *` (daily 07:00 EST) | Resend delivery |
| `retry-worker` | `0 * * * *` (hourly) | Moodle enrollment retry sweep + unified retry handler |
| `missed-class-detector` | `15 2 * * *` (daily 02:15) | Attendance gap detection |
| `notification-batch-processor` | None (on-demand) | Notification batch queuing |

---

## Trace ID

Both `scheduled_notifications` and `email_queue` carry a `trace_id` UUID column.

- `scheduled_notifications.trace_id`: NOT NULL, auto-generated (`gen_random_uuid()`) on
  insert. Backfilled for pre-migration rows.
- `email_queue.trace_id`: nullable, copied from `scheduled_notifications.trace_id` by
  `notification-batch-processor` at queue time. Pre-migration rows have `trace_id = NULL`.
- `moodle_enrollment_sync.trace_id`: nullable, populated when enrollment sync rows are
  created from registration flows that have a trace context.

Trace lifecycle (current):
1. `registration-processor` creates one flow `trace_id` per registration run.
2. That same `trace_id` is written to immediate `email_queue` notifications and any
   `scheduled_notifications` created by the same flow.
3. `notification-batch-processor` propagates `scheduled_notifications.trace_id` into `email_queue`.
4. `moodle_enrollment_sync` rows created from assigned registrations carry the same `trace_id`.
5. Retry Center surfaces `trace_id` for failed notification/sync rows when available.

To trace a notification end-to-end:

```sql
-- Find all email_queue rows for a scheduled notification
SELECT eq.*
FROM email_queue eq
JOIN scheduled_notifications sn ON sn.trace_id = eq.trace_id
WHERE sn.id = '<notification-id>';

-- Or directly by trace_id if you already know it
SELECT * FROM scheduled_notifications WHERE trace_id = '<trace-id>';
SELECT * FROM email_queue           WHERE trace_id = '<trace-id>';
SELECT * FROM moodle_enrollment_sync WHERE trace_id = '<trace-id>';
```

Both tables have an index on `trace_id` for efficient lookups.

Operator lookup flow:

```sql
-- 1) Resolve trace from a known registration/applicant
SELECT id as applicant_id, email, created_at
FROM applicants
WHERE email = '<email>'
ORDER BY created_at DESC
LIMIT 1;

-- 2) Find notification rows and copy trace_id
SELECT id, trace_id, template_key, status, scheduled_for, created_at
FROM scheduled_notifications
WHERE applicant_id = '<applicant-uuid>'
ORDER BY created_at DESC;

-- 3) Follow same trace_id across outbound email + Moodle sync
SELECT id, status, recipient_email, sent_at, error_message, created_at
FROM email_queue
WHERE trace_id = '<trace-id>'
ORDER BY created_at ASC;

SELECT id, sync_status, failure_reason, last_error, updated_at
FROM moodle_enrollment_sync
WHERE trace_id = '<trace-id>'
ORDER BY updated_at ASC;
```

---

## Future Work

- Rename completed: `reminder-processor` -> `notification-batch-processor`.
- Consider adding a `notification-batch-processor` cron schedule once the batch behavior is confirmed
  stable in production.
- Surface `trace_id` in System Health per-applicant trace view when that feature is built.

---

## Operational Trace MVP (May 2026)

System Health now includes a read-only Operational Trace panel for debugging by:
- applicant email
- applicant ID
- student ID
- registration ID

Data is pulled via SQL RPC `public.get_operational_trace(...)` and normalized into a
chronological timeline across:
- applicants
- students
- class_roster
- moodle_enrollment_sync
- scheduled_notifications
- email_queue
- audit_logs
- sync_log
- error_submissions (best-effort)

Current limitation:
- This MVP intentionally uses tolerant joins and legacy fallback matching (email + JSON extraction).
- Older records may produce partial or duplicate matches.

Phase 2:
- Add typed `registration_id` propagation to pipeline tables (especially notification/email logs)
  to reduce ambiguity and tighten trace joins.

Implementation note (MVP safety hardening):
- RPC is `SECURITY DEFINER` with `search_path = public`.
- Execute privilege is limited to `authenticated` only.

---

## Deleted / Tombstoned Functions

| Function | Status | Date | Reason |
|---|---|---|---|
| `sender-worker` | Deleted | May 18, 2026 | Deprecated reconciliation path removed; no stuck PENDING rows |
| `scheduled-notification-sender` | Deleted | May 18, 2026 | Renamed to `notification-retry-helper`; old stub removed |
| `sender-healthcheck` | Deleted | May 18, 2026 | Non-operational stub retired |
| `email-retry` | Tombstoned (410) | May 23, 2026 | Merged into `retry-worker` — supports both `email_queue` and `scheduled_notifications` |
| `notification-retry-helper` | Tombstoned (410) | May 23, 2026 | Merged into `retry-worker` — `scheduled_for` reset behavior preserved |


