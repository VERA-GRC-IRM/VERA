-- Versioned business context. No company, process or objective is preloaded.
create table if not exists public.vera_business_context (
  id text primary key,
  context_id text not null,
  revision integer not null check (revision > 0),
  kind text not null check (kind in ('PROCESS', 'SERVICE', 'OBJECTIVE')),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vera_business_context_payload_matches check (
    payload ->> 'id' = id and payload ->> 'contextId' = context_id and
    (payload ->> 'revision') = revision::text and payload ->> 'kind' = kind and
    payload ->> 'code' = code
  ),
  constraint vera_business_context_units_present check (
    jsonb_typeof(payload -> 'unitIds') = 'array' and
    jsonb_array_length(payload -> 'unitIds') between 1 and 20
  ),
  constraint vera_business_context_revision_uq unique (context_id, revision)
);
create unique index if not exists vera_business_context_code_uq
  on public.vera_business_context(kind, code) where revision = 1;
create index if not exists vera_business_context_kind_idx
  on public.vera_business_context(kind);
alter table public.vera_business_context enable row level security;
revoke all on public.vera_business_context from public, anon, authenticated;
grant select, insert on public.vera_business_context to service_role;
