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
security definer
set search_path = public
as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_student_id text := nullif(trim(coalesce(p_student_id, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 1000));
  v_registration_id uuid := p_registration_id;
  v_applicant_id uuid := p_applicant_id;
  v_resolved_email text := null;
begin
  create temp table if not exists trace_rows_tmp (
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
  ) on commit drop;

  truncate table trace_rows_tmp;

  if v_registration_id is null and v_applicant_id is not null then
    v_registration_id := v_applicant_id;
  end if;
  if v_applicant_id is null and v_registration_id is not null then
    v_applicant_id := v_registration_id;
  end if;

  if v_registration_id is null and to_regclass('public.applicants') is not null and v_email is not null then
    begin
      execute $q$
        select a.id
        from public.applicants a
        where lower(a.email) = $1
        order by a.created_at desc
        limit 1
      $q$
      into v_registration_id
      using v_email;
    exception when others then
      v_registration_id := null;
    end;
  end if;

  if v_registration_id is null
     and to_regclass('public.students') is not null
     and to_regclass('public.applicants') is not null
     and v_student_id is not null then
    begin
      execute $q$
        select a.id
        from public.students s
        join public.applicants a on lower(a.email) = lower(s.email)
        where s.student_id = $1
        order by a.created_at desc
        limit 1
      $q$
      into v_registration_id
      using v_student_id;
    exception when others then
      v_registration_id := null;
    end;
  end if;

  if v_applicant_id is null then
    v_applicant_id := v_registration_id;
  end if;

  if to_regclass('public.applicants') is not null and v_registration_id is not null then
    begin
      execute $q$
        select lower(a.email)
        from public.applicants a
        where a.id = $1
        limit 1
      $q$
      into v_resolved_email
      using v_registration_id;
    exception when others then
      v_resolved_email := null;
    end;
  end if;

  if v_resolved_email is null then
    v_resolved_email := v_email;
  end if;

  if to_regclass('public.applicants') is not null then
    begin
      execute $q$
        insert into trace_rows_tmp
        select
          coalesce(a.submitted_at, a.created_at) as event_ts,
          'applicants'::text,
          'APPLICANT_EVENT'::text,
          coalesce(a.status, 'UNKNOWN')::text,
          a.id,
          a.id,
          null::text,
          lower(a.email)::text,
          a.id::text,
          format('Applicant %s (%s)', coalesce(nullif(trim(concat_ws(' ', a.first_name, a.last_name)), ''), a.email), coalesce(a.status, 'UNKNOWN'))::text,
          to_jsonb(a)
        from public.applicants a
        where
          ($1 is not null and a.id = $1)
          or ($2 is not null and a.id = $2)
          or ($3 is not null and lower(a.email) = $3)
      $q$
      using v_registration_id, v_applicant_id, v_resolved_email;
    exception when others then
      null;
    end;
  end if;

  if to_regclass('public.students') is not null then
    begin
      execute $q$
        insert into trace_rows_tmp
        select
          s.created_at,
          'students'::text,
          'STUDENT_EVENT'::text,
          coalesce(s.status, 'UNKNOWN')::text,
          a.id,
          a.id,
          s.student_id::text,
          lower(s.email)::text,
          s.student_id::text,
          format('Student %s (%s)', coalesce(s.full_name, s.student_id), coalesce(s.status, 'UNKNOWN'))::text,
          to_jsonb(s)
        from public.students s
        left join public.applicants a on lower(a.email) = lower(s.email)
        where
          ($1 is not null and s.student_id = $1)
          or ($2 is not null and lower(s.email) = $2)
          or ($3 is not null and a.id = $3)
      $q$
      using v_student_id, v_resolved_email, v_registration_id;
    exception when others then
      null;
    end;
  end if;

  if to_regclass('public.class_roster') is not null then
    begin
      execute $q$
        insert into trace_rows_tmp
        select
          cr.created_at,
          'class_roster'::text,
          'CLASS_ROSTER_EVENT'::text,
          coalesce(cr.status, 'UNKNOWN')::text,
          a.id,
          a.id,
          cr.student_id::text,
          lower(s.email)::text,
          cr.id::text,
          format('Class roster %s (%s)', coalesce(cr.class_option_id, 'n/a'), coalesce(cr.status, 'UNKNOWN'))::text,
          to_jsonb(cr)
        from public.class_roster cr
        left join public.students s on s.student_id = cr.student_id
        left join public.applicants a on lower(a.email) = lower(s.email)
        where
          ($1 is not null and cr.student_id = $1)
          or ($2 is not null and lower(s.email) = $2)
          or ($3 is not null and a.id = $3)
      $q$
      using v_student_id, v_resolved_email, v_registration_id;
    exception when others then
      null;
    end;
  end if;

  if to_regclass('public.moodle_enrollment_sync') is not null then
    begin
      execute $q$
        insert into trace_rows_tmp
        select
          coalesce(mes.updated_at, mes.created_at),
          'moodle_enrollment_sync'::text,
          coalesce('MOODLE_' || (to_jsonb(mes)->>'sync_status'), 'MOODLE_EVENT')::text,
          coalesce(to_jsonb(mes)->>'sync_status', to_jsonb(mes)->>'status', 'UNKNOWN')::text,
          coalesce(
            case when coalesce(to_jsonb(mes)->>'registration_id','') ~* '^[0-9a-f-]{36}$' then (to_jsonb(mes)->>'registration_id')::uuid else null end,
            case when coalesce(to_jsonb(mes)->>'applicant_id','') ~* '^[0-9a-f-]{36}$' then (to_jsonb(mes)->>'applicant_id')::uuid else null end
          ) as registration_id,
          case when coalesce(to_jsonb(mes)->>'applicant_id','') ~* '^[0-9a-f-]{36}$' then (to_jsonb(mes)->>'applicant_id')::uuid else null end,
          coalesce(to_jsonb(mes)->>'student_id', null),
          lower(coalesce(to_jsonb(mes)->>'email', '')),
          coalesce(to_jsonb(mes)->>'id', null),
          format('Moodle sync %s', coalesce(to_jsonb(mes)->>'sync_status', 'UNKNOWN'))::text,
          to_jsonb(mes)
        from public.moodle_enrollment_sync mes
        where
          ($1 is not null and (
            (coalesce(to_jsonb(mes)->>'registration_id','') ~* '^[0-9a-f-]{36}$' and (to_jsonb(mes)->>'registration_id')::uuid = $1)
            or (coalesce(to_jsonb(mes)->>'applicant_id','') ~* '^[0-9a-f-]{36}$' and (to_jsonb(mes)->>'applicant_id')::uuid = $1)
          ))
          or ($2 is not null and coalesce(to_jsonb(mes)->>'student_id', '') = $2)
          or ($3 is not null and lower(coalesce(to_jsonb(mes)->>'email', '')) = $3)
      $q$
      using v_registration_id, v_student_id, v_resolved_email;
    exception when others then
      null;
    end;
  end if;

  if to_regclass('public.scheduled_notifications') is not null then
    begin
      execute $q$
        insert into trace_rows_tmp
        select
          coalesce(sn.updated_at, sn.created_at),
          'scheduled_notifications'::text,
          coalesce(sn.event_type, 'SCHEDULED_NOTIFICATION')::text,
          coalesce(sn.status, 'UNKNOWN')::text,
          sn.applicant_id,
          sn.applicant_id,
          null::text,
          lower(sn.recipient_email)::text,
          sn.id::text,
          format('Notification %s (%s)', coalesce(sn.template_key, 'n/a'), coalesce(sn.status, 'UNKNOWN'))::text,
          to_jsonb(sn)
        from public.scheduled_notifications sn
        where
          ($1 is not null and sn.applicant_id = $1)
          or ($2 is not null and lower(sn.recipient_email) = $2)
      $q$
      using v_registration_id, v_resolved_email;
    exception when others then
      null;
    end;
  end if;

  if to_regclass('public.email_queue') is not null then
    begin
      execute $q$
        insert into trace_rows_tmp
        select
          coalesce(eq.updated_at, eq.created_at),
          'email_queue'::text,
          coalesce(eq.template_key, 'EMAIL_QUEUE')::text,
          coalesce(eq.status, 'UNKNOWN')::text,
          a.id,
          a.id,
          coalesce(eq.student_id::text, s.student_id::text),
          lower(eq.recipient_email)::text,
          eq.id::text,
          format('Email %s (%s)', coalesce(eq.template_key, 'n/a'), coalesce(eq.status, 'UNKNOWN'))::text,
          to_jsonb(eq)
        from public.email_queue eq
        left join public.students s on s.student_id = eq.student_id
        left join public.applicants a on lower(a.email) = lower(eq.recipient_email)
        where
          ($1 is not null and a.id = $1)
          or ($2 is not null and coalesce(eq.student_id::text, s.student_id::text) = $2)
          or ($3 is not null and lower(eq.recipient_email) = $3)
      $q$
      using v_registration_id, v_student_id, v_resolved_email;
    exception when others then
      null;
    end;
  end if;

  if to_regclass('public.audit_logs') is not null then
    begin
      execute $q$
        insert into trace_rows_tmp
        select
          coalesce(al.logged_at, al.created_at),
          'audit_logs'::text,
          coalesce(al.action, 'AUDIT_EVENT')::text,
          coalesce(al.status, 'UNKNOWN')::text,
          case
            when coalesce(al.entity_id, '') ~* '^[0-9a-f-]{36}$' then al.entity_id::uuid
            else null
          end,
          case
            when coalesce(al.entity_id, '') ~* '^[0-9a-f-]{36}$' then al.entity_id::uuid
            else null
          end,
          coalesce(al.details ->> 'student_id', null),
          lower(coalesce(al.details ->> 'email', al.actor_email, '')),
          al.id::text,
          format('%s (%s)', coalesce(al.action, 'AUDIT_EVENT'), coalesce(al.status, 'UNKNOWN'))::text,
          to_jsonb(al)
        from public.audit_logs al
        where
          ($1 is not null and coalesce(al.entity_id, '') ~* '^[0-9a-f-]{36}$' and al.entity_id::uuid = $1)
          or ($2 is not null and coalesce(al.details ->> 'student_id', '') = $2)
          or ($3 is not null and (
            lower(coalesce(al.details ->> 'email', '')) = $3
            or lower(coalesce(al.actor_email, '')) = $3
          ))
      $q$
      using v_registration_id, v_student_id, v_resolved_email;
    exception when others then
      null;
    end;
  end if;

  if to_regclass('public.sync_log') is not null then
    begin
      execute $q$
        insert into trace_rows_tmp
        select
          sl.logged_at,
          'sync_log'::text,
          coalesce(sl.phase, 'SYNC_LOG_EVENT')::text,
          coalesce(sl.run_by, 'UNKNOWN')::text,
          case
            when coalesce(sl.details ->> 'applicant_id', '') ~* '^[0-9a-f-]{36}$' then (sl.details ->> 'applicant_id')::uuid
            else null
          end,
          case
            when coalesce(sl.details ->> 'applicant_id', '') ~* '^[0-9a-f-]{36}$' then (sl.details ->> 'applicant_id')::uuid
            else null
          end,
          coalesce(sl.details ->> 'student_id', null),
          lower(coalesce(sl.details ->> 'email', '')),
          sl.id::text,
          coalesce(sl.message, sl.phase, 'Sync log event')::text,
          to_jsonb(sl)
        from public.sync_log sl
        where
          ($1 is not null and coalesce(sl.details ->> 'applicant_id', '') ~* '^[0-9a-f-]{36}$' and (sl.details ->> 'applicant_id')::uuid = $1)
          or ($2 is not null and coalesce(sl.details ->> 'student_id', '') = $2)
          or ($3 is not null and lower(coalesce(sl.details ->> 'email', '')) = $3)
      $q$
      using v_registration_id, v_student_id, v_resolved_email;
    exception when others then
      null;
    end;
  end if;

  if to_regclass('public.error_submissions') is not null then
    begin
      execute $q$
        insert into trace_rows_tmp
        select
          coalesce(es.updated_at, es.created_at),
          'error_submissions'::text,
          coalesce(es.source_form, 'ERROR_SUBMISSION')::text,
          case when es.resolved then 'RESOLVED' else 'OPEN' end::text,
          case
            when coalesce(es.raw_data ->> 'applicant_id', '') ~* '^[0-9a-f-]{36}$' then (es.raw_data ->> 'applicant_id')::uuid
            else null
          end,
          case
            when coalesce(es.raw_data ->> 'applicant_id', '') ~* '^[0-9a-f-]{36}$' then (es.raw_data ->> 'applicant_id')::uuid
            else null
          end,
          coalesce(es.raw_data ->> 'student_id', null),
          lower(coalesce(es.raw_data ->> 'email', '')),
          es.id::text,
          coalesce(es.error_message, 'Error submission')::text,
          to_jsonb(es)
        from public.error_submissions es
        where
          ($1 is not null and coalesce(es.raw_data ->> 'applicant_id', '') ~* '^[0-9a-f-]{36}$' and (es.raw_data ->> 'applicant_id')::uuid = $1)
          or ($2 is not null and coalesce(es.raw_data ->> 'student_id', '') = $2)
          or ($3 is not null and lower(coalesce(es.raw_data ->> 'email', '')) = $3)
      $q$
      using v_registration_id, v_student_id, v_resolved_email;
    exception when others then
      null;
    end;
  end if;

  return query
  select
    tr.event_ts,
    tr.source_table,
    tr.event_type,
    tr.status,
    tr.registration_id,
    tr.applicant_id,
    tr.student_id,
    tr.email,
    tr.record_id,
    tr.summary,
    tr.details
  from trace_rows_tmp tr
  order by tr.event_ts asc nulls last
  limit v_limit;
end;
$$;

revoke all on function public.get_operational_trace(text, uuid, text, uuid, integer) from public;
revoke all on function public.get_operational_trace(text, uuid, text, uuid, integer) from anon;
grant execute on function public.get_operational_trace(text, uuid, text, uuid, integer) to authenticated;

commit;
