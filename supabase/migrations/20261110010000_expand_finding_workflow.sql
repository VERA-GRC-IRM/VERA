-- Add detailed findings, optional audit/risk/control relations and validated closure.
alter table public.vera_findings
  alter column control_id drop not null,
  alter column risk_id drop not null,
  add column if not exists audit_id text references public.vera_audit_proposals(id),
  add column if not exists assignee_id integer;

alter table public.vera_findings
  drop constraint if exists vera_findings_control_matches,
  drop constraint if exists vera_findings_risk_matches;

alter table public.vera_findings
  add constraint vera_findings_control_matches check (
    control_id is null or payload ->> 'controlId' = control_id
  ),
  add constraint vera_findings_risk_matches check (
    risk_id is null or payload ->> 'riskId' = risk_id
  ),
  add constraint vera_findings_audit_matches check (
    audit_id is null or payload ->> 'auditId' = audit_id
  ),
  add constraint vera_findings_relation_required check (
    control_id is not null or risk_id is not null or audit_id is not null
  ),
  add constraint vera_findings_status_valid check (
    payload ->> 'status' in ('OPEN', 'PENDING_VALIDATION', 'CLOSED')
  ),
  add constraint vera_findings_severity_valid check (
    payload ->> 'severity' is null or
    payload ->> 'severity' in ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')
  );

create index if not exists vera_findings_audit_idx on public.vera_findings(audit_id);
create index if not exists vera_findings_assignee_idx on public.vera_findings(assignee_id);

alter table public.vera_evidence
  drop constraint if exists vera_evidence_entity_type_check;
alter table public.vera_evidence
  add constraint vera_evidence_entity_type_check
  check (entity_type in ('RISK', 'CONTROL', 'AUDIT', 'FINDING'));
