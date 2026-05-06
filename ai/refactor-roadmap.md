# Foundation School Refactor Roadmap

Date: 2026-05-06  
Owner: Platform Engineering

## 1. Current Platform State
- Supabase-only backend direction is established.
- Shared teacher shell exists and is active across teacher pages.
- Edge Function architecture is active for registration and teacher portal APIs.
- Registration outcomes and waitlist model are implemented (`ASSIGNED`, `WAITLISTED`, `DUPLICATE`, `REVIEW`).
- Notification queues and worker flow are present (`scheduled_notifications`, `email_queue`, workers).
- Remaining technical debt:
  - large inline HTML/CSS/JS pages
  - uneven design consolidation
  - partial module extraction
  - incomplete RLS hardening consistency

## 2. Major Risks
- Giant inline pages increase regression probability and onboarding cost.
- Inconsistent UI systems produce visual drift and duplicate fixes.
- RLS gaps can expose sensitive data by role/context mismatch.
- Duplicated components/helpers fragment behavior and increase defects.
- Mobile experiences are inconsistent across admin/teacher workflows.

## 3. Stabilization Phases

### Phase 1 — Shared Shells
- Complete and adopt `admin-shell.js` + `admin-shell.css`.
- Continue `teacher-shell.js` cleanup and role-aware nav controls.
- Remove duplicated page-level nav/topbar markup.
- Standardize breadcrumb + theme toggle + profile/dropdown behavior.

### Phase 2 — Shared Design System
- Extract and normalize cards/buttons/tables/chips/modals.
- Consolidate spacing/type/elevation tokens in shared CSS.
- Remove duplicated inline nav and utility styles from pages.
- Keep Batch Management visual direction as canonical.

### Phase 3 — Inline JS Extraction
- Move page utility blocks into `foundation/js/*` modules.
- Reduce giant inline scripts in staff pages.
- Consolidate API access through shared Supabase client + edge helpers.
- Keep workflow behavior stable during extraction.

### Phase 4 — Security Hardening
- Full RLS audit by table and role path.
- Enforce edge auth context for privileged workflow endpoints.
- Remove unsafe client-side assumptions about role and trust boundaries.
- Standardize environment variable injection and secret handling patterns.

### Phase 5 — Operational Expansion
- Notifications center maturation and delivery diagnostics.
- System health dashboards with actionable service checks.
- Retry center enhancements for queue and sync failures.
- Analytics dashboards and reporting rollups.

## 4. Design System Rules
- Batch Management is the canonical UI reference.
- Manrope-first typography, parchment/warm surfaces, purple/gold accents.
- Rounded cards, premium shadows, restrained motion, consistent spacing rhythm.
- Shared shell + shared components first; no page-specific design systems.

## 5. Engineering Principles
- Incremental migration only.
- Preserve workflows and business logic during refactors.
- Avoid giant rewrites.
- Stability over novelty.
- Shared infrastructure preferred over page-level custom logic.

## 6. Future AI Rules
- Read `/ai/*.md` before making architectural changes.
- Preserve architecture direction and migration phases.
- Preserve status enums and registration outcome semantics.
- Preserve Supabase-only direction.
- Preserve shared shell architecture and shared design system trajectory.
