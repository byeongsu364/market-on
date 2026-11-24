create table public.store_price_confirmations (
 id bigserial primary key,
 store_id text not null references public.stores(id) on delete cascade,
 item_id text not null references public.entities(id),
 unit_id text not null references public.entities(id),
 price int not null check (price > 0),
 confirmed_by uuid references public.users(id) on delete set null,
 confirmed_at timestamptz not null default now()
);
create index store_price_confirmations_store_item_idx
 on public.store_price_confirmations(store_id, item_id, confirmed_at desc);
