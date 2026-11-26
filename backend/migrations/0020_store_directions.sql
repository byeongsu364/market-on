create table public.store_directions (
 store_id text not null references public.stores(id) on delete cascade,
 day date not null,
 count int not null default 0 check (count >= 0),
 primary key(store_id, day)
);
