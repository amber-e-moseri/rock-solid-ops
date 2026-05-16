# Moodle Connectivity Test Script

Standalone diagnostic for testing Foundation School's Moodle integration against a
Hostinger-hosted Moodle instance. Run these checks in order before assuming the edge
function is broken.

Last updated: May 2026

---

## Prerequisites

You need:
- `MOODLE_URL` — the base URL of your Moodle instance (e.g. `https://moodle.yourschool.com`)
- `MOODLE_TOKEN` — the web service token generated in Moodle for the Foundation integration user

These are the exact names used in the Supabase Edge Function:
```
Deno.env.get("MOODLE_URL")   → base URL, no trailing slash
Deno.env.get("MOODLE_TOKEN") → web service token
```

Set them via:
```
supabase secrets set MOODLE_URL=https://moodle.yourschool.com
supabase secrets set MOODLE_TOKEN=your_token_here
```

---

## Check 1 — Moodle REST API Reachability + Web Services Enabled

Tests that: the Moodle instance is reachable, the REST web service endpoint responds, and
your token is valid.

```bash
curl -s -X POST \
  "https://YOUR_MOODLE_URL/webservice/rest/server.php" \
  -d "wstoken=YOUR_MOODLE_TOKEN" \
  -d "wsfunction=core_webservice_get_site_info" \
  -d "moodlewsrestformat=json"
```

**Expected response (success):**
```json
{
  "sitename": "Foundation School",
  "siteurl": "https://moodle.yourschool.com",
  "username": "foundation_integration",
  "release": "4.x...",
  "functions": [
    { "name": "core_webservice_get_site_info", "version": "..." },
    ...
  ]
}
```

**Failure: Web services disabled**
```json
{ "error": "Web services must be enabled in Advanced features.", "errorcode": "enablewsdescription" }
```
Fix: Moodle admin → Site administration → Advanced features → Enable web services ✓

**Failure: Invalid token**
```json
{ "exception": "moodle_exception", "errorcode": "invalidtoken", "message": "Invalid token - token not found" }
```
Fix: Regenerate the token in Moodle → Site administration → Server → Web services → Manage tokens

**Failure: HTTP 403 with HTML body (no `exception` key)**
This is a WAF block. See `MOODLE_WAF_BLOCK` in KNOWNBUGS.md.

**Failure: Connection refused / timeout**
Moodle is down or the URL is wrong. Verify `MOODLE_URL` has no trailing slash and is
reachable from outside Hostinger's network.

---

## Check 2 — REST Protocol Enabled

Moodle requires the "REST protocol" to be enabled separately from web services.
Check 1 passing means this is already working, but if you get an empty response body or
a non-JSON 200, the REST protocol may be disabled.

```bash
curl -s -o /dev/null -w "%{http_code}" \
  "https://YOUR_MOODLE_URL/webservice/rest/server.php"
```

Expected: `200` (even without params, the endpoint should respond)

If you get `404`: the REST protocol plugin is not enabled.
Fix: Moodle admin → Site administration → Plugins → Web services → Manage protocols → REST → Enable

---

## Check 3 — core_user_get_users Capability

Tests that the integration token has permission to look up users by email.
The moodle-sync function calls this before creating or enrolling a user.

```bash
curl -s -X POST \
  "https://YOUR_MOODLE_URL/webservice/rest/server.php" \
  -d "wstoken=YOUR_MOODLE_TOKEN" \
  -d "wsfunction=core_user_get_users" \
  -d "moodlewsrestformat=json" \
  -d "criteria[0][key]=email" \
  -d "criteria[0][value]=test@example.com"
```

**Expected response (success — even if no matching user):**
```json
{ "users": [], "warnings": [] }
```

**Failure: Permission denied**
```json
{
  "exception": "webservice_access_exception",
  "errorcode": "accessexception",
  "message": "Access control exception"
}
```
Fix: Moodle admin → Site administration → Server → Web services → External services →
Foundation Integration service → Add functions → add `core_user_get_users`

---

## Check 4 — enrol_manual_enrol_users Capability

Tests that the integration token has permission to enroll users in courses.
This is the core enrollment call made by moodle-sync.

```bash
curl -s -X POST \
  "https://YOUR_MOODLE_URL/webservice/rest/server.php" \
  -d "wstoken=YOUR_MOODLE_TOKEN" \
  -d "wsfunction=enrol_manual_enrol_users" \
  -d "moodlewsrestformat=json" \
  -d "enrolments[0][roleid]=5" \
  -d "enrolments[0][userid]=99999999" \
  -d "enrolments[0][courseid]=99999999"
```

Note: use non-existent IDs (99999999) for a safe capability probe — a missing user/course
error confirms the function is reachable and permitted, just with bad test data.

**Expected response (confirms permission granted, bad test IDs):**
```json
{
  "exception": "moodle_exception",
  "errorcode": "wsusercannotassign",
  "message": "..."
}
```
OR (if IDs don't exist):
```json
null
```
Both indicate the function is accessible. A `null` response from enrol_manual_enrol_users
means success — enrollment functions return null on success, not an object.

**Failure: Permission denied**
```json
{
  "exception": "webservice_access_exception",
  "errorcode": "accessexception"
}
```
Fix: Moodle admin → External services → Foundation Integration → Add functions →
add `enrol_manual_enrol_users`

Also confirm "Manual enrolments" plugin is enabled:
Moodle admin → Site administration → Plugins → Enrolments → Manage enrol plugins →
Manual enrolments → Enable

---

## Check 5 — core_user_create_users Capability

Tests that the integration token can create Moodle accounts for new students.

```bash
curl -s -X POST \
  "https://YOUR_MOODLE_URL/webservice/rest/server.php" \
  -d "wstoken=YOUR_MOODLE_TOKEN" \
  -d "wsfunction=core_user_create_users" \
  -d "moodlewsrestformat=json" \
  -d "users[0][username]=probe_test_do_not_use" \
  -d "users[0][password]=TestProbe1!" \
  -d "users[0][firstname]=Probe" \
  -d "users[0][lastname]=Test" \
  -d "users[0][email]=probe_test_do_not_use@example.invalid"
```

WARNING: This will create a real Moodle user if the call succeeds. Delete it immediately
from Moodle admin → Site administration → Users → Browse list of users.

**Expected response (success):**
```json
[{ "id": 123, "username": "probe_test_do_not_use" }]
```

**Failure: Permission denied**
```json
{ "exception": "webservice_access_exception", "errorcode": "accessexception" }
```
Fix: Add `core_user_create_users` to Foundation Integration external service.

---

## SQL Diagnostic Query — Last 7 Days

Run this in the Supabase SQL editor to see a breakdown of sync outcomes:

```sql
SELECT
  sync_status,
  failure_reason,
  COUNT(*) AS count,
  MAX(updated_at) AS most_recent
FROM moodle_enrollment_sync
WHERE updated_at >= now() - interval '7 days'
GROUP BY sync_status, failure_reason
ORDER BY count DESC;
```

For detailed failed rows (canonical columns):

```sql
SELECT
  id,
  email,
  applicant_id,
  student_id,
  registration_id,
  moodle_course_id,
  sync_status,
  status,
  error_code,
  failure_reason,
  last_error,
  retry_count,
  sync_attempts,
  updated_at
FROM moodle_enrollment_sync
WHERE sync_status = 'FAILED'
  AND updated_at >= now() - interval '7 days'
ORDER BY updated_at DESC
LIMIT 50;
```

Retryability classification snapshot:

```sql
SELECT
  sync_status,
  COALESCE(failure_reason, 'UNCLASSIFIED') AS failure_reason,
  CASE
    WHEN failure_reason = 'MOODLE_WAF_BLOCK' THEN 'RETRYABLE'
    WHEN failure_reason IN ('MOODLE_REST_DISABLED', 'MOODLE_PERMISSION_DENIED', 'MOODLE_403_UNKNOWN') THEN 'NON_RETRYABLE'
    ELSE 'REVIEW'
  END AS retry_class,
  COUNT(*) AS row_count
FROM moodle_enrollment_sync
WHERE updated_at >= now() - interval '7 days'
GROUP BY sync_status, COALESCE(failure_reason, 'UNCLASSIFIED'), retry_class
ORDER BY row_count DESC;
```

Audit visibility quick check:

```sql
SELECT
  action,
  status,
  COUNT(*) AS row_count,
  MAX(logged_at) AS last_logged_at
FROM audit_logs
WHERE logged_at >= now() - interval '7 days'
GROUP BY action, status
ORDER BY last_logged_at DESC;
```

---

## Quick Reference — Supabase Secrets

| Secret name | What it is |
|---|---|
| `MOODLE_URL` | Base URL of Moodle (no trailing slash) |
| `MOODLE_TOKEN` | Web service token from Moodle |
| `SUPABASE_URL` | Auto-injected by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected by Supabase |

The `moodle-sync` edge function reads exactly these names. No other env var names are used.

To verify secrets are set:
```
supabase secrets list
```
