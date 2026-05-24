-- Phase 1 in-app messaging
-- Creates conversations/messages/participants with RLS and helper indexes.

create table if not exists public.message_conversations (
  id uuid primary key default gen_random_uuid(),
  subject text,
  scope_level text not null default 'SUBGROUP' check (scope_level in ('CANADA','GROUP','SUBGROUP')),
  scope_group_id text,
  scope_subgroup_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_participants (
  conversation_id uuid not null references public.message_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_role text,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  is_muted boolean not null default false,
  primary key (conversation_id, user_id)
);

create table if not exists public.message_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.message_conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_role text,
  sender_name text,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists idx_message_conversations_scope
  on public.message_conversations(scope_level, scope_group_id, scope_subgroup_id, updated_at desc);

create index if not exists idx_message_messages_conversation_created
  on public.message_messages(conversation_id, created_at desc);

create index if not exists idx_message_participants_user
  on public.message_participants(user_id, conversation_id);

create or replace function public.set_message_conversations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_message_conversations_updated_at on public.message_conversations;
create trigger trg_message_conversations_updated_at
before update on public.message_conversations
for each row
execute function public.set_message_conversations_updated_at();

alter table public.message_conversations enable row level security;
alter table public.message_participants enable row level security;
alter table public.message_messages enable row level security;

drop policy if exists message_conversations_select_participant on public.message_conversations;
create policy message_conversations_select_participant
on public.message_conversations
for select
to authenticated
using (
  exists (
    select 1
    from public.message_participants mp
    where mp.conversation_id = message_conversations.id
      and mp.user_id = auth.uid()
  )
  or coalesce(public.is_admin(), false)
);

drop policy if exists message_conversations_insert_staff on public.message_conversations;
create policy message_conversations_insert_staff
on public.message_conversations
for insert
to authenticated
with check (
  auth.uid() = created_by
  and coalesce(public.current_profile_role() in ('teacher','principal','subgroup_admin','pastor','admin','superadmin','regional_secretary'), false)
);

drop policy if exists message_conversations_update_participant on public.message_conversations;
create policy message_conversations_update_participant
on public.message_conversations
for update
to authenticated
using (
  exists (
    select 1 from public.message_participants mp
    where mp.conversation_id = message_conversations.id
      and mp.user_id = auth.uid()
  )
  or coalesce(public.is_admin(), false)
)
with check (
  exists (
    select 1 from public.message_participants mp
    where mp.conversation_id = message_conversations.id
      and mp.user_id = auth.uid()
  )
  or coalesce(public.is_admin(), false)
);

drop policy if exists message_participants_select_self on public.message_participants;
create policy message_participants_select_self
on public.message_participants
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.message_participants mp
    where mp.conversation_id = message_participants.conversation_id
      and mp.user_id = auth.uid()
  )
  or coalesce(public.is_admin(), false)
);

drop policy if exists message_participants_insert_admin on public.message_participants;
create policy message_participants_insert_admin
on public.message_participants
for insert
to authenticated
with check (coalesce(public.is_admin(), false));

drop policy if exists message_participants_update_self on public.message_participants;
create policy message_participants_update_self
on public.message_participants
for update
to authenticated
using (user_id = auth.uid() or coalesce(public.is_admin(), false))
with check (user_id = auth.uid() or coalesce(public.is_admin(), false));

drop policy if exists message_messages_select_participant on public.message_messages;
create policy message_messages_select_participant
on public.message_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.message_participants mp
    where mp.conversation_id = message_messages.conversation_id
      and mp.user_id = auth.uid()
  )
  or coalesce(public.is_admin(), false)
);

drop policy if exists message_messages_insert_participant on public.message_messages;
create policy message_messages_insert_participant
on public.message_messages
for insert
to authenticated
with check (
  sender_user_id = auth.uid()
  and exists (
    select 1
    from public.message_participants mp
    where mp.conversation_id = message_messages.conversation_id
      and mp.user_id = auth.uid()
  )
);

grant select, insert, update on public.message_conversations to authenticated;
grant select, insert, update on public.message_participants to authenticated;
grant select, insert on public.message_messages to authenticated;
