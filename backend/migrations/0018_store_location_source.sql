-- 2026-11-27 점포 위치 출처. 상인이 확인한 위치(merchant) 말고도 카카오맵 장소 검색으로 찾은 위치(kakao)를 지도 핀으로 써요.
-- 상가정보(sbiz) 좌표는 건물 단위라 출처가 없는 것(null)으로 두고 핀으로 내보내지 않아요.
ALTER TABLE stores
    ADD COLUMN location_source text CHECK (location_source IN ('kakao', 'merchant')),
    ADD COLUMN kakao_place_id text;
UPDATE stores SET location_source = 'merchant' WHERE location_verified;
