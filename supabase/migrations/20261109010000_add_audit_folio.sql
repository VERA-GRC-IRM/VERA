-- Keep the technical UUID separate from the human-facing audit folio.
create sequence if not exists public.vera_audit_folio_seq;

alter table public.vera_audit_proposals
  add column if not exists folio integer;

with numbered as (
  select id, row_number() over (order by created_at, id)::integer as folio
  from public.vera_audit_proposals
  where folio is null
)
update public.vera_audit_proposals proposal
set folio = numbered.folio
from numbered
where proposal.id = numbered.id;

select setval(
  'public.vera_audit_folio_seq',
  coalesce((select max(folio) from public.vera_audit_proposals), 1),
  exists(select 1 from public.vera_audit_proposals)
);

alter table public.vera_audit_proposals
  alter column folio set default nextval('public.vera_audit_folio_seq'),
  alter column folio set not null;

create unique index if not exists vera_audit_proposals_folio_idx
  on public.vera_audit_proposals (folio);
