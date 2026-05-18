# Engineering Conventions

Canonical internal engineering reference for Foundation School operations work.
This platform is maintained by a small team and optimized for long-term reliability.

## 1. Platform Architecture
- Operational monolith: keep the platform as one coherent operational system, not split services.
- Supabase-first architecture: Postgres + Edge Functions remain the runtime backbone.
- Reliability over extensibility: predictable execution and recoverability take priority over abstraction.
- Explicit state transitions: workflow tables must move through explicit statuses (`PENDING`, `SENT`, `FAILED`, etc.).
- Human-recoverable workflows: operators must be able to inspect, retry, and correct failures safely.

## 2. Edge Function Rules
- One responsibility per function/module.
- Use `supabase/functions/_shared/` utilities when available.
- Do not duplicate retry logic across functions.
- Do not duplicate audit logic across functions.
- Router pattern is preferred for large multi-action APIs.
- Preserve operational visibility: structured logs, explicit error codes, auditable status transitions.

Implementation notes:
- Reuse shared hardening patterns from `supabase/functions/shared-utils/edge-hardening.ts`.
- Use `createServiceClient()` / `createAnonClient()` from `_shared/supabase.ts` in new/refactored functions.
- Response helpers should keep stable response contracts (`ok`, `error`, `code`, `statusCode`).

## 3. Frontend Rules
- Use `fs-*` primitives only for new/refactored UI components.
- `foundation/ui/tokens.css` is the canonical design token source.
- No new inline styles for operational pages.
- No new page-specific design systems.
- Shared shell is required for staff pages.

Implementation notes:
- Import `primitives.css` and compose from existing fs-* classes before adding CSS.
- If a primitive is missing, extend `primitives.css` instead of adding per-page component systems.

## 4. Database Rules
- Use canonical table names only.
- No multi-table fallback loops in active runtime code.
- Use explicit status enums/state fields in operational tables.
- Audit logging must be preserved during refactors.

Implementation notes:
- Schema migrations should be additive, reversible where possible, and safe for active data.
- Refactors must not silently drop historical visibility.

## 5. Operational Rules
- All failures must be classified.
- Retryability must be explicit, not inferred later.
- Non-retryable failures must surface immediately to operators.
- `failure_reason` is required for external integration failures.

Implementation notes:
- Keep retry centers actionable: include source, status, error code/reason, and next step.
- Prefer bounded retries with clear terminal states.

## 6. Moodle Rules
- 403 classification is mandatory.
- Distinguish WAF block vs permissions vs REST-disabled cases.
- Moodle failures must be visible in Retry Center with actionable reason.

Implementation notes:
- Only retry 403 classes that are actually transient/retryable (e.g., WAF/network-like cases).
- Permission/configuration errors must fail fast and surface to operators.

## 7. Deprecation Policy
- Legacy systems must be marked clearly in code and docs.
- Do not run parallel canonical pipelines for the same workflow.
- Deprecated workers must not remain scheduled.

Implementation notes:
- Deprecation is two-step: unschedule first, remove after replacement verification.
- Keep runbooks and roadmap status aligned with deprecation state.

## 8. Canonical Notification Pipeline

The notification pipeline has three stages. Each stage has exactly one active function.
Do not add scheduling or business logic to helper or deprecated functions.

```
scheduled_notifications (status=PENDING, scheduled_for <= now)
  │
  ▼
notification-batch-processor                  ← CANONICAL BATCH PROCESSOR
  Reads:  scheduled_notifications   (PENDING, due)
  Writes: email_queue               (status=Pending)
  Marks:  scheduled_notifications   (status=SENT)
  Logs:   audit_logs
  │
  ▼
email_queue (status=Pending)
  │
  ▼
email-sender                        ← CANONICAL DELIVERY WORKER
  Reads:  email_queue               (status=Pending, batch 50)
  Sends:  Resend API
  Marks:  email_queue               (status=Sent | Failed)
  Schedule: cron daily 07:00 EST
```

**Other functions — do not confuse with the pipeline:**

| Function | Role | Status |
|---|---|---|
| `notification-retry-helper` | Single-item retry helper; resets one notification to PENDING | Active (Retry Center only) |
| `sender-worker` | Legacy reconciliation; marks notifications SENT/FAILED based on email_queue existence | Deprecated, unscheduled |

**Rules:**
- `notification-batch-processor` is the only function allowed to insert `email_queue` rows from `scheduled_notifications`.
- `notification-retry-helper` must never be given a cron schedule.
- `sender-worker` must remain unscheduled. Do not add logic to it.
- Running `sender-worker` or `notification-retry-helper` as batch processors alongside
  `notification-batch-processor` will cause incorrect status transitions and potential duplicate sends.

See `foundation/docs/NOTIFICATION_PIPELINE.md` for full topology and troubleshooting guide.

## 9. Operational Trace MVP

System Health includes a read-only Operational Trace MVP powered by SQL RPC
`public.get_operational_trace(...)`.

Rules:
- Keep it admin-only and read-only.
- Prefer tolerant joins and graceful degradation over hard failures.
- Do not expose secrets or raw stack traces to operators.
- Treat this as an operational debugging surface, not analytics.

Current limitations:
- The MVP uses legacy fallback matching (email + JSON extraction), so older records may
  return partial or duplicate events.

Phase 2 direction:
- Add typed `registration_id` propagation across pipeline tables to reduce ambiguous joins.

Security requirements:
- Keep trace RPC `SECURITY DEFINER` with explicit `search_path = public`.
- Grant execute to `authenticated` only; do not expose to `anon`.
- Frontend must verify admin access before rendering the trace panel.

Trace ID operational rules:
- Generate one `trace_id` per registration processing flow and reuse it for all notifications
  created by that flow unless intentionally split.
- Propagate `trace_id` into `scheduled_notifications`, `email_queue`, and
  `moodle_enrollment_sync` whenever available in scope.
- When writing audit `details`, include `trace_id` if already available; do not add separate
  audit systems for tracing.
- Operators should pivot by `trace_id` first in Retry Center/System Health, then drill into
  table-specific IDs.

