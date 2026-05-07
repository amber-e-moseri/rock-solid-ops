# Apps Script Legacy Archive

This directory contains historical Google Apps Script code that is no longer authoritative for runtime operations.

## Why Archived
- Foundation School production runtime is Supabase-first.
- Keeping this code in active app directories created ambiguity about source of truth.
- The archive preserves history without allowing accidental reuse in live paths.

## What Replaced It
- Registration processing: `supabase/functions/registration-processor`
- Teacher/admin operations: `foundation/staff/*` + Supabase tables/RLS
- Notifications/retries: Supabase Edge Functions (`sender-worker`, `notification-dispatcher`, `email-retry`, `retry-worker`)
- Scheduling/attendance/milestones: Supabase-backed frontend + Edge Functions

## Migration Timeline
- Supabase migration became canonical: May 2026
- Legacy registration processing disabled: May 2026
- Legacy Apps Script code moved to this archive: May 7, 2026

## Usage Rules
- Do not import, execute, or deploy files from this directory for current operations.
- Do not add new business logic here.
- Treat this folder as historical reference only.

