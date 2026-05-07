begin;

-- Canonicalize to public.audit_logs only.
-- Safe in environments where legacy public.audit_log may still exist.

do $$
begin
  if to_regclass('public.audit_logs') is null then
    create table public.audit_logs (
      id bigserial primary key,
      logged_at timestamptz not null default now(),
      actor_email text null,
      actor_id text null,
      action text not null,
      entity_type text null,
      entity_id text null,
      status text null,
      details jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  end if;
end $$;

-- If legacy audit_log exists as a table, migrate rows then drop it.
do $$
declare
  v_relkind "char";
begin
  select c.relkind into v_relkind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'audit_log'
  limit 1;

  if v_relkind = 'r' then
    insert into public.audit_logs (logged_at, actor_email, actor_id, action, entity_type, entity_id, status, details, created_at)
    select
      coalesce(al.logged_at, now()),
      al.changed_by,
      null,
      coalesce(al.action, 'LEGACY_AUDIT_EVENT'),
      al.entity_type,
      al.entity_id,
      al.notes,
      coalesce(al.after_data, '{}'::jsonb),
      coalesce(al.logged_at, now())
    from public.audit_log al;

    drop table public.audit_log;
  elsif v_relkind = 'v' then
    drop view public.audit_log;
  end if;
end $$;

commit;
