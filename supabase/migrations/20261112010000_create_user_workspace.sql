-- Private, versioned workspace for account-owned shortcuts and saved views.
create table if not exists public.vera_user_workspace (
  user_id bigint primary key references public.vera_users(id) on delete cascade,
  payload jsonb not null default '{"favorites":[],"views":[],"recent":[]}'::jsonb,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  constraint vera_user_workspace_shape check (
    jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload -> 'favorites') = 'array'
    and jsonb_typeof(payload -> 'views') = 'array'
    and jsonb_typeof(payload -> 'recent') = 'array'
  )
);
alter table public.vera_user_workspace enable row level security;
revoke all on public.vera_user_workspace from public, anon, authenticated;
grant select, insert, update, delete on public.vera_user_workspace to service_role;
