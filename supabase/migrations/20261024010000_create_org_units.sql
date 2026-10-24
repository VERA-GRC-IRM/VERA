-- Empty, private directory of organizational scopes. Existing GRC rows are untouched.
create table if not exists public.vera_org_units (
  id text primary key,
  code text not null unique,
  kind text not null check (kind in ('GROUP', 'LEGAL_ENTITY', 'BUSINESS_UNIT', 'SITE')),
  parent_id text references public.vera_org_units(id) on delete restrict,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vera_org_units_code_format check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
  constraint vera_org_units_payload_matches check (
    payload ->> 'id' = id and payload ->> 'code' = code and
    payload ->> 'kind' = kind and (payload ->> 'parentId') is not distinct from parent_id
  )
);
create index if not exists vera_org_units_parent_idx on public.vera_org_units(parent_id);
alter table public.vera_org_units enable row level security;
revoke all on public.vera_org_units from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert on public.vera_org_units to service_role;
