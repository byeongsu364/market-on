alter table public.users drop constraint users_role_check;
alter table public.users drop constraint users_check;
alter table public.users add column market_id text references public.markets(id) on delete restrict;
alter table public.users add constraint users_role_check check (role in ('merchant','operator','market_admin'));
alter table public.users add constraint users_check check (
 (role='merchant' and store_id is not null and market_id is null) or
 (role='operator' and store_id is null and market_id is null) or
 (role='market_admin' and store_id is null and market_id is not null)
);
