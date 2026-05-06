create table if not exists public.email_queue (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  recipient_name text,
  template_key text not null,
  subject text,
  payload jsonb,
  status text not null default 'Pending',
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.email_queue disable row level security;
