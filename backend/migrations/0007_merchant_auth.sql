create table public.users (
 id uuid primary key,
 login_id text not null unique check (login_id ~ '^[a-z0-9_]{4,20}$'),
 password_hash text not null,
 role text not null check (role in ('merchant','operator')),
 status text not null check (status in ('pending','approved','rejected','disabled')),
 store_id text references public.stores(id) on delete restrict,
 created_at timestamptz not null default now(), approved_at timestamptz,
 approved_by uuid references public.users(id) on delete set null,
 failed_logins int not null default 0 check (failed_logins >= 0), locked_until timestamptz,
 check ((role='merchant' and store_id is not null) or (role='operator' and store_id is null))
);
create unique index users_approved_store_idx on public.users(store_id) where status='approved';
create table public.sessions (
 id text primary key check (id ~ '^[a-f0-9]{64}$'),
 user_id uuid not null references public.users(id) on delete cascade,
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 last_seen_at timestamptz not null default now()
);
create index sessions_user_idx on public.sessions(user_id);
create table public.closing_sales (
 id bigserial primary key,
 store_id text not null references public.stores(id) on delete cascade,
 item_id text not null references public.entities(id) on delete restrict,
 sale_price int not null check (sale_price > 0),
 regular_price int check (regular_price > sale_price),
 unit_id text references public.entities(id) on delete restrict,
 note text check (char_length(note) <= 40),
 starts_at timestamptz not null default now(), ends_at timestamptz not null,
 status text not null default 'active' check (status in ('active','ended')),
 created_at timestamptz not null default now(),
 check (ends_at > starts_at),
 check (ends_at <= (((starts_at at time zone 'Asia/Seoul')::date + 1)::timestamp at time zone 'Asia/Seoul'))
);
create index closing_sales_store_idx on public.closing_sales(store_id, created_at desc);
create table public.store_views (
 store_id text not null references public.stores(id) on delete cascade,
 sale_id bigint references public.closing_sales(id) on delete cascade,
 day date not null default (now() at time zone 'Asia/Seoul')::date,
 count int not null default 0 check (count >= 0)
);
-- PostgreSQL primary keys cannot contain expressions; this is the specified logical key.
create unique index store_views_day_idx on public.store_views(store_id, (coalesce(sale_id,0)), day);
drop table public.today_picks;
