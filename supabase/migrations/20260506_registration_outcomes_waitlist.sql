begin;

alter table public.applicants
  add column if not exists registration_status text,
  add column if not exists availability_status text,
  add column if not exists assigned_at timestamptz,
  add column if not exists waitlisted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_notes text,
  add column if not exists retry_assignment boolean not null default false,
  add column if not exists assignment_attempts integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_applicants_registration_status'
      and conrelid = 'public.applicants'::regclass
  ) then
    alter table public.applicants
      add constraint chk_applicants_registration_status
      check (registration_status in ('PENDING','ASSIGNED','WAITLISTED','DUPLICATE','REVIEW','INACTIVE','COMPLETED'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_applicants_availability_status'
      and conrelid = 'public.applicants'::regclass
  ) then
    alter table public.applicants
      add constraint chk_applicants_availability_status
      check (availability_status in ('CLASS_ASSIGNED','NO_MATCHING_TIME','CLASS_FULL','MANUAL_REVIEW_REQUIRED','NO_CLASS_AVAILABLE'));
  end if;
end $$;

update public.applicants
set registration_status = case
  when upper(coalesce(status, '')) = 'ENROLLED' then 'ASSIGNED'
  when upper(coalesce(status, '')) = 'REJECTED' then 'INACTIVE'
  when upper(coalesce(status, '')) = 'APPROVED' then 'COMPLETED'
  else 'PENDING'
end
where registration_status is null;

update public.applicants
set availability_status = case
  when registration_status = 'ASSIGNED' then 'CLASS_ASSIGNED'
  when registration_status = 'DUPLICATE' then 'MANUAL_REVIEW_REQUIRED'
  else 'NO_CLASS_AVAILABLE'
end
where availability_status is null;

update public.applicants
set assignment_attempts = greatest(coalesce(assignment_attempts, 0), 1)
where assignment_attempts is null or assignment_attempts < 1;

update public.applicants
set waitlisted_at = coalesce(waitlisted_at, created_at)
where registration_status = 'WAITLISTED' and waitlisted_at is null;

create index if not exists idx_applicants_registration_status
  on public.applicants (registration_status);
create index if not exists idx_applicants_availability_status
  on public.applicants (availability_status);
create index if not exists idx_applicants_retry_assignment
  on public.applicants (retry_assignment)
  where retry_assignment = true;
create index if not exists idx_applicants_waitlisted_created
  on public.applicants (waitlisted_at desc);

insert into public.notification_rules (event_type, template_key, priority, active)
values
  ('WAITLISTED', 'waitlist_confirmation', 100, true),
  ('REGISTRATION_UNDER_REVIEW', 'registration_under_review', 100, true)
on conflict do nothing;

insert into public.notification_templates (template_key, subject, body_html, active)
values
  (
    'waitlist_confirmation',
    'We received your registration and are working on your placement',
    '<p>We received your registration and are actively working on your placement.</p><p>You are currently waitlisted while we match you to the best available class time. We will update you as soon as placement is confirmed.</p>',
    true
  ),
  (
    'registration_under_review',
    'Your registration is under review',
    '<p>Thank you for registering.</p><p>Your registration is currently under review by our team, and we will update you shortly with next steps.</p>',
    true
  )
on conflict (template_key) do update
set subject = excluded.subject,
    body_html = excluded.body_html,
    active = excluded.active,
    updated_at = now();

create or replace view public.registration_outcome_summary as
select
  coalesce(fellowship_code, 'UNKNOWN') as fellowship_code,
  coalesce(co.subgroup_id, 'UNKNOWN') as subgroup_id,
  coalesce(a.group_id, 'UNKNOWN') as group_id,
  coalesce(registration_status, 'PENDING') as registration_status,
  count(*)::bigint as total
from public.applicants a
left join public.class_options co
  on co.class_option_id = a.class_option_id
group by 1, 2, 3, 4;

create or replace view public.registration_kpi as
select
  count(*)::bigint as total_registrations,
  count(*) filter (where registration_status = 'ASSIGNED')::bigint as assigned_count,
  count(*) filter (where registration_status = 'WAITLISTED')::bigint as waitlisted_count,
  count(*) filter (where registration_status = 'DUPLICATE')::bigint as duplicate_count,
  round((count(*) filter (where registration_status = 'ASSIGNED')::numeric / nullif(count(*), 0)) * 100, 2) as assignment_success_rate_pct,
  round((count(*) filter (where registration_status = 'DUPLICATE')::numeric / nullif(count(*), 0)) * 100, 2) as duplicate_rate_pct
from public.applicants;

commit;
