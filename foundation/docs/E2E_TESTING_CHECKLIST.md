# End-to-End Testing Checklist

Internal operational checklist for validating the current Foundation School platform end-to-end.

Use this checklist in staging first, then production during controlled windows.
Do not run destructive resets in production unless explicitly approved.

---

## Global Preconditions

- Latest required migrations are applied, including:
  - `202605121700_notification_trace_id.sql`
  - `202605121900_moodle_enrollment_sync_trace_id.sql`
- Canonical notification pipeline is active:
  - `scheduled_notifications` -> `notification-batch-processor` -> `email_queue` -> `email-sender`
- `sender-worker` remains unscheduled (deprecated).
- Test accounts are available:
  - Admin user
  - Teacher user with valid mapping (`LINKED`)
  - One intentionally unmapped teacher user (`UNLINKED`) for failure checks
- Known class mapping setup exists:
  - One class with valid Moodle course mapping
  - One class without Moodle course mapping (for failure test)

---

## 1) New Registration Intake

**Purpose**
- Verify new registration creates canonical applicant and baseline workflow state.

**Steps**
1. Submit a registration with a brand-new email.
2. Capture response payload and `applicant_id`.

**Expected database rows**
- `applicants`: 1 new row with:
  - `registration_status` in expected state (`ASSIGNED` or `WAITLISTED` or `REVIEW` based on data)
  - `availability_status` populated
  - `source = registration_processor`
- `audit_logs`: `REGISTRATION_RECEIVED` with details containing `trace_id`.

**Expected UI behavior**
- Registration success confirmation shown to user.
- No duplicate warning for first submission.

**Failure signs**
- 4xx/5xx response for valid input.
- Applicant row missing after successful API response.
- Missing `REGISTRATION_RECEIVED` audit row.

**Rollback/reset notes**
- Delete test applicant by `email`/`id`.
- Delete related audit rows by `entity_id`.

---

## 2) Duplicate Registration

**Purpose**
- Confirm duplicate detection path and non-blocking behavior.

**Steps**
1. Re-submit registration using same email as test 1.
2. Capture returned status fields.

**Expected database rows**
- New `applicants` row created (not blocked) with:
  - `registration_status = DUPLICATE`
  - `needs_admin_review = true` if column exists
- `audit_logs`: `REGISTRATION_DUPLICATE`.

**Expected UI behavior**
- Registration accepted with duplicate handling messaging (not hard failure).

**Failure signs**
- Duplicate submission blocked without row creation.
- Duplicate row created without duplicate status.

**Rollback/reset notes**
- Remove newest duplicate applicant row only, keep original if needed for chain tests.

---

## 3) Assignment to Class

**Purpose**
- Validate assignment classification and status transitions.

**Steps**
1. Submit registration with assignable class option/capacity.
2. Confirm returned status.

**Expected database rows**
- `applicants.registration_status = ASSIGNED`
- `applicants.availability_status = CLASS_ASSIGNED`
- `assigned_at` populated.
- `audit_logs`: `REGISTRATION_ASSIGNED`.

**Expected UI behavior**
- Success path indicates class assignment.

**Failure signs**
- Assigned candidate lands in `REVIEW` or `WAITLISTED` unexpectedly.

**Rollback/reset notes**
- Remove test applicant and any downstream rows (notification/moodle/email) by `trace_id`.

---

## 4) Student/Class Record Creation

**Purpose**
- Validate phase2 enrollment path writes `students` and `class_roster`.

**Steps**
1. Trigger `phase2-processor` for an eligible applicant (webhook or controlled trigger path).
2. Capture generated `student_id`.

**Expected database rows**
- `students`: new row with correct `student_id`, email, group/subgroup, class linkage.
- `class_roster`: row linked to `student_id` and `class_option_id`.
- `sync_log`: `PHASE2_SUCCESS` with `trace_id`.

**Expected UI behavior**
- Student appears in admin-facing student/class views.

**Failure signs**
- Applicant approved but no `students`/`class_roster` rows.
- `PHASE2_ERROR` appears in `sync_log`.

**Rollback/reset notes**
- Delete `class_roster` by `student_id`, then `students`, then optionally revert applicant fields.

---

## 5) Moodle Queue Creation

**Purpose**
- Ensure assigned registrations enqueue Moodle sync safely.

**Steps**
1. Complete an `ASSIGNED` registration flow.
2. Check moodle sync queue row creation.

**Expected database rows**
- `moodle_enrollment_sync`: upserted row with:
  - `sync_status = PENDING` (or quickly transitions if worker runs)
  - `registration_status = ASSIGNED`
  - `trace_id` populated when migration exists (or payload fallback present).

**Expected UI behavior**
- Retry/System Health surfaces Moodle row for troubleshooting when failed/retrying.

**Failure signs**
- No `moodle_enrollment_sync` row for assigned applicant.
- Hard failure when `trace_id` column absent.

**Rollback/reset notes**
- Delete `moodle_enrollment_sync` test row by `registration_id`/`dedupe_key`.

---

## 6) Moodle Success

**Purpose**
- Validate successful Moodle user lookup/create and enrollment.

**Steps**
1. Ensure Moodle credentials and course mapping are valid.
2. Trigger `moodle-sync` on a queued row.

**Expected database rows**
- `moodle_enrollment_sync` row updated:
  - `sync_status = SYNCED`
  - `moodle_user_id` populated
  - `error_code`, `last_error` cleared
- `audit_logs`: `MOODLE_SYNC_SUCCESS` with trace details when available.

**Expected UI behavior**
- Retry Center row disappears from failed/retrying view or shows non-failed state.

**Failure signs**
- Row remains `PENDING/RETRYING` without reason.
- Success but `moodle_user_id` missing.

**Rollback/reset notes**
- If needed, set row back to pre-test status manually in staging only.

---

## 7) Moodle 403/WAF Failure

**Purpose**
- Confirm 403 classification and retryability behavior.

**Steps**
1. Trigger Moodle sync against environment that returns 403 WAF-style response.
2. Observe failure classification.

**Expected database rows**
- `moodle_enrollment_sync`:
  - `error_code` set to one of:
    - `MOODLE_WAF_BLOCK` (retryable)
    - `MOODLE_REST_DISABLED` (non-retryable)
    - `MOODLE_PERMISSION_DENIED` (non-retryable)
    - `MOODLE_403_UNKNOWN` (non-retryable conservative)
  - `failure_reason` populated when applicable
- `audit_logs`: `MOODLE_SYNC_FAILED` with code/retry context.

**Expected UI behavior**
- Retry Center shows classified cause and supports retry only where operationally valid.

**Failure signs**
- Generic failure without classification.
- Incorrect retryability handling for REST-disabled/permission failures.

**Rollback/reset notes**
- Resolve by fixing external config, then retry row from Retry Center.

---

## 8) Missing Course Mapping Failure

**Purpose**
- Validate non-configuration course mapping gap fails clearly.

**Steps**
1. Use assigned row lacking `batch_moodle_courses` mapping.
2. Trigger `moodle-sync`.

**Expected database rows**
- `moodle_enrollment_sync` failed/retrying with `last_error` indicating mapping missing.
- `audit_logs`: failure entry present.

**Expected UI behavior**
- Retry Center clearly shows mapping-related error.

**Failure signs**
- Silent failure or ambiguous generic error.

**Rollback/reset notes**
- Add missing mapping, then retry from Retry Center.

---

## 9) Scheduled Notification Creation

**Purpose**
- Confirm notification scheduling rows are created for applicable flows.

**Steps**
1. Trigger a flow that creates scheduled notifications (for example Moodle sync requested event).
2. Capture `trace_id` and `dedupe_key`.

**Expected database rows**
- `scheduled_notifications` row with:
  - `status = PENDING` initially
  - `trace_id` present when migration exists
  - expected `template_key` and payload fields.

**Expected UI behavior**
- Row appears in ops surfaces where scheduled notification state is visible.

**Failure signs**
- No row for event that should schedule one.
- Duplicate rows for same dedupe key.

**Rollback/reset notes**
- Delete by `dedupe_key`/`trace_id` in staging.

---

## 10) Email Queue Creation

**Purpose**
- Validate queue row creation from both direct registration and notification-batch-processor path.

**Steps**
1. Trigger direct registration email queue insert.
2. Trigger `notification-batch-processor` for due scheduled notification.

**Expected database rows**
- `email_queue` rows created with `status = Pending`.
- `trace_id` copied when available; fallback still works if trace columns missing.

**Expected UI behavior**
- Notification/health dashboards reflect queue growth.

**Failure signs**
- Queue insert fails on missing `trace_id` column.
- Scheduled notification marked `SENT` but no queue row created.

**Rollback/reset notes**
- Delete test queue rows by `recipient_email` + `created_at` window.

---

## 11) Email Delivery

**Purpose**
- Validate `email-sender` delivery and status transitions.

**Steps**
1. Ensure `RESEND_API_KEY` valid.
2. Trigger `email-sender`.

**Expected database rows**
- `email_queue` transitions:
  - `Pending` -> `Sent` with `sent_at`, or
  - `Pending` -> `Failed` with `error_message`.
- `sync_log`: `EMAIL_SENDER_RUN` summary (or `EMAIL_SENDER_ERROR`).

**Expected UI behavior**
- Delivery outcome visible in operational views.

**Failure signs**
- Rows remain `Pending` after sender run with no log evidence.

**Rollback/reset notes**
- Reset failed test rows to `Pending` only in staging if retesting.

---

## 12) Retry Center Retry

**Purpose**
- Confirm manual retry and resolve actions function correctly.

**Steps**
1. Open Failed Sync Retry Center as admin role.
2. Retry one failed email row and one failed Moodle row.
3. Resolve one failed row.

**Expected database rows**
- `email_queue`: status reset to `Pending` on retry.
- `moodle_enrollment_sync`: status reset to `RETRYING` on retry request.
- `audit_logs`: retry/resolve actions logged (worker + UI audit).

**Expected UI behavior**
- Buttons operate; status refresh reflects changes.
- Trace ID copy button works when trace present.

**Failure signs**
- Retry action accepted but row state unchanged.
- Non-admin can execute actions.

**Rollback/reset notes**
- Revert statuses only for test rows if they interfere with normal queue processing.

---

## 13) Operational Trace Lookup

**Purpose**
- Validate end-to-end trace debugging path.

**Steps**
1. Open System Health operational trace panel as admin.
2. Query by:
  - applicant email
  - applicant ID
  - student ID
  - registration ID
3. Confirm timeline order and details rendering.

**Expected database rows**
- RPC `get_operational_trace(...)` returns normalized events across:
  - `applicants`, `students`, `class_roster`, `moodle_enrollment_sync`,
  - `scheduled_notifications`, `email_queue`, `audit_logs`, `sync_log`,
  - `error_submissions` best-effort.

**Expected UI behavior**
- Chronological timeline appears.
- Empty state is graceful when no matches.
- Non-admin sees no trace panel.

**Failure signs**
- RPC hard-fails when one source table has no rows.
- Panel visible to unauthorized users.

**Rollback/reset notes**
- None (read-only feature).

---

## 14) Teacher Login

**Purpose**
- Verify teacher portal auth and mapping enforcement.

**Steps**
1. Login as linked teacher user.
2. Login as intentionally unlinked teacher user.

**Expected database rows**
- No new operational rows required for successful login.
- For unmapped user, logs/errors may reference `INVALID_TEACHER_MAPPING`.

**Expected UI behavior**
- Linked user reaches teacher portal.
- Unlinked user blocked with clear remediation path.

**Failure signs**
- Linked user denied unexpectedly.
- Unlinked user gains full access.

**Rollback/reset notes**
- Restore mapping state used for test (`link_teacher_to_auth_user`) after completion.

---

## 15) Teacher Attendance Submission

**Purpose**
- Confirm attendance write path and teacher ownership validation.

**Steps**
1. As linked teacher, submit attendance for assigned class/session.
2. Refresh and verify persisted values.

**Expected database rows**
- Attendance rows created/updated in canonical attendance tables.
- Audit entries present if current flow emits audit for attendance actions.

**Expected UI behavior**
- Success indicator appears.
- Submitted values are reflected on reload.

**Failure signs**
- Submission reports success but data not persisted.
- Teacher can submit for non-owned class.

**Rollback/reset notes**
- Remove/revert only test attendance records for tested date/session.

---

## 16) Duplicate Attendance Prevention

**Purpose**
- Validate attendance dedupe hardening.

**Steps**
1. Submit attendance for same student/session twice.
2. Observe second submission behavior.

**Expected database rows**
- No duplicate logical attendance row for same unique key.
- Existing row updated or second write safely rejected per current implementation.

**Expected UI behavior**
- User sees safe duplicate-handling response (not silent data corruption).

**Failure signs**
- Multiple duplicate rows for same student/session.

**Rollback/reset notes**
- Keep one canonical row; remove duplicate test artifacts if created.

---

## 17) Admin Review Dashboard

**Purpose**
- Ensure review-oriented registration statuses are visible and actionable.

**Steps**
1. Create/identify rows with `REVIEW`, `DUPLICATE`, `WAITLISTED`.
2. Open admin dashboard/review surfaces and apply filters.

**Expected database rows**
- Status fields remain canonical:
  - `PENDING`, `ASSIGNED`, `WAITLISTED`, `DUPLICATE`, `REVIEW`, `INACTIVE`, `COMPLETED`.

**Expected UI behavior**
- Counts and filter results match DB state.
- No broken cards/tables in fs-* migrated pages.

**Failure signs**
- Status counts mismatch query results.
- Review actions target wrong applicant.

**Rollback/reset notes**
- Revert any manual admin status edits done purely for testing.

---

## 18) System Health Page

**Purpose**
- Validate core operational diagnostics page integrity.

**Steps**
1. Open System Health as admin.
2. Verify panels load (including operational trace panel).
3. Confirm warning/empty states render cleanly.

**Expected database rows**
- Read-only checks only; no required writes.

**Expected UI behavior**
- Admin-only diagnostics visible.
- No JS runtime errors blocking core sections.
- Tolerant degradation where optional data missing.

**Failure signs**
- Blank or partially broken page due to one failed query.
- Raw stack traces shown to operators.

**Rollback/reset notes**
- None (read-only checks).

---

## Suggested SQL Verification Snippets

```sql
-- Applicant + status + trace visibility
select id, email, registration_status, availability_status, created_at
from applicants
where email = '<test-email>'
order by created_at desc;

-- Trace-linked notifications/emails/moodle
select id, trace_id, template_key, status, scheduled_for, created_at
from scheduled_notifications
where trace_id = '<trace-id>'
order by created_at asc;

select id, trace_id, recipient_email, template_key, status, sent_at, error_message, created_at
from email_queue
where trace_id = '<trace-id>'
order by created_at asc;

select id, trace_id, sync_status, error_code, failure_reason, last_error, updated_at
from moodle_enrollment_sync
where trace_id = '<trace-id>'
order by updated_at asc;

-- Audit and sync logs for a test flow
select logged_at, action, entity_type, entity_id, status, details
from audit_logs
where details->>'trace_id' = '<trace-id>'
order by logged_at asc;

select created_at, phase, message, details, run_by
from sync_log
where details->>'trace_id' = '<trace-id>'
order by created_at asc;
```

---

## Execution Notes

- Record test run metadata: date/time, environment, tester, commit SHA, migration set.
- Mark each test case PASS/WARN/FAIL in your run log.
- Any FAIL in tests 1-13 should block release until resolved.

