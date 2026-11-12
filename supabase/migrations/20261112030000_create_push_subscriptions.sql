-- Private Web Push enrollment and at-most-once event delivery per device.
create table if not exists public.vera_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references public.vera_users(id) on delete cascade,
  endpoint_hash text not null unique,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vera_push_subscriptions_user on public.vera_push_subscriptions(user_id);
create table if not exists public.vera_push_deliveries (
  subscription_id uuid not null references public.vera_push_subscriptions(id) on delete cascade,
  event_key text not null,
  status text not null default 'CLAIMED' check (status in ('CLAIMED', 'SENT', 'FAILED')),
  created_at timestamptz not null default now(),
  primary key (subscription_id, event_key)
);
alter table public.vera_push_subscriptions enable row level security;
alter table public.vera_push_deliveries enable row level security;
revoke all on public.vera_push_subscriptions, public.vera_push_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.vera_push_subscriptions, public.vera_push_deliveries to service_role;
