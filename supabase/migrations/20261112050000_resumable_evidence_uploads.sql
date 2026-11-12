-- Sesiones privadas para confirmar partes sin depender de una sola función HTTP.
create table if not exists public.vera_evidence_uploads (
  id text primary key,
  payload jsonb not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vera_evidence_upload_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint vera_evidence_upload_id_matches check (payload ->> 'id' = id)
);
create index if not exists vera_evidence_uploads_created_idx
  on public.vera_evidence_uploads (created_at);
alter table public.vera_evidence_uploads enable row level security;
revoke all on public.vera_evidence_uploads from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.vera_evidence_uploads to service_role;

-- Una petición de cierre repetida nunca crea dos evidencias para la misma sesión.
create unique index if not exists vera_evidence_one_per_upload_idx
  on public.vera_evidence ((payload ->> 'uploadSessionId'))
  where payload ? 'uploadSessionId';
