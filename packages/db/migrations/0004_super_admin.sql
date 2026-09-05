alter table platform_config drop column if exists admin_emails;

update developers
  set role = 'developer'
  where email = 'admin@appunions.local';

update developers
  set role = 'admin'
  where email = 'cmlanche@qq.com';
