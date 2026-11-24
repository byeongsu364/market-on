-- Explicit floorplan anchors for the public map contract.
alter table public.zones add column x real not null default 0;
alter table public.zones add column y real not null default 0;
