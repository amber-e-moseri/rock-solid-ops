# Foundation School System

Supabase-first registration and operations platform for Foundation School (staff/admin portals, student lifecycle, attendance/session outcomes, milestones, notifications, and Moodle sync).

> Status: Active MVP hardening. Supabase is canonical backend as of May 2026.

## Canonical Operational Rule
- Registration processing is single-path only.
- Canonical path: Supabase Edge Function `registration-processor`.
- Legacy registration processing is archived and non-operational.

## Core Runtime
- Staff UI: `foundation/staff/*` (plain HTML/CSS/JS)
- Shared JS: `foundation/js/*`
- Supabase functions: `supabase/functions/*`
- Migrations: `supabase/migrations/*`

## Edge Functions (MVP)
- `registration-processor` (canonical intake path)
- `moodle-sync` (enrollment sync)
- `retry-worker` (manual + scheduled retry sweep)
- `sender-worker` / `notification-dispatcher` / `email-retry` / `reminder-processor`
- `teacher-portal-api`

## Audit Logging Canonicalization
- Canonical table: `public.audit_logs`
- New/updated functions write directly to `audit_logs` only.

## Retry Worker Scheduling
- Target cadence: every 20 minutes.
- Configured in `supabase/functions/retry-worker/config.toml`:
  - `verify_jwt = false`
  - `schedule = "*/20 * * * *"`
- Auto sweep retries only retryable Moodle sync failures and skips permanent/non-retryable auth/WAF/mapping errors.

## Legacy Archive Notes
- Historical Google Apps Script code is archived at `archive/apps-script-legacy/*`.
- Archive is reference-only and must not be used as a runtime backend.

## Docs
- `foundation/docs/ARCHITECTURE.md`
- `foundation/docs/CONSTRAINTS.md`
- `foundation/docs/KNOWNBUGS.md`
- `foundation/docs/NEXT_STEPS.md`

## ClickUp Escalation MVP
- Functions:
  - `clickup-sync` (creates ClickUp tasks for missed-class + escalations)
  - `missed-class-detector` (nightly missed-class + REVIEW>48h escalation detector)
- Mapping table: `public.clickup_admin_mappings`
  - Assignee resolution order: subgroup match first, then group-level mapping.
  - Only `active = true` rows are used.
  - No API keys are stored in this table.
- Idempotency table: `public.clickup_task_links`
  - Prevents duplicate ClickUp tasks for the same operational event.

### Required Supabase secrets
```bash
supabase secrets set CLICKUP_API_KEY="..."
supabase secrets set CLICKUP_LIST_ID="..."
supabase secrets set CLICKUP_DEFAULT_ASSIGNEE_ID="..."
```

### Assignee mapping management (no redeploy required)
- Add/update rows in `clickup_admin_mappings` from Supabase Table Editor.
- Example row fields:
  - `group_id` (required)
  - `subgroup_id` (optional, preferred over group fallback)
  - `clickup_user_id` (required)
  - `active` (set `true` to enable mapping)

### Scheduling
- `retry-worker`: every 20 minutes (`supabase/functions/retry-worker/config.toml`)
- `missed-class-detector`: nightly (`supabase/functions/missed-class-detector/config.toml`)



### ClickUp Watchers
- Primary assignee source of truth remains `clickup_admin_mappings`.
- Optional secondary watchers are resolved from `clickup_admin_watchers`.
- Watcher resolution: subgroup match first, group-level fallback only if no subgroup watcher mapping exists.
- Watchers are never promoted to assignee; they are added as watcher comments.
- Watcher comment failures are non-blocking and audited.

#### Assignment examples
- `CSGA`: Chloe is primary assignee; Jason is watcher/secondary follower.
- `CSGB`: Jason is primary assignee (configured in `clickup_admin_mappings`).

