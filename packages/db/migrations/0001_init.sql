CREATE TABLE developers (
  id text PRIMARY KEY NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'developer',
  created_at integer NOT NULL
);
CREATE UNIQUE INDEX developers_email_uidx ON developers (email);

CREATE TABLE apps (
  id text PRIMARY KEY NOT NULL,
  developer_id text NOT NULL REFERENCES developers(id),
  name text NOT NULL,
  icon_url text NOT NULL,
  tagline text NOT NULL,
  category text NOT NULL,
  subcategory text NOT NULL DEFAULT '其他',
  review_status text NOT NULL DEFAULT 'pending',
  paused_by_developer integer NOT NULL DEFAULT 0,
  paused_by_ops integer NOT NULL DEFAULT 0,
  rejected_reason text,
  approved_at integer,
  in_recommend_pool integer NOT NULL DEFAULT 0,
  contributed_impressions_7d integer NOT NULL DEFAULT 0,
  list_size integer NOT NULL DEFAULT 10,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
CREATE INDEX apps_pool_idx ON apps (in_recommend_pool);
CREATE INDEX apps_developer_idx ON apps (developer_id);

CREATE TABLE app_platforms (
  id text PRIMARY KEY NOT NULL,
  app_id text NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  platform text NOT NULL,
  package_name text NOT NULL,
  created_at integer NOT NULL
);
CREATE UNIQUE INDEX app_platforms_app_platform_uidx ON app_platforms (app_id, platform);
CREATE UNIQUE INDEX app_platforms_platform_package_uidx ON app_platforms (platform, package_name);
CREATE INDEX app_platforms_platform_idx ON app_platforms (platform);

CREATE TABLE api_keys (
  id text PRIMARY KEY NOT NULL,
  app_id text NOT NULL REFERENCES apps(id),
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  created_at integer NOT NULL,
  revoked_at integer
);
CREATE UNIQUE INDEX api_keys_hash_uidx ON api_keys (key_hash);
CREATE UNIQUE INDEX api_keys_one_active_uidx ON api_keys (app_id) WHERE revoked_at IS NULL;

CREATE TABLE app_reviews (
  id text PRIMARY KEY NOT NULL,
  app_id text NOT NULL REFERENCES apps(id),
  actor_id text NOT NULL REFERENCES developers(id),
  action text NOT NULL,
  reason text,
  created_at integer NOT NULL
);

CREATE TABLE impression_events (
  id text PRIMARY KEY NOT NULL,
  host_app_id text NOT NULL REFERENCES apps(id),
  target_app_id text NOT NULL REFERENCES apps(id),
  client_id text NOT NULL,
  idempotency_key text NOT NULL,
  occurred_at integer NOT NULL
);
CREATE UNIQUE INDEX impressions_host_idem_uidx ON impression_events (host_app_id, idempotency_key);
CREATE INDEX impressions_host_time_idx ON impression_events (host_app_id, occurred_at);
CREATE INDEX impressions_target_time_idx ON impression_events (target_app_id, occurred_at);
CREATE INDEX impressions_dedup_idx ON impression_events (host_app_id, target_app_id, client_id, occurred_at);

CREATE TABLE click_events (
  id text PRIMARY KEY NOT NULL,
  host_app_id text NOT NULL REFERENCES apps(id),
  target_app_id text NOT NULL REFERENCES apps(id),
  client_id text NOT NULL,
  idempotency_key text NOT NULL,
  occurred_at integer NOT NULL
);
CREATE UNIQUE INDEX clicks_host_idem_uidx ON click_events (host_app_id, idempotency_key);
CREATE INDEX clicks_host_time_idx ON click_events (host_app_id, occurred_at);
CREATE INDEX clicks_target_time_idx ON click_events (target_app_id, occurred_at);

CREATE TABLE app_daily_stats (
  app_id text NOT NULL REFERENCES apps(id),
  day text NOT NULL,
  impressions_received integer NOT NULL DEFAULT 0,
  clicks_received integer NOT NULL DEFAULT 0,
  impressions_given integer NOT NULL DEFAULT 0,
  clicks_given integer NOT NULL DEFAULT 0,
  PRIMARY KEY (app_id, day)
);

CREATE TABLE categories (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  parent_id text,
  created_at integer NOT NULL
);
CREATE INDEX categories_parent_idx ON categories (parent_id);
CREATE UNIQUE INDEX categories_root_name_uidx ON categories (lower(name)) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX categories_child_name_uidx ON categories (parent_id, lower(name)) WHERE parent_id IS NOT NULL;

CREATE TABLE platform_config (
  id integer PRIMARY KEY DEFAULT 1,
  grace_days integer NOT NULL DEFAULT 7,
  reciprocity_impressions integer NOT NULL DEFAULT 100,
  impression_dedup_minutes integer NOT NULL DEFAULT 30,
  recommend_cache_seconds integer NOT NULL DEFAULT 30,
  rate_recommend_per_min integer NOT NULL DEFAULT 60,
  rate_list_per_min integer NOT NULL DEFAULT 60,
  rate_impressions_per_min integer NOT NULL DEFAULT 120,
  rate_clicks_per_min integer NOT NULL DEFAULT 60
);
INSERT INTO platform_config (id) VALUES (1);

CREATE TABLE anomaly_flags (
  id text PRIMARY KEY NOT NULL,
  app_id text NOT NULL REFERENCES apps(id),
  type text NOT NULL,
  "window" text NOT NULL DEFAULT '7d',
  created_at integer NOT NULL,
  resolved_at integer
);
