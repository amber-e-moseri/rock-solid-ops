# CSS Migration Guide

Canonical reference for migrating legacy staff/admin pages to the fs-* design system.

Use this document when adding or updating pages in:
- `foundation/staff/*.html`
- `foundation/js/*.js` (HTML string templates)

---

## Required Base Imports

In page `<head>`, include:

```html
<link rel="stylesheet" href="../ui/premium-theme.css" />
<link rel="stylesheet" href="../ui/admin-shell.css" />
<link rel="stylesheet" href="../ui/primitives.css" />
```

`tokens.css` is imported by `primitives.css`; do not import `tokens.css` directly in pages.

---

## Legacy Class -> fs-* Equivalent

### Shell/Layout

- `shell` -> `fs-shell`
- `main` / page content wrapper -> `fs-content`
- custom topbar/header wrapper -> `fs-topbar`
- left header cluster -> `fs-topbar-left`
- right header cluster -> `fs-topbar-right`

### Cards and Metrics

- `summary-card` -> `fs-metric` or `fs-card` (use `fs-metric` for KPI cards)
- `stats`, `kpi-grid`, `ops-summary-grid` -> `fs-metric-grid`
- generic panel card -> `fs-card` (or `fs-card-sm` for compact)

### Filters/Actions

- `filters`, `filter-row`, `toolbar`, `ops-filters` -> `fs-action-bar`
- search input block -> `fs-action-bar-search`
- filter control cluster -> `fs-action-bar-filters`
- action button cluster -> `fs-action-bar-actions`

### Tables

- `table-wrap` -> `fs-table-wrap`
- plain `table` -> `fs-table`

### Buttons

- `btn` -> `fs-btn fs-btn-secondary` (default neutral button)
- `btn primary` / `btn-primary` -> `fs-btn fs-btn-primary`
- `btn danger` / `btn-danger` -> `fs-btn fs-btn-danger`
- `btn-sm` / compact button -> add `fs-btn-sm`

### Status Pills/Badges

- `chip` -> `fs-badge` (+ variant below)
- `badge` -> `fs-badge` (+ variant below)
- success status -> `fs-badge fs-badge-success`
- warning/pending status -> `fs-badge fs-badge-warning`
- error/failure status -> `fs-badge fs-badge-danger`
- info status -> `fs-badge fs-badge-info`
- neutral/default -> `fs-badge fs-badge-neutral`

---

## Legacy CSS Variable -> Token Equivalent

Do not introduce legacy variables in new pages. Use token roles from `tokens.css`.

- `var(--muted)` -> `var(--color-text-muted)`
- `var(--surface)` -> `var(--color-surface)`
- `var(--text)` -> `var(--color-text-primary)`
- `var(--border)` -> `var(--color-border)`
- `var(--bg)` -> `var(--color-bg)`
- `var(--navy)` (primary action color) -> `var(--color-primary)`
- `var(--success)` -> `var(--color-success-fg)` or `var(--color-success)`
- `var(--danger)` -> `var(--color-danger-fg)` or `var(--color-danger)`
- `var(--warn)` -> `var(--color-warning-fg)` or `var(--color-warning)`
- `var(--info)` -> `var(--color-info-fg)` or `var(--color-info)`

When in doubt:
- Text color roles: `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`
- Surface roles: `--color-surface`, `--color-surface-raised`
- Semantic state colors: success/warning/danger/info token groups

---

## JS Template Rules

When rendering HTML from JS (`innerHTML`, template strings):

- Do not emit legacy classes like `chip`, `summary-card`, or bare `btn`.
- Emit fs-* classes directly in templates.
- Keep behavior hooks (`id`, `data-*`, `js-*`) unchanged.

Example:

```html
<button class="fs-btn fs-btn-primary fs-btn-sm js-retry">Retry</button>
<span class="fs-badge fs-badge-warning">PENDING</span>
```

---

## Pre-commit Guardrails

Pre-commit blocks staged `foundation/staff/*.html` and `foundation/js/*.js` files containing:

- `var(--muted)`
- `var(--surface)`
- `class="chip`
- `class="summary-card`
- `class="btn "` (legacy bare button class)

If blocked, replace with fs-* classes and token variables before committing.

---

## Practical Migration Sequence

1. Add `primitives.css` link.
2. Migrate shell/layout classes.
3. Migrate metric cards and action bars.
4. Migrate tables, buttons, badges.
5. Update JS-rendered template classes.
6. Verify no banned patterns remain in staged diff.
