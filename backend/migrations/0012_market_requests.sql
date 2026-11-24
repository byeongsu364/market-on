alter table public.markets add column status text not null default 'active'
 check (status in ('listed','active'));
alter table public.markets add column store_count int;
create table public.market_demand (
 market_id text references public.markets(id) on delete cascade,
 day date not null, device_hash text not null,
 kind text not null check (kind in ('nearby','request')),
 primary key (market_id,day,device_hash,kind)
);
create table public.market_applications (
 id bigserial primary key,
 market_id text not null references public.markets(id) on delete restrict,
 manager_org text not null check (manager_org in ('상인회','관리사무소','기타')),
 contact text not null check (length(contact) between 1 and 80),
 store_count int check (store_count >= 0), note text check (length(note)<=200),
 admin_user_id uuid references public.users(id) on delete set null,
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_by uuid references public.users(id) on delete set null, reviewed_at timestamptz
);
create unique index market_applications_pending_idx on public.market_applications(market_id)
 where status='pending';
