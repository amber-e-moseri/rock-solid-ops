begin;

create extension if not exists pgcrypto;

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  applicant_id uuid null,
  email text null,
  fellowship_code text null,
  class_option_id text null,
  batch_id text null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  template_key text not null,
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scheduled_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid null references public.notification_events(id) on delete set null,
  applicant_id uuid null,
  recipient_email text not null,
  event_type text not null,
  template_key text not null,
  scheduled_for timestamptz not null default now(),
  status text not null default 'PENDING',
  attempts integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text null,
  sent_at timestamptz null,
  last_error text null,
  error_message text null,
  max_attempts integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.applicant_notification_state (
  applicant_id uuid primary key,
  notification_state text not null default 'PENDING_SELECTION',
  counters jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  last_event_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_templates (
  template_key text primary key,
  subject text not null,
  body_html text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists scheduled_notifications_dedupe_key_uq
  on public.scheduled_notifications(dedupe_key)
  where dedupe_key is not null;

create index if not exists notification_events_event_type_idx
  on public.notification_events(event_type);

create index if not exists notification_events_applicant_id_idx
  on public.notification_events(applicant_id);

create index if not exists scheduled_notifications_status_idx
  on public.scheduled_notifications(status);

create index if not exists scheduled_notifications_scheduled_for_idx
  on public.scheduled_notifications(scheduled_for);

create index if not exists scheduled_notifications_recipient_email_idx
  on public.scheduled_notifications(recipient_email);

create index if not exists scheduled_notifications_event_type_idx
  on public.scheduled_notifications(event_type);

create index if not exists scheduled_notifications_applicant_id_idx
  on public.scheduled_notifications(applicant_id);

create index if not exists notification_rules_event_type_idx
  on public.notification_rules(event_type);

create index if not exists applicant_notification_state_state_idx
  on public.applicant_notification_state(notification_state);

create or replace function public.set_notification_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_notification_rules_updated_at on public.notification_rules;
create trigger trg_notification_rules_updated_at
before update on public.notification_rules
for each row execute function public.set_notification_updated_at();

drop trigger if exists trg_scheduled_notifications_updated_at on public.scheduled_notifications;
create trigger trg_scheduled_notifications_updated_at
before update on public.scheduled_notifications
for each row execute function public.set_notification_updated_at();

drop trigger if exists trg_applicant_notification_state_updated_at on public.applicant_notification_state;
create trigger trg_applicant_notification_state_updated_at
before update on public.applicant_notification_state
for each row execute function public.set_notification_updated_at();

drop trigger if exists trg_notification_templates_updated_at on public.notification_templates;
create trigger trg_notification_templates_updated_at
before update on public.notification_templates
for each row execute function public.set_notification_updated_at();

alter table public.notification_events enable row level security;
alter table public.notification_rules enable row level security;
alter table public.scheduled_notifications enable row level security;
alter table public.applicant_notification_state enable row level security;
alter table public.notification_templates enable row level security;

drop policy if exists "notification_events_authenticated_select" on public.notification_events;
create policy "notification_events_authenticated_select"
on public.notification_events
for select
to authenticated
using (true);

drop policy if exists "notification_rules_authenticated_select" on public.notification_rules;
create policy "notification_rules_authenticated_select"
on public.notification_rules
for select
to authenticated
using (true);

drop policy if exists "scheduled_notifications_authenticated_select" on public.scheduled_notifications;
create policy "scheduled_notifications_authenticated_select"
on public.scheduled_notifications
for select
to authenticated
using (true);

drop policy if exists "applicant_notification_state_authenticated_select" on public.applicant_notification_state;
create policy "applicant_notification_state_authenticated_select"
on public.applicant_notification_state
for select
to authenticated
using (true);

drop policy if exists "notification_templates_authenticated_select" on public.notification_templates;
create policy "notification_templates_authenticated_select"
on public.notification_templates
for select
to authenticated
using (true);

insert into public.notification_rules (event_type, template_key, priority, active)
values
  ('REGISTRATION_RECEIVED', 'foundation_welcome', 100, true),
  ('NO_CLASS_AVAILABLE', 'no_class_available', 100, true),
  ('NO_SUITABLE_TIME', 'no_suitable_times', 100, true),
  ('CLASS_ASSIGNED', 'class_assigned', 100, true),
  ('DUPLICATE_REGISTRATION', 'duplicate_registration', 100, true),
  ('CLASS_REMINDER_7_DAY', 'class_reminder_7_day', 100, true),
  ('CLASS_REMINDER_1_DAY', 'class_reminder_1_day', 100, true),
  ('CLASS_REMINDER_2_HOUR', 'class_reminder_2_hour', 100, true)
on conflict do nothing;

insert into public.notification_templates (template_key, subject, body_html, active)
values
  ('foundation_welcome', 'Welcome to Foundation School', '<p>Welcome to Foundation School.</p>', true),
  ('no_class_available', 'Class options are not available yet', '<p>We will notify you when classes open.</p>', true),
  ('no_suitable_times', 'We will notify you when more class times open', '<p>We received your availability preference.</p>', true),
  ('class_assigned', 'Your class has been assigned', '<p>Your class assignment is ready.</p>', true),
  ('duplicate_registration', 'We received your additional registration', '<p>We received your additional submission.</p>', true),
  ('class_reminder_7_day', 'Reminder: class starts in 7 days', '<p>Your class starts in 7 days.</p>', true),
  ('class_reminder_1_day', 'Reminder: class starts tomorrow', '<p>Your class starts tomorrow.</p>', true),
  ('class_reminder_2_hour', 'Reminder: class starts in 2 hours', '<p>Your class starts in 2 hours.</p>', true)
on conflict (template_key) do update
set subject = excluded.subject,
    body_html = excluded.body_html,
    active = excluded.active,
    updated_at = now();

commit;

