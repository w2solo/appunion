create extension if not exists citext;
create extension if not exists pgcrypto;

create table developers (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  password_hash text not null,
  role text not null default 'developer',
  created_at timestamptz not null default now()
);

create table apps (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references developers(id),
  name text not null,
  icon_url text not null,
  tagline text not null,
  category text not null,
  platform text not null,
  store_url text not null,
  deeplink text,
  review_status text not null default 'pending',
  paused_by_developer boolean not null default false,
  paused_by_ops boolean not null default false,
  rejected_reason text,
  approved_at timestamptz,
  in_recommend_pool boolean not null default false,
  contributed_impressions_7d integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index apps_platform_idx on apps (platform);
create index apps_pool_idx on apps (platform, in_recommend_pool);
create index apps_developer_idx on apps (developer_id);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id),
  key_prefix text not null,
  key_hash text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index api_keys_hash_uidx on api_keys (key_hash);
create unique index api_keys_one_active_uidx on api_keys (app_id) where revoked_at is null;

create table app_reviews (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id),
  actor_id uuid not null references developers(id),
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);

create table impression_events (
  id uuid primary key default gen_random_uuid(),
  host_app_id uuid not null references apps(id),
  target_app_id uuid not null references apps(id),
  client_id uuid not null,
  idempotency_key uuid not null,
  occurred_at timestamptz not null default now()
);

create unique index impressions_host_idem_uidx on impression_events (host_app_id, idempotency_key);
create index impressions_host_time_idx on impression_events (host_app_id, occurred_at);
create index impressions_target_time_idx on impression_events (target_app_id, occurred_at);
create index impressions_dedup_idx on impression_events (host_app_id, target_app_id, client_id, occurred_at);

create table click_events (
  id uuid primary key default gen_random_uuid(),
  host_app_id uuid not null references apps(id),
  target_app_id uuid not null references apps(id),
  client_id uuid not null,
  idempotency_key uuid not null,
  occurred_at timestamptz not null default now()
);

create unique index clicks_host_idem_uidx on click_events (host_app_id, idempotency_key);
create index clicks_host_time_idx on click_events (host_app_id, occurred_at);
create index clicks_target_time_idx on click_events (target_app_id, occurred_at);

create table app_daily_stats (
  app_id uuid not null references apps(id),
  day date not null,
  impressions_received integer not null default 0,
  clicks_received integer not null default 0,
  impressions_given integer not null default 0,
  clicks_given integer not null default 0,
  primary key (app_id, day)
);

create table platform_config (
  id integer primary key default 1,
  grace_days integer not null default 7,
  reciprocity_impressions integer not null default 100,
  impression_dedup_minutes integer not null default 30,
  recommend_cache_seconds integer not null default 30,
  rate_recommend_per_min integer not null default 60,
  rate_list_per_min integer not null default 60,
  rate_impressions_per_min integer not null default 120,
  rate_clicks_per_min integer not null default 60
);

insert into platform_config (id) values (1) on conflict (id) do nothing;

create table anomaly_flags (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id),
  type text not null,
  "window" text not null default '7d',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
