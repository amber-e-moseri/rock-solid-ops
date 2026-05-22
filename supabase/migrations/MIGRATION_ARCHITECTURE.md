# Migration Architecture (Canonical)

## Scope
This document defines the canonical SQL authority and ordering for:
- schema evolution
- RLS policies
- helper SQL functions
- views
- seed data

## Canonical Source of Truth
- **Authoritative runtime SQL**: `supabase/migrations/*.sql`
- **Non-authoritative / historical / generated artifacts**: `foundation/sql/*`

`foundation/sql/*` must not be used for deployment, migration replay, or policy validation.

## Deterministic Migration Order
Apply migrations in strict lexical filename order:
1. `000_baseline_squash.sql`
2. `2026*.sql` (timestamp-prefixed)

Current ordering is deterministic because all migration filenames are zero-padded and lexically sortable.

## Baseline Squash (2026-05-18)
- `000_baseline_squash.sql` replaces the historical baseline migrations:
  - `001_initial_schema.sql`
  - `002_seed_data.sql`
  - `003_rls_policies.sql`
  - `004_batch_management.sql`
  - `005_add_applicants_availability.sql`
  - `006_notification_system.sql`
- Original files are preserved (not deleted) under:
  - `supabase/migrations/archive/pre-baseline/`
- Safety rule: never apply `000_baseline_squash.sql` to an existing database that already ran the original baseline migrations.

## Cleanup Pass (2026-05-22)
- Pre-baseline historical migrations (`001`-`006`) remain archived under:
  - `supabase/migrations/archive/pre-baseline/`
- `000_baseline_squash.sql` remains active for fresh installs only.
- Duplicate timestamp prefixes were resolved to keep lexical order deterministic:
  - `202605180001_regional_secretary_role.sql` -> `202605180006_regional_secretary_role.sql`
  - `202605190960_fellowship_map_nullable_group.sql` -> `202605190961_fellowship_map_nullable_group.sql`
- Verified no migration contains self-referencing
  `INSERT INTO supabase_migrations...` statements.

## Canonical Ownership by Concern
- **Base schema + seed + baseline RLS + early batch/notification setup**: `000_baseline_squash.sql`
- **Feature migrations**: `004+` and timestamped files
- **Current RBAC/RLS hardening baseline**:
  - `202605061400_rls_hardening.sql`
  - `202605071940_profiles_role_pending_hardening.sql`
  - `202605071950_rbac_admin_function_consolidation.sql`
  - `202605071955_fix_attendance_admin_policy.sql`
- **Canonical audit table migration track**:
  - `202605071800_audit_logs_canonicalization.sql`
  - `202605071930_audit_logs_only.sql` (later, additive canonicalization pass)

## Known Duplicate / Overlap Hotspots
- Helper functions redefined multiple times (expected but must converge):
  - `public.current_profile_role()` (3 definitions)
  - `public.is_admin()` (3 definitions)
  - `public.is_admin_like()` (legacy -> removed in later migrations)
  - `public.handle_new_auth_user_profile()` (default role changed to `pending`)
- Policy names re-used/replaced across hardening migrations (expected if dropping/recreating).
- Audit canonicalization appears in two migrations (071800, 071930); later file should remain final.

## Cleanup Rules
1. New helper function logic must be introduced in one migration, and all subsequent changes must be explicit `create or replace function` updates.
2. Policy changes must always:
   - `drop policy if exists ...`
   - `create policy ...`
   - avoid silent drift.
3. Views should be created/replaced only in migrations (not in `foundation/sql` exports).
4. `foundation/sql` must be treated as archive/export only; never deploy from it.
5. Keep seeds isolated to seed-specific migrations.

## Recommended Repository Structure
- `supabase/migrations/`:
  - schema + policy + helper + view + seed migrations only
- `archive/sql-exports/` (recommended target):
  - moved `foundation/sql/*` historical exports

## Verification Checklist
- No deploy tooling points to `foundation/sql/*`
- `supabase migration list` order matches lexical order
- Function definitions converge on latest migration state
- No RLS policy references dropped helper functions
- Views are defined in migrations only
