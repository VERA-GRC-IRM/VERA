-- Findings can be linked to an audit, risk, or control and keep an approval trail.
alter table public.vera_findings
  alter column control_id drop not null,
  alter column risk_id drop not null,
  add column if not exists audit_id text references public.vera_audit_proposals(id);

update public.vera_findings f
set audit_id = f.payload ->> 'auditId'
where f.payload ->> 'auditId' is not null
  and exists (
    select 1 from public.vera_audit_proposals a where a.id = f.payload ->> 'auditId'
  );
update public.vera_findings f
set payload = jsonb_set(f.payload, '{auditId}', 'null'::jsonb)
where f.payload ->> 'auditId' is not null and f.audit_id is null;

alter table public.vera_findings
  drop constraint if exists vera_findings_control_matches,
  drop constraint if exists vera_findings_risk_matches,
  add constraint vera_findings_control_matches check ((payload ->> 'controlId') is not distinct from control_id),
  add constraint vera_findings_risk_matches check ((payload ->> 'riskId') is not distinct from risk_id),
  add constraint vera_findings_audit_matches check ((payload ->> 'auditId') is not distinct from audit_id),
  add constraint vera_findings_has_source check (
    num_nonnulls(audit_id, risk_id, control_id) > 0
  );

drop index if exists public.vera_findings_evaluation_key;
create index if not exists vera_findings_evaluation_idx
  on public.vera_findings(control_id, risk_id, (payload ->> 'evaluationVersion'));
create index if not exists vera_findings_audit_idx on public.vera_findings(audit_id);
