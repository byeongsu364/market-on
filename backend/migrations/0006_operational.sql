-- Operational observations and market data; entity references must survive pruning.
create table public.price_observations (
 id bigserial primary key,
 exmn_ymd date not null,
 se_cd text not null check (se_cd in ('01','02')),
 ctgry_cd text, item_cd text not null, vrty_cd text not null, grd_cd text not null,
 item_nm text not null, vrty_nm text not null, grd_nm text not null,
 sgg_nm text not null, mrkt_cd text not null, mrkt_nm text not null,
 market_type text not null check (market_type in ('traditional','large_retail','wholesale','unknown')),
 unit text, unit_sz text,
 price int not null check (price > 0),
 item_id text references public.entities(id) on delete restrict,
 variety_id text references public.entities(id) on delete restrict,
 source text not null,
 fetched_at timestamptz not null default now(),
 unique(source, exmn_ymd, se_cd, mrkt_cd, item_cd, vrty_cd, grd_cd)
);
create index price_observations_item_date_idx on public.price_observations(item_id, exmn_ymd desc);
create index price_observations_code_date_idx on public.price_observations(item_cd, vrty_cd, exmn_ymd desc);
create table public.markets (
 id text primary key, name_ko text not null,
 region_id text references public.entities(id) on delete restrict,
 address text, lat double precision, lng double precision,
 at_mrkt_cd text, at_sgg_nm text, floorplan_svg text,
 source text not null check (source in ('std_market_data','manual'))
);
create table public.zones (
 id text primary key,
 market_id text not null references public.markets(id) on delete cascade,
 store_category_id text references public.entities(id) on delete restrict,
 name_ko text not null, svg_path text
);
create table public.stores (
 id text primary key,
 market_id text not null references public.markets(id) on delete cascade,
 zone_id text references public.zones(id) on delete set null,
 name_ko text not null,
 store_category_id text references public.entities(id) on delete restrict,
 sbiz_id text unique, sbiz_industry text, floor text, map_x real, map_y real,
 hours jsonb,
 source text not null check (source in ('sbiz','manual')),
 active boolean default true
);
create table public.store_items (
 store_id text references public.stores(id) on delete cascade,
 item_id text references public.entities(id) on delete restrict,
 source text not null check (source in ('merchant','sbiz_guess','manual')),
 primary key(store_id,item_id)
);
create table public.today_picks (
 id bigserial primary key,
 store_id text not null references public.stores(id) on delete cascade,
 item_id text not null references public.entities(id) on delete restrict,
 price int check (price > 0), note text,
 origin_region_id text references public.entities(id) on delete restrict,
 valid_until timestamptz not null default ((date_trunc('day', now() at time zone 'Asia/Seoul') + interval '1 day' - interval '1 second') at time zone 'Asia/Seoul'),
 created_at timestamptz not null default now()
);
create table public.media (
 id uuid primary key, kind text not null check (kind in ('photo','audio')),
 path text not null, mime text, bytes int,
 created_at timestamptz not null default now()
);
create table public.price_reports (
 id bigserial primary key,
 market_id text not null references public.markets(id) on delete cascade,
 store_id text references public.stores(id) on delete set null,
 item_id text not null references public.entities(id) on delete restrict,
 unit_id text references public.entities(id) on delete restrict,
 quantity numeric default 1, price int not null check (price > 0),
 method text not null check (method in ('price_tag_photo','manual')),
 media_id uuid references public.media(id) on delete set null,
 reported_at timestamptz not null default now()
);
