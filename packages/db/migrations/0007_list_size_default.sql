alter table apps alter column list_size set default 10;
update apps set list_size = 10 where list_size = 5;
