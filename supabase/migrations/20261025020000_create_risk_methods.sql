-- Private, append-only qualitative method drafts. No historical risk is changed.
create table if not exists public.vera_risk_methods (
  id text primary key,
  method_id text not null,
  revision integer not null check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vera_risk_methods_revision_uq unique (method_id, revision),
  constraint vera_risk_methods_payload_matches check (
    payload ->> 'id' = id and payload ->> 'methodId' = method_id and
    (payload ->> 'revision') = revision::text and payload ->> 'status' = 'DRAFT' and
    payload ->> 'availableForAssessment' = 'false'
  )
);
create index if not exists vera_risk_methods_method_idx on public.vera_risk_methods(method_id);
alter table public.vera_risk_methods enable row level security;
revoke all on public.vera_risk_methods from public, anon, authenticated;
grant select, insert on public.vera_risk_methods to service_role;
