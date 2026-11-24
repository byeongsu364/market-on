-- Anonymous device identity for consumer reports; preserve existing quantities.
alter table public.price_reports add column device_hash text not null default '';
create index price_reports_market_item_date_idx on public.price_reports(market_id, item_id, reported_at desc);
create index price_reports_device_date_idx on public.price_reports(device_hash, reported_at desc);
