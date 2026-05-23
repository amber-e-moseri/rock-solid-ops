-- Hotfix: restore dashboard Registration/Fellowship/Weekly widgets by
-- filtering primarily on applicants.batch_id (with legacy class_slot fallback).

create or replace function public.get_registration_summary(
  p_batch_id  text    default null,
  p_subgroups text[]  default null
)
returns table (reg_status text, cnt bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_col text := 'status';
begin
  if to_regclass('public.applicants') is null then
    return;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'applicants'
      and column_name = 'registration_status'
  ) then
    v_col := 'registration_status';
  end if;

  return query execute format(
    'select coalesce(a.%I, ''UNKNOWN'')::text as reg_status,
            count(*)::bigint as cnt
       from public.applicants a
       left join public.class_options co
         on co.class_option_id = a.class_option_id
      where (
              $1 is null
              or a.batch_id::text = $1
              or exists (
                select 1
                  from public.class_slots cs
                 where cs.class_option_id = a.class_option_id
                   and cs.batch_id::text = $1
              )
            )
        and (
              $2 is null
              or cardinality($2) = 0
              or co.subgroup_id::text = any($2)
              or a.subgroup_id::text = any($2)
              or a.group_id::text = any($2)
            )
      group by 1
      order by 2 desc',
    v_col
  ) using p_batch_id, p_subgroups;
exception
  when others then
    return;
end;
$$;

grant execute on function public.get_registration_summary(text, text[]) to authenticated;


create or replace function public.get_fellowship_breakdown(
  p_batch_id  text    default null,
  p_subgroups text[]  default null
)
returns table (fellowship text, cnt bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.applicants') is null then
    return;
  end if;

  return query
    select coalesce(a.fellowship_code, 'Unknown')::text as fellowship,
           count(*)::bigint as cnt
      from public.applicants a
      left join public.class_options co
        on co.class_option_id = a.class_option_id
     where (
             p_batch_id is null
             or a.batch_id::text = p_batch_id
             or exists (
               select 1
                 from public.class_slots cs
                where cs.class_option_id = a.class_option_id
                  and cs.batch_id::text = p_batch_id
             )
           )
       and (
             p_subgroups is null
             or cardinality(p_subgroups) = 0
             or co.subgroup_id::text = any(p_subgroups)
             or a.subgroup_id::text = any(p_subgroups)
             or a.group_id::text = any(p_subgroups)
           )
     group by 1
     order by 2 desc;
exception
  when others then
    return;
end;
$$;

grant execute on function public.get_fellowship_breakdown(text, text[]) to authenticated;


create or replace function public.get_registrations_by_week(
  p_batch_id  text    default null,
  p_subgroups text[]  default null
)
returns table (week_start date, cnt bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.applicants') is null then
    return;
  end if;

  return query
    select date_trunc('week', a.created_at)::date as week_start,
           count(*)::bigint as cnt
      from public.applicants a
      left join public.class_options co
        on co.class_option_id = a.class_option_id
     where (
             p_batch_id is null
             or a.batch_id::text = p_batch_id
             or exists (
               select 1
                 from public.class_slots cs
                where cs.class_option_id = a.class_option_id
                  and cs.batch_id::text = p_batch_id
             )
           )
       and (
             p_subgroups is null
             or cardinality(p_subgroups) = 0
             or co.subgroup_id::text = any(p_subgroups)
             or a.subgroup_id::text = any(p_subgroups)
             or a.group_id::text = any(p_subgroups)
           )
     group by 1
     order by 1 desc
     limit 12;
exception
  when others then
    return;
end;
$$;

grant execute on function public.get_registrations_by_week(text, text[]) to authenticated;

