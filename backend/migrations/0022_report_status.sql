alter table public.price_reports add column status text not null default 'ok'
 check (status in ('ok','held'));
