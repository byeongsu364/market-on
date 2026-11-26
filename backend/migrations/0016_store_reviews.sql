create table public.store_reviews (
 id bigserial primary key,
 store_id text not null references public.stores(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 rating smallint not null check (rating between 1 and 5),
 body text not null check (char_length(body) between 1 and 200),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(store_id,user_id)
);
create index on public.store_reviews(store_id,updated_at desc);
create table public.review_daily_writes (
 user_id uuid not null references public.users(id) on delete cascade,
 day date not null,
 writes smallint not null check (writes between 1 and 10),
 primary key(user_id,day)
);
