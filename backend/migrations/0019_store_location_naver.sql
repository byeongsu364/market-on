-- 2026-11-27 점포 핀 위치 출처에 네이버 지도 장소(naver)를 더해요. 화면이 네이버 지도라서
-- 네이버 지도에 표시된 그 가게 자리에 핀을 찍으려면 네이버 장소 좌표를 써요(카카오 좌표는 조금씩 어긋남).
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_location_source_check;
ALTER TABLE stores ADD CONSTRAINT stores_location_source_check
    CHECK (location_source IN ('naver', 'kakao', 'merchant'));
