# Next Steps

## Cutover Enforcement
- Keep archived legacy registration code out of runtime traffic paths.

## Audit Operations
- Apply migration `202605071800_audit_logs_canonicalization.sql`.
- Confirm all active edge functions write to `public.audit_logs`.

## Retry Operations
- Confirm `retry-worker` auto sweep is operating and skipping non-retryable Moodle auth/WAF/mapping failures.
- Keep manual retry controls in Retry Center for targeted operator intervention.

## Pilot Launch Validation
1. Registration creates records once (no duplicate pipeline).
2. Audit entries continue writing under `audit_logs`.
3. Historical audit rows remain accessible (including legacy pathway).
4. Moodle sync retry flow is automatic and bounded.
5. Retry Center, System Health, and Notification Center remain functional.

## Remaining Operational Debt
- Keep legacy archive read-only and continue Supabase-first hardening.
- Continue mobile density/readability refinements on operational pages where required.
- Keep RLS and role-policy reviews aligned with any new operational tables.

## Current Platform State — May 2026
- RLS hardening baseline completed (continue incremental policy audits as new flows ship).
- CORS cleanup baseline completed.
- Attendance dedupe baseline completed.
- fs-* design system introduced (`tokens.css` + `primitives.css`).
- `teacher-portal-api` router refactor completed.
- Moodle 403 classification completed (WAF vs permissions vs REST-disabled paths).
- Shared `supabase/functions/_shared/` utilities introduced.
- `sender-worker` deprecation tracked; verify function artifact state in each environment before release.
- Operational visibility improved across retry/error surfaces.

## Current Highest Priority Consolidation Tasks
- Shared assignment pipeline extraction (`registration-processor` + `phase2-processor`).
- Auth module consolidation (`auth-client.js` + `auth-guards.js`).
- fs-* migration completion across remaining staff pages.
- Schema canonicalization (remove fallback table-name loops).
- Operational trace view (per-applicant lifecycle view).

## Do Not Reintroduce
- Duplicate workers for the same notification pipeline.
- Duplicate auth paths for the same user/session checks.
- Legacy CSS primitives when fs-* alternatives exist.
- Try-multiple-table-name fallbacks in active edge code.
- Inline config guards repeated per page.
- Page-specific design systems outside `tokens.css`/`primitives.css`.

## Completed
- 2026-05-13: Keep Supabase `registration-processor` as canonical and only active registration processor. `phase2-processor` registration path is hard-disabled with a 410 guard.
- 2026-05-13: Treat dual endpoint configuration as a release blocker. Legacy `APPS_SCRIPT_URL` was removed from `registration-form.html`.
- 2026-05-13: Ensure scheduled invocation of `retry-worker` every 20 minutes is active in deployed project. Confirmed active in `supabase/functions/retry-worker/config.toml` (no change required).
- 2026-05-13: `sender-worker` must remain unscheduled. Confirmed no cron entry exists (no change required).
- 2026-05-14: `sender-worker` deprecation intent recorded. Follow-up required: verify runtime function file/state and update this note to match the current repository/deployed artifact.



