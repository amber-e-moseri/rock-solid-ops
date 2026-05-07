begin;

create table if not exists public.clickup_admin_mappings (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  subgroup_id text null,
  clickup_user_id text not null,
  admin_name text null,
  admin_email text null,
  active boolean not null default true,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clickup_admin_mappings_group on public.clickup_admin_mappings(group_id);
create index if not exists idx_clickup_admin_mappings_subgroup on public.clickup_admin_mappings(subgroup_id) where subgroup_id is not null;
create index if not exists idx_clickup_admin_mappings_active on public.clickup_admin_mappings(active);

create table if not exists public.clickup_task_links (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id text not null,
  dedupe_key text not null unique,
  clickup_task_id text,
  status text not null default 'CREATED',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clickup_task_links_source on public.clickup_task_links(source_type, source_id);
create index if not exists idx_clickup_task_links_status on public.clickup_task_links(status);

alter table if exists public.moodle_enrollment_sync
  add column if not exists clickup_task_id text;

alter table if exists public.applicants
  add column if not exists clickup_task_id text;

alter table public.clickup_admin_mappings enable row level security;
alter table public.clickup_task_links enable row level security;

-- Admin/superadmin management and read access for mapping table.
drop policy if exists clickup_admin_mappings_admin_all on public.clickup_admin_mappings;
create policy clickup_admin_mappings_admin_all
on public.clickup_admin_mappings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Task link records are operational metadata; admins can view/update.
drop policy if exists clickup_task_links_admin_select on public.clickup_task_links;
create policy clickup_task_links_admin_select
on public.clickup_task_links
for select
to authenticated
using (public.is_admin());

drop policy if exists clickup_task_links_admin_update on public.clickup_task_links;
create policy clickup_task_links_admin_update
on public.clickup_task_links
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists clickup_task_links_admin_insert on public.clickup_task_links;
create policy clickup_task_links_admin_insert
on public.clickup_task_links
for insert
to authenticated
with check (public.is_admin());

-- Keep updated_at synced when helper trigger exists.
do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'trigger_set_updated_at'
  ) then
    if not exists (
      select 1 from pg_trigger where tgname = 'trg_clickup_admin_mappings_updated_at'
    ) then
      create trigger trg_clickup_admin_mappings_updated_at
      before update on public.clickup_admin_mappings
      for each row execute function trigger_set_updated_at();
    end if;

    if not exists (
      select 1 from pg_trigger where tgname = 'trg_clickup_task_links_updated_at'
    ) then
      create trigger trg_clickup_task_links_updated_at
      before update on public.clickup_task_links
      for each row execute function trigger_set_updated_at();
    end if;
  end if;
end $$;

commit;
