-- Empty, private library. No existing risk assessment is reclassified.
create table if not exists public.vera_risk_library (
  id text primary key,
  kind text not null check (kind in ('CATEGORY', 'TEMPLATE')),
  code text,
  parent_id text references public.vera_risk_library(id) on delete restrict,
  template_id text,
  revision integer,
  category_id text references public.vera_risk_library(id) on delete restrict,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vera_risk_library_shape check (
    (kind = 'CATEGORY' and code is not null and template_id is null and revision is null and category_id is null)
    or
    (kind = 'TEMPLATE' and code is null and parent_id is null and template_id is not null
      and revision > 0 and category_id is not null)
  ),
  constraint vera_risk_library_payload_matches check (
    payload ->> 'id' = id and payload ->> 'kind' = kind and
    (payload ->> 'code') is not distinct from code and
    (payload ->> 'parentId') is not distinct from parent_id and
    (payload ->> 'templateId') is not distinct from template_id and
    (payload ->> 'revision') is not distinct from revision::text and
    (payload ->> 'categoryId') is not distinct from category_id
  )
);
create unique index if not exists vera_risk_library_category_code_uq
  on public.vera_risk_library(code) where kind = 'CATEGORY';
create unique index if not exists vera_risk_library_revision_uq
  on public.vera_risk_library(template_id, revision) where kind = 'TEMPLATE';
create index if not exists vera_risk_library_category_idx
  on public.vera_risk_library(category_id) where kind = 'TEMPLATE';
alter table public.vera_risk_library enable row level security;
revoke all on public.vera_risk_library from public, anon, authenticated;
grant select, insert on public.vera_risk_library to service_role;
