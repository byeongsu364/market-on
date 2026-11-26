-- 사진 촬영 위치를 줄인 값 (손님이 동의했을 때만 저장, 2026-11-26)
-- 정확한 좌표는 저장하지 않음: 1km 안 가장 가까운 시장 ID와 소수 둘째 자리(약 1km) 좌표만
alter table public.media add column photo_market_id text references public.markets(id) on delete set null;
alter table public.media add column photo_lat numeric(5, 2) check (photo_lat between -90 and 90);
alter table public.media add column photo_lng numeric(6, 2) check (photo_lng between -180 and 180);
