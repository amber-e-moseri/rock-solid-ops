-- Atomic approval flow for teacher availability -> class_option/class_slot.
-- Prevents partial writes when class record creation fails.

create or replace function public.approve_teacher_availability_atomic(
  p_availability_id uuid,
  p_actor_email text default null,
  p_actor_id text default null
)
returns table (
  ok boolean,
  class_option_id text,
  class_slot_id text,
  error text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_avail public.teacher_availability%rowtype;
  v_teacher public.teachers%rowtype;
  v_batch_id text;
  v_day text;
  v_time time;
  v_time_key text;
  v_tid_key text;
  v_sg_key text;
  v_co_id text;
  v_cs_id text;
begin
  if not public.is_superadmin() then
    return query select false, null::text, null::text, 'Only superadmin can approve availability.';
    return;
  end if;

  begin
    select *
    into v_avail
    from public.teacher_availability
    where id = p_availability_id
    for update;

    if not found then
      return query select false, null::text, null::text, 'Availability row not found.';
      return;
    end if;

    select *
    into v_teacher
    from public.teachers
    where teacher_id = v_avail.teacher_id;

    if not found then
      return query select false, null::text, null::text, 'Teacher not found for availability row.';
      return;
    end if;

    v_batch_id := coalesce(v_avail.batch_id, '2025A');
    v_day := coalesce(v_avail.day, '');
    v_time := v_avail.time_slot;

    if v_day = '' or v_time is null then
      return query select false, null::text, null::text, 'Availability day/time is required.';
      return;
    end if;

    v_time_key := to_char(v_time, 'HH24MI');
    v_tid_key := upper(left(regexp_replace(coalesce(v_avail.teacher_id, ''), '[^A-Za-z0-9]', '', 'g'), 8));
    v_sg_key := upper(regexp_replace(coalesce(v_teacher.subgroup_id, ''), '[^A-Za-z0-9]', '', 'g'));

    v_co_id := 'CO-' || v_sg_key || '-' || upper(left(v_day, 3)) || '-' || v_time_key || '-' || v_tid_key;
    v_cs_id := 'CS-' || v_co_id || '-' || v_batch_id;

    insert into public.class_options (
      class_option_id,
      class_id,
      teacher_id,
      teacher_name,
      fellowship_codes,
      group_id,
      subgroup_id,
      day,
      class_time,
      active,
      enrollment_open,
      deleted_at,
      updated_by
    )
    values (
      v_co_id,
      v_co_id,
      v_avail.teacher_id,
      coalesce(v_teacher.full_name, ''),
      '{}'::text[],
      coalesce(v_teacher.group_id, ''),
      coalesce(v_teacher.subgroup_id, ''),
      v_day,
      v_time,
      true,
      true,
      null,
      p_actor_id
    )
    on conflict (class_option_id)
    do update
      set teacher_id = excluded.teacher_id,
          teacher_name = excluded.teacher_name,
          group_id = excluded.group_id,
          subgroup_id = excluded.subgroup_id,
          day = excluded.day,
          class_time = excluded.class_time,
          active = true,
          enrollment_open = true,
          deleted_at = null,
          updated_by = excluded.updated_by,
          updated_at = now();

    insert into public.class_slots (
      class_slot_id,
      class_option_id,
      teacher_id,
      teacher_name,
      group_id,
      subgroup_id,
      batch_id,
      status,
      current_enrolment,
      updated_by
    )
    values (
      v_cs_id,
      v_co_id,
      v_avail.teacher_id,
      coalesce(v_teacher.full_name, ''),
      coalesce(v_teacher.group_id, ''),
      coalesce(v_teacher.subgroup_id, ''),
      v_batch_id,
      'Active',
      0,
      p_actor_id
    )
    on conflict (class_slot_id)
    do update
      set class_option_id = excluded.class_option_id,
          teacher_id = excluded.teacher_id,
          teacher_name = excluded.teacher_name,
          group_id = excluded.group_id,
          subgroup_id = excluded.subgroup_id,
          batch_id = excluded.batch_id,
          status = 'Active',
          updated_by = excluded.updated_by,
          updated_at = now();

    update public.teacher_availability
    set
      status = 'Available',
      class_option_id = v_co_id,
      class_option_sync_status = 'SUCCESS',
      class_option_sync_error = null,
      class_option_sync_attempts = coalesce(class_option_sync_attempts, 0) + 1,
      class_option_sync_last_at = now(),
      updated_by = p_actor_id
    where id = p_availability_id;

    return query select true, v_co_id, v_cs_id, null::text;
  exception when others then
    update public.teacher_availability
    set
      class_option_sync_status = 'FAILED',
      class_option_sync_error = left(sqlerrm, 500),
      class_option_sync_attempts = coalesce(class_option_sync_attempts, 0) + 1,
      class_option_sync_last_at = now(),
      updated_by = p_actor_id
    where id = p_availability_id;

    return query select false, null::text, null::text, sqlerrm;
  end;
end;
$$;

grant execute on function public.approve_teacher_availability_atomic(uuid, text, text) to authenticated;