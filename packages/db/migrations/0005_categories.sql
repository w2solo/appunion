create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references categories(id),
  created_at timestamptz not null default now()
);

create index if not exists categories_parent_idx on categories (parent_id);
create unique index if not exists categories_root_name_uidx
  on categories (lower(name)) where parent_id is null;
create unique index if not exists categories_child_name_uidx
  on categories (parent_id, lower(name)) where parent_id is not null;

alter table apps add column if not exists subcategory text not null default '其他';

update apps set category = '工具', subcategory = '其他' where category = 'tools';
update apps set category = '效率', subcategory = '其他' where category = 'productivity';
update apps set category = '内容', subcategory = '其他' where category = 'content';
update apps set category = '社交', subcategory = '其他' where category = 'social';
update apps set category = '游戏', subcategory = '其他' where category = 'game';
update apps set category = '教育', subcategory = '其他' where category = 'education';
update apps set category = '生活', subcategory = '其他' where category = 'lifestyle';
update apps set category = '其他', subcategory = '未分类' where category = 'other';
