alter table platform_config
  add column if not exists admin_emails text[] not null default '{}';
