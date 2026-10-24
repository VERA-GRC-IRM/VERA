-- Explicit direct grants. They do not alter permissions of GRC records yet.
create table if not exists public.vera_org_grants (
  id text primary key,
  unit_id text not null references public.vera_org_units(id) on delete restrict,
  user_id bigint not null references public.vera_users(id) on delete restrict,
  access_level text not null check (access_level in ('VIEW', 'MANAGE')),
  status text not null check (status in ('ACTIVE', 'REVOKED')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vera_org_grants_payload_matches check (
    payload ->> 'id' = id and payload ->> 'unitId' = unit_id and
    payload ->> 'userId' = user_id::text and
    payload ->> 'accessLevel' = access_level and payload ->> 'status' = status
  )
);
create unique index if not exists vera_org_grants_active_unique
  on public.vera_org_grants(unit_id, user_id) where status = 'ACTIVE';
create index if not exists vera_org_grants_user_idx on public.vera_org_grants(user_id, status);
alter table public.vera_org_grants enable row level security;
revoke all on public.vera_org_grants from public, anon, authenticated;
grant select, insert, update on public.vera_org_grants to service_role;
