-- Private, bounded report queue. The API is the only client of this table.
create table if not exists public.vera_report_jobs (
  id uuid primary key,
  owner_id bigint not null references public.vera_users(id) on delete cascade,
  owner_role text not null,
  request_key uuid not null,
  format text not null check (format in ('csv', 'pdf')),
  filters jsonb not null,
  status text not null default 'QUEUED' check (status in ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  claim_token uuid,
  lease_until timestamptz,
  cancel_requested boolean not null default false,
  result_base64 text,
  result_source_ids jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  unique (owner_id, request_key),
  constraint vera_report_jobs_result_state check
    ((status = 'COMPLETED' and result_base64 is not null and result_source_ids is not null)
      or (status <> 'COMPLETED' and result_base64 is null))
);
create index if not exists vera_report_jobs_claim on public.vera_report_jobs
  (status, lease_until, created_at) where status in ('QUEUED', 'RUNNING');
create index if not exists vera_report_jobs_owner on public.vera_report_jobs
  (owner_id, created_at desc);
alter table public.vera_report_jobs enable row level security;
revoke all on public.vera_report_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.vera_report_jobs to service_role;

create or replace function public.claim_vera_report_job()
returns setof public.vera_report_jobs
language plpgsql security definer set search_path = public
as $$
begin
  return query
  with candidate as (
    select id from public.vera_report_jobs
    where (status = 'QUEUED' or (status = 'RUNNING' and lease_until < now()))
      and attempts < 3 and cancel_requested = false and expires_at > now()
    order by created_at, id
    for update skip locked limit 1
  )
  update public.vera_report_jobs job
     set status = 'RUNNING', attempts = attempts + 1,
         claim_token = gen_random_uuid(), lease_until = now() + interval '4 minutes',
         updated_at = now()
    from candidate where job.id = candidate.id
    returning job.*;
end;
$$;
revoke all on function public.claim_vera_report_job() from public, anon, authenticated;
grant execute on function public.claim_vera_report_job() to service_role;
