# NEXT_STEPS

Operational next steps are maintained at:
- `foundation/docs/NEXT_STEPS.md`

Pilot-critical reminders:
- Keep only Supabase registration pipeline active.
- Keep archived legacy registration code out of operational runtime paths.
- Apply audit canonicalization migration and verify all new writes land in `audit_logs`.
- Confirm retry-worker schedule is active every 20 minutes.


