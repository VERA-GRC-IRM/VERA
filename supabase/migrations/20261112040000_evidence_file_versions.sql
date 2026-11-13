-- Una revisión crea otro registro inmutable. La restricción evita dos sucesores
-- para la misma versión, incluso si dos usuarios cargan a la vez.
create unique index if not exists vera_evidence_one_next_version_idx
  on public.vera_evidence ((payload ->> 'previousVersionId'))
  where payload ? 'previousVersionId';
