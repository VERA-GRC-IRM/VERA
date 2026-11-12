-- Señales efímeras de edición; solo el backend con service_role puede leerlas.
create table if not exists public.vera_record_presence (
  user_id bigint not null references public.vera_users(id) on delete cascade,
  client_id uuid not null,
  record_type text not null check (record_type in ('RISK', 'CONTROL')),
  record_id text not null check (length(record_id) between 1 and 100),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id)
);
create index if not exists vera_record_presence_active_idx
  on public.vera_record_presence (record_type, record_id, expires_at);
alter table public.vera_record_presence enable row level security;
revoke all on public.vera_record_presence from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.vera_record_presence to service_role;
