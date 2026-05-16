-- FOUNDATION SCHOOL SUPABASE SCHEMA
-- Start small: batches, moodle_courses, audit_logs, failed_syncs

create extension if not exists "pgcrypto";

-- 1. BATCHES
create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  batch_code text unique not null,
  batch_name text not null,
  start_sunday date not null,
  status text not null default 'DRAFT',
  registration_open boolean not null default false,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

-- 2. MOODLE COURSE MAPPINGS
create table if not exists public.moodle_courses (
  id uuid primary key default gen_random_uuid(),
  subgroup_id text not null,
  course_id text not null,
  course_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint moodle_courses_subgroup_unique unique (subgroup_id)
);

-- 3. AUDIT LOGS
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text not null,
  entity_type text,
  entity_id text,
  status text not null default 'SUCCESS',
  details jsonb,
  created_at timestamptz not null default now()
);

-- 4. FAILED SYNCS
create table if not exists public.failed_syncs (
  id uuid primary key default gen_random_uuid(),
  sync_type text not null,
  source_table text,
  source_id text,
  payload jsonb,
  error_message text,
  status text not null default 'FAILED',
  retry_count int not null default 0,
  last_retry_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- BASIC INDEXES
create index if not exists idx_batches_status on public.batches(status);
create index if not exists idx_batches_start_sunday on public.batches(start_sunday);

create index if not exists idx_audit_logs_action on public.audit_logs(action);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);

create index if not exists idx_failed_syncs_status on public.failed_syncs(status);
create index if not exists idx_failed_syncs_sync_type on public.failed_syncs(sync_type);
create index if not exists idx_failed_syncs_created_at on public.failed_syncs(created_at desc);