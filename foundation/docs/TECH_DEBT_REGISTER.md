# Tech Debt Register

Purpose: Track intentional debt and consolidation work so the platform does not regress into duplicated operational paths.
Scope: Internal operations platform, small-team maintainability horizon (5+ years).

## Debt Items

### 1) auth-client.js + auth-guards.js duplication
- Area: Frontend auth and role enforcement
- Current State: Overlapping auth/session and guard logic exists in multiple files.
- Risk Level: High
- Why this is debt: Duplicate policy logic drifts over time and causes inconsistent access behavior.
- Operational risk: Silent auth regressions, page-specific bypasses, harder incident diagnosis.
- Intended final state: Single canonical auth module with shared guard API used by all staff pages.
- Recommended Resolution: Consolidate into one module, remove duplicate paths after parity tests.
- Target Quarter: Q3 2026

### 2) Shared assignment pipeline duplication
- Area: Edge function business logic
- Current State: `registration-processor` and `phase2-processor` duplicate assignment flow logic.
- Risk Level: High
- Why this is debt: Any fix must be replicated; divergence can create inconsistent outcomes.
- Operational risk: Conflicting assignment behavior and harder rollback/recovery.
- Intended final state: One extracted assignment pipeline module used by both wrappers.
- Recommended Resolution: Extract canonical assign module under shared function utilities and migrate callers.
- Target Quarter: Q3 2026

### 3) Remaining fs-* migration pages
- Area: Frontend design system adoption
- Current State: `tokens.css`/`primitives.css` introduced, but not all pages fully migrated.
- Risk Level: Medium
- Why this is debt: Mixed UI systems increase maintenance and styling regressions.
- Operational risk: Inconsistent UX, slower bugfixing, accidental reintroduction of legacy classes.
- Intended final state: All staff pages use fs-* primitives with no parallel class systems.
- Recommended Resolution: Finish page migration and enforce checks for banned legacy patterns.
- Target Quarter: Q3 2026

### 4) sender-worker deprecation completion
- Area: Notification pipeline
- Current State: `sender-worker` still exists as legacy path while canonical queue pipeline is established.
- Risk Level: High
- Why this is debt: Parallel workers for overlapping scope can conflict on statuses and retries.
- Operational risk: Duplicate/incorrect state transitions and operator confusion.
- Intended final state: Only one canonical scheduled-notification-to-email_queue pipeline remains active.
- Recommended Resolution: Ensure legacy worker is unscheduled, documented as deprecated, then retire after validation.
- Target Quarter: Q3 2026

### 5) Schema fallback loops
- Area: Edge function data access
- Current State: Some functions still use try-multiple-table-name fallback patterns.
- Risk Level: Medium
- Why this is debt: Fallback loops mask schema drift instead of forcing canonicalization.
- Operational risk: Writes/reads may hit unexpected tables and hide migration defects.
- Intended final state: Canonical table names only in runtime code.
- Recommended Resolution: Complete schema cleanup, then remove fallback loops function-by-function.
- Target Quarter: Q4 2026

### 6) Per-page style blocks
- Area: Frontend styling
- Current State: Several pages still include substantial local style blocks.
- Risk Level: Medium
- Why this is debt: Local styling forks shared primitives and increases CSS entropy.
- Operational risk: Visual regressions and inconsistent mobile behavior.
- Intended final state: Shared primitives + minimal page overrides only when unavoidable.
- Recommended Resolution: Move repeated styles into `primitives.css`; reduce page-level CSS to layout-only exceptions.
- Target Quarter: Q4 2026

### 7) React teacher-availability sub-app
- Area: Frontend runtime/tooling
- Current State: Teacher availability runs as a separate React sub-application.
- Risk Level: Medium
- Why this is debt: Separate stack/build chain for a single operational surface.
- Operational risk: Build/deploy complexity and reduced contributor velocity.
- Intended final state: Same shared shell + fs-* stack as rest of staff operations UI.
- Recommended Resolution: Rewrite into vanilla JS module aligned to platform conventions.
- Target Quarter: Q4 2026

### 8) Operational trace view missing
- Area: Observability and support tooling
- Current State: No canonical per-applicant end-to-end trace screen.
- Risk Level: High
- Why this is debt: Operators cannot quickly follow lifecycle across async boundaries.
- Operational risk: Longer outages, slower triage, manual SQL dependence during incidents.
- Intended final state: Trace view showing chronological events across applicant, notifications, queue, audit, sync.
- Recommended Resolution: Add trace endpoint/query path and System Health trace UI.
- Target Quarter: Q3 2026

### 9) Legacy CSS primitive cleanup
- Area: Frontend design consistency
- Current State: Legacy primitives/classes remain alongside fs-* classes.
- Risk Level: Medium
- Why this is debt: Two primitive systems increase ambiguity and drift.
- Operational risk: Inconsistent rendering and duplicated maintenance.
- Intended final state: fs-* primitives are exclusive canonical primitives.
- Recommended Resolution: Remove or quarantine legacy primitive classes after migration completion.
- Target Quarter: Q4 2026

### 10) Audit table canonicalization
- Area: Database/audit consistency
- Current State: Historical compatibility paths may still target multiple audit table names in some areas.
- Risk Level: Medium
- Why this is debt: Audit writes should be deterministic and canonical.
- Operational risk: Missing/incomplete audit trails and unreliable compliance checks.
- Intended final state: All active writes go to canonical `audit_logs` table.
- Recommended Resolution: Validate all active edge functions and remove legacy fallbacks post-verification.
- Target Quarter: Q3 2026

### 11) Misleading notification function naming
- Area: Notification pipeline / operational clarity
- Current State: `scheduled-notification-sender` sounds like the canonical batch processor
  but is actually a single-item Retry Center helper. The real batch processor is
  `reminder-processor`. `sender-worker` is a deprecated reconciliation worker.
- Risk Level: High
- Why this is debt: Any operator or engineer reading the function names will assume the
  wrong pipeline topology. The name mismatch risks accidental scheduling, incorrect retry
  wiring, and duplicate-processor incidents.
- Operational risk: Running `scheduled-notification-sender` as a batch processor would
  reset in-flight notifications to PENDING, causing duplicate sends. Running `sender-worker`
  alongside `reminder-processor` marks notifications FAILED before they are queued.
- Intended final state: Function names unambiguously reflect their role.
  Proposal: rename `reminder-processor` → `notification-batch-processor`,
  `scheduled-notification-sender` → `notification-retry-helper` (or inline into retry-worker).
- Recommended Resolution: Document current topology clearly (see NOTIFICATION_PIPELINE.md),
  then plan renames as a coordinated change with no runtime behavior impact.
- Target Quarter: Q3 2026
