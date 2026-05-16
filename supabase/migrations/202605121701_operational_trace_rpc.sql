begin;

create or replace function public.get_operational_trace(
  p_email text default null,
  p_applicant_id uuid default null,
  p_student_id text default null,
  p_registration_id uuid default null,
  p_limit integer default 500
)
returns table (
  event_ts timestamptz,
  source_table text,
  event_type text,
  status text,
  registration_id uuid,
  applicant_id uuid,
  student_id text,
  email text,
  record_id text,
  summary text,
  details jsonb
)
language plpgsql
as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_student_id text := nullif(trim(coalesce(p_student_id, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 1000));
  v_registration_id uuid;
  v_applicant_id uuid;
  v_resolved_email text;
begin
  v_registration_id := coalesce(p_registration_id, p_applicant_id);
  v_applicant_id := coalesce(p_applicant_id, p_registration_id);

  if v_registration_id is null and v_student_id is not null then
    select a.id
      into v_registration_id
    from public.students s
    join public.applicants a
      on lower(a.email) = lower(s.email)
    where s.student_id = v_student_id
    order by a.created_at desc
    limit 1;
  end if;

  if v_registration_id is null and v_email is not null then
    select a.id
      into v_registration_id
    from public.applicants a
    where lower(a.email) = v_email
    order by a.created_at desc
    limit 1;
  end if;

  if v_registration_id is not null then
    v_applicant_id := v_registration_id;
  end if;

  select lower(a.email)
    into v_resolved_email
  from public.applicants a
  where a.id = v_registration_id;

  if v_resolved_email is null then
    v_resolved_email := v_email;
  end if;

  return query
  with ctx as (
    select
      v_registration_id as registration_id,
      v_applicant_id as applicant_id,
      v_student_id as student_id,
      v_resolved_email as email
  ),
  all_rows as (
    select
      a.created_at as event_ts,
      'applicants'::text as source_table,
      'APPLICANT_CREATED'::text as event_type,
      coalesce(a.registration_status, a.status, 'UNKNOWN')::text as status,
      a.id as registration_id,
      a.id as applicant_id,
      null::text as student_id,
      lower(a.email)::text as email,
      a.id::text as record_id,
      format('Applicant %s (%s)', coalesce(a.full_name, concat_ws(' ', a.first_name, a.last_name)), coalesce(a.registration_status, a.status, 'UNKNOWN'))::text as summary,
      to_jsonb(a) as details
    from public.applicants a
    cross join ctx
    where
      (ctx.registration_id is not null and a.id = ctx.registration_id)
      or (ctx.email is not null and lower(a.email) = ctx.email)

    union all

    select
      s.created_at as event_ts,
      'students'::text as source_table,
      'STUDENT_RECORD'::text as event_type,
      coalesce(s.status, 'UNKNOWN')::text as status,
      a.id as registration_id,
      a.id as applicant_id,
      s.student_id::text as student_id,
      lower(s.email)::text as email,
      s.student_id::text as record_id,
      format('Student %s (%s)', coalesce(s.full_name, s.student_id), coalesce(s.status, 'UNKNOWN'))::text as summary,
      to_jsonb(s) as details
    from public.students s
    left join public.applicants a
      on lower(a.email) = lower(s.email)
    cross join ctx
    where
      (ctx.student_id is not null and s.student_id = ctx.student_id)
      or (ctx.email is not null and lower(s.email) = ctx.email)
      or (ctx.registration_id is not null and a.id = ctx.registration_id)

    union all

    select
      cr.created_at as event_ts,
      'class_roster'::text as source_table,
      'CLASS_ROSTER_EVENT'::text as event_type,
      coalesce(cr.status, 'UNKNOWN')::text as status,
      a.id as registration_id,
      a.id as applicant_id,
      cr.student_id::text as student_id,
      lower(s.email)::text as email,
      cr.id::text as record_id,
      format('Class roster %s (%s)', coalesce(cr.class_option_id, 'n/a'), coalesce(cr.status, 'UNKNOWN'))::text as summary,
      to_jsonb(cr) as details
    from public.class_roster cr
    left join public.students s
      on s.student_id = cr.student_id
    left join public.applicants a
      on lower(a.email) = lower(s.email)
    cross join ctx
    where
      (ctx.student_id is not null and cr.student_id = ctx.student_id)
      or (ctx.email is not null and lower(s.email) = ctx.email)
      or (ctx.registration_id is not null and a.id = ctx.registration_id)

    union all

    select
      mes.created_at as event_ts,
      'moodle_enrollment_sync'::text as source_table,
      coalesce('MOODLE_' || mes.sync_status, 'MOODLE_EVENT')::text as event_type,
      coalesce(mes.sync_status, mes.status, 'UNKNOWN')::text as status,
      coalesce(mes.registration_id, mes.applicant_id) as registration_id,
      mes.applicant_id,
      mes.student_id::text,
      lower(mes.email)::text,
      mes.id::text as record_id,
      format('Moodle sync %s', coalesce(mes.sync_status, 'UNKNOWN'))::text as summary,
      to_jsonb(mes) as details
    from public.moodle_enrollment_sync mes
    cross join ctx
    where
      (ctx.registration_id is not null and (mes.registration_id = ctx.registration_id or mes.applicant_id = ctx.registration_id))
      or (ctx.student_id is not null and mes.student_id = ctx.student_id)
      or (ctx.email is not null and lower(mes.email) = ctx.email)

    union all

    select
      sn.created_at as event_ts,
      'scheduled_notifications'::text as source_table,
      coalesce(sn.event_type, 'SCHEDULED_NOTIFICATION')::text as event_type,
      coalesce(sn.status, 'UNKNOWN')::text as status,
      sn.applicant_id as registration_id,
      sn.applicant_id,
      null::text as student_id,
      lower(sn.recipient_email)::text as email,
      sn.id::text as record_id,
      format('Notification %s (%s)', coalesce(sn.template_key, 'n/a'), coalesce(sn.status, 'UNKNOWN'))::text as summary,
      to_jsonb(sn) as details
    from public.scheduled_notifications sn
    cross join ctx
    where
      (ctx.registration_id is not null and sn.applicant_id = ctx.registration_id)
      or (ctx.email is not null and lower(sn.recipient_email) = ctx.email)

    union all

    select
      eq.created_at as event_ts,
      'email_queue'::text as source_table,
      coalesce(eq.template_key, 'EMAIL_QUEUE')::text as event_type,
      coalesce(eq.status, 'UNKNOWN')::text as status,
      a.id as registration_id,
      a.id as applicant_id,
      coalesce(eq.student_id::text, s.student_id::text) as student_id,
      lower(eq.recipient_email)::text as email,
      eq.id::text as record_id,
      format('Email %s (%s)', coalesce(eq.template_key, 'n/a'), coalesce(eq.status, 'UNKNOWN'))::text as summary,
      to_jsonb(eq) as details
    from public.email_queue eq
    left join public.students s
      on s.student_id = eq.student_id
    left join public.applicants a
      on lower(a.email) = lower(eq.recipient_email)
    cross join ctx
    where
      (ctx.registration_id is not null and a.id = ctx.registration_id)
      or (ctx.student_id is not null and (eq.student_id = ctx.student_id or s.student_id = ctx.student_id))
      or (ctx.email is not null and lower(eq.recipient_email) = ctx.email)

    union all

    select
      coalesce(al.logged_at, al.created_at) as event_ts,
      'audit_logs'::text as source_table,
      coalesce(al.action, 'AUDIT_EVENT')::text as event_type,
      coalesce(al.status, 'UNKNOWN')::text as status,
      case
        when al.entity_type = 'applicant'
             and coalesce(al.entity_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then al.entity_id::uuid
        else null
      end as registration_id,
      case
        when al.entity_type = 'applicant'
             and coalesce(al.entity_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then al.entity_id::uuid
        else null
      end as applicant_id,
      coalesce(al.details ->> 'student_id', null) as student_id,
      lower(coalesce(al.details ->> 'email', al.actor_email, ''))::text as email,
      al.id::text as record_id,
      format('%s (%s)', coalesce(al.action, 'AUDIT_EVENT'), coalesce(al.status, 'UNKNOWN'))::text as summary,
      to_jsonb(al) as details
    from public.audit_logs al
    cross join ctx
    where
      (ctx.registration_id is not null and al.entity_type = 'applicant'
        and coalesce(al.entity_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and al.entity_id::uuid = ctx.registration_id)
      or (ctx.student_id is not null and (al.details ->> 'student_id') = ctx.student_id)
      or (ctx.email is not null and (lower(coalesce(al.details ->> 'email', '')) = ctx.email or lower(coalesce(al.actor_email, '')) = ctx.email))

    union all

    select
      sl.logged_at as event_ts,
      'sync_log'::text as source_table,
      coalesce(sl.phase, 'SYNC_LOG_EVENT')::text as event_type,
      coalesce(sl.run_by, 'UNKNOWN')::text as status,
      case
        when coalesce(sl.details ->> 'applicant_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (sl.details ->> 'applicant_id')::uuid
        else null
      end as registration_id,
      case
        when coalesce(sl.details ->> 'applicant_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (sl.details ->> 'applicant_id')::uuid
        else null
      end as applicant_id,
      coalesce(sl.details ->> 'student_id', null) as student_id,
      lower(coalesce(sl.details ->> 'email', ''))::text as email,
      sl.id::text as record_id,
      coalesce(sl.message, sl.phase, 'Sync log event')::text as summary,
      to_jsonb(sl) as details
    from public.sync_log sl
    cross join ctx
    where
      (ctx.registration_id is not null
        and coalesce(sl.details ->> 'applicant_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and (sl.details ->> 'applicant_id')::uuid = ctx.registration_id)
      or (ctx.student_id is not null and (sl.details ->> 'student_id') = ctx.student_id)
      or (ctx.email is not null and lower(coalesce(sl.details ->> 'email', '')) = ctx.email)

    union all

    select
      es.created_at as event_ts,
      'error_submissions'::text as source_table,
      coalesce(es.source_form, 'ERROR_SUBMISSION')::text as event_type,
      case when es.resolved then 'RESOLVED' else 'OPEN' end::text as status,
      case
        when coalesce(es.raw_data ->> 'applicant_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (es.raw_data ->> 'applicant_id')::uuid
        else null
      end as registration_id,
      case
        when coalesce(es.raw_data ->> 'applicant_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (es.raw_data ->> 'applicant_id')::uuid
        else null
      end as applicant_id,
      coalesce(es.raw_data ->> 'student_id', null) as student_id,
      lower(coalesce(es.raw_data ->> 'email', ''))::text as email,
      es.id::text as record_id,
      coalesce(es.error_message, 'Error submission')::text as summary,
      to_jsonb(es) as details
    from public.error_submissions es
    cross join ctx
    where
      (ctx.registration_id is not null
        and coalesce(es.raw_data ->> 'applicant_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and (es.raw_data ->> 'applicant_id')::uuid = ctx.registration_id)
      or (ctx.student_id is not null and (es.raw_data ->> 'student_id') = ctx.student_id)
      or (ctx.email is not null and lower(coalesce(es.raw_data ->> 'email', '')) = ctx.email)
  )
  select
    ar.event_ts,
    ar.source_table,
    ar.event_type,
    ar.status,
    ar.registration_id,
    ar.applicant_id,
    ar.student_id,
    ar.email,
    ar.record_id,
    ar.summary,
    ar.details
  from all_rows ar
  order by ar.event_ts asc nulls last
  limit v_limit;
end;
$$;

commit;
