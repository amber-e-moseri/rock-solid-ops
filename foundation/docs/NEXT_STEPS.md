# Next Steps

## Cutover Enforcement
- Keep Supabase `registration-processor` as canonical and only active registration processor.
- Keep archived legacy registration code out of runtime traffic paths.
- Treat dual endpoint configuration as a release blocker.

## Audit Operations
- Apply migration `202605071800_audit_logs_canonicalization.sql`.
- Confirm all active edge functions write to `public.audit_logs`.

## Retry Operations
- Ensure scheduled invocation of `retry-worker` every 20 minutes is active in deployed project.
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



