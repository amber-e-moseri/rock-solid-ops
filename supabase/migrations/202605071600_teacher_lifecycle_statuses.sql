begin;

alter table public.teachers
  add column if not exists status text,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by text,
  add column if not exists suspended_reason text,
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by text,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by text,
  add column if not exists rejected_reason text,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by text,
  add column if not exists deactivated_reason text;

alter table public.teachers
  drop constraint if exists teachers_status_check;

alter table public.teachers
  drop constraint if exists teachers_status_lifecycle_chk;

update public.teachers
set status = case
  when upper(coalesce(status, '')) = 'PENDING' then 'PENDING'
  when upper(coalesce(status, '')) in ('ACTIVE', 'APPROVED') then 'ACTIVE'
  when upper(coalesce(status, '')) in ('SUSPENDED', 'SUSPENDEDCONFIRMED') then 'SUSPENDED'
  when upper(coalesce(status, '')) in ('INACTIVE', 'REJECTED') then 'INACTIVE'
  when active is true then 'ACTIVE'
  else 'INACTIVE'
end;

update public.teachers
set active = (status = 'ACTIVE')
where active is distinct from (status = 'ACTIVE');

alter table public.teachers
  alter column status set default 'PENDING';

alter table public.teachers
  alter column status set not null;

alter table public.teachers
  add constraint teachers_status_lifecycle_chk
  check (status in ('PENDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE'));

create index if not exists idx_teachers_status_lifecycle
  on public.teachers(status);

commit;