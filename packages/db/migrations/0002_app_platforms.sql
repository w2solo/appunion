create table app_platforms (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  platform text not null,
  package_name text not null,
  created_at timestamptz not null default now()
);

create unique index app_platforms_app_platform_uidx on app_platforms (app_id, platform);
create unique index app_platforms_platform_package_uidx on app_platforms (platform, package_name);
create index app_platforms_platform_idx on app_platforms (platform);

alter table apps drop column if exists store_url;
alter table apps drop column if exists deeplink;
alter table apps drop column if exists platform;

drop index if exists apps_platform_idx;
drop index if exists apps_pool_idx;
create index apps_pool_idx on apps (in_recommend_pool);
