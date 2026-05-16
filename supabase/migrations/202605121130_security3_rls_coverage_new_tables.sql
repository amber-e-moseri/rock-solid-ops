begin;

-- SECURITY 3 hardening pass:
-- Normalize/guarantee RLS + restrictive policies on milestone/clickup/moodle operational tables.
-- Handles legacy/alias table names if they exist in an environment.

do $$
begin
  -- milestone_definitions (canonical) and milestones (legacy alias-name environments)
  if to_regclass('public.milestone_definitions') is not null then
    execute 'alter table public.milestone_definitions enable row level security';

    execute 'drop policy if exists milestone_definitions_admin_read on public.milestone_definitions';
    execute 'create policy milestone_definitions_admin_read on public.milestone_definitions for select to authenticated using (public.is_admin())';

    execute 'drop policy if exists milestone_definitions_superadmin_write on public.milestone_definitions';
    execute 'create policy milestone_definitions_superadmin_write on public.milestone_definitions for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin())';
  end if;

  if to_regclass('public.milestones') is not null then
    execute 'alter table public.milestones enable row level security';

    execute 'drop policy if exists milestones_admin_read on public.milestones';
    execute 'create policy milestones_admin_read on public.milestones for select to authenticated using (public.is_admin())';

    execute 'drop policy if exists milestones_superadmin_write on public.milestones';
    execute 'create policy milestones_superadmin_write on public.milestones for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin())';
  end if;

  -- student milestone progress
  if to_regclass('public.student_milestone_status') is not null then
    execute 'alter table public.student_milestone_status enable row level security';

    execute 'drop policy if exists student_milestone_status_admin_read on public.student_milestone_status';
    execute 'create policy student_milestone_status_admin_read on public.student_milestone_status for select to authenticated using (public.is_admin())';

    execute 'drop policy if exists student_milestone_status_admin_write on public.student_milestone_status';
    execute 'create policy student_milestone_status_admin_write on public.student_milestone_status for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;

  -- moodle enrollment sync queue
  if to_regclass('public.moodle_enrollment_sync') is not null then
    execute 'alter table public.moodle_enrollment_sync enable row level security';

    execute 'drop policy if exists moodle_enrollment_sync_admin_select on public.moodle_enrollment_sync';
    execute 'create policy moodle_enrollment_sync_admin_select on public.moodle_enrollment_sync for select to authenticated using (public.is_admin())';

    execute 'drop policy if exists moodle_enrollment_sync_admin_insert on public.moodle_enrollment_sync';
    execute 'create policy moodle_enrollment_sync_admin_insert on public.moodle_enrollment_sync for insert to authenticated with check (public.is_admin())';

    execute 'drop policy if exists moodle_enrollment_sync_admin_update on public.moodle_enrollment_sync';
    execute 'create policy moodle_enrollment_sync_admin_update on public.moodle_enrollment_sync for update to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;

  -- clickup escalations/task-link operational table variants
  if to_regclass('public.clickup_task_links') is not null then
    execute 'alter table public.clickup_task_links enable row level security';

    execute 'drop policy if exists clickup_task_links_admin_select on public.clickup_task_links';
    execute 'create policy clickup_task_links_admin_select on public.clickup_task_links for select to authenticated using (public.is_admin())';

    execute 'drop policy if exists clickup_task_links_admin_insert on public.clickup_task_links';
    execute 'create policy clickup_task_links_admin_insert on public.clickup_task_links for insert to authenticated with check (public.is_admin())';

    execute 'drop policy if exists clickup_task_links_admin_update on public.clickup_task_links';
    execute 'create policy clickup_task_links_admin_update on public.clickup_task_links for update to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;

  if to_regclass('public.clickup_escalations') is not null then
    execute 'alter table public.clickup_escalations enable row level security';

    execute 'drop policy if exists clickup_escalations_admin_select on public.clickup_escalations';
    execute 'create policy clickup_escalations_admin_select on public.clickup_escalations for select to authenticated using (public.is_admin())';

    execute 'drop policy if exists clickup_escalations_admin_insert on public.clickup_escalations';
    execute 'create policy clickup_escalations_admin_insert on public.clickup_escalations for insert to authenticated with check (public.is_admin())';

    execute 'drop policy if exists clickup_escalations_admin_update on public.clickup_escalations';
    execute 'create policy clickup_escalations_admin_update on public.clickup_escalations for update to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;

  -- clickup watchers table variants
  if to_regclass('public.clickup_admin_watchers') is not null then
    execute 'alter table public.clickup_admin_watchers enable row level security';

    execute 'drop policy if exists clickup_admin_watchers_admin_select on public.clickup_admin_watchers';
    execute 'create policy clickup_admin_watchers_admin_select on public.clickup_admin_watchers for select to authenticated using (public.is_admin())';

    execute 'drop policy if exists clickup_admin_watchers_admin_insert on public.clickup_admin_watchers';
    execute 'create policy clickup_admin_watchers_admin_insert on public.clickup_admin_watchers for insert to authenticated with check (public.is_admin())';

    execute 'drop policy if exists clickup_admin_watchers_admin_update on public.clickup_admin_watchers';
    execute 'create policy clickup_admin_watchers_admin_update on public.clickup_admin_watchers for update to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;

  if to_regclass('public.clickup_watchers') is not null then
    execute 'alter table public.clickup_watchers enable row level security';

    execute 'drop policy if exists clickup_watchers_admin_select on public.clickup_watchers';
    execute 'create policy clickup_watchers_admin_select on public.clickup_watchers for select to authenticated using (public.is_admin())';

    execute 'drop policy if exists clickup_watchers_admin_insert on public.clickup_watchers';
    execute 'create policy clickup_watchers_admin_insert on public.clickup_watchers for insert to authenticated with check (public.is_admin())';

    execute 'drop policy if exists clickup_watchers_admin_update on public.clickup_watchers';
    execute 'create policy clickup_watchers_admin_update on public.clickup_watchers for update to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;
end
$$;

commit;
