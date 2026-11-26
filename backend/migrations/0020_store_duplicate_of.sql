-- 2026-11-27 같은 가게가 상가정보에 두 번 올라온 경우(상호·주소·업종이 같고 카카오맵 장소가 하나 이하)
-- 한 점포만 보이게 해요. 나머지는 duplicate_of로 남기는 점포를 가리키고 active=false(지도·목록·점포 수에서 빠짐).
-- 데이터는 지우지 않고, 상가정보를 다시 적재해도 숨긴 상태를 유지해요(_operational.save).
ALTER TABLE stores ADD COLUMN duplicate_of text REFERENCES stores(id) ON DELETE SET NULL;
