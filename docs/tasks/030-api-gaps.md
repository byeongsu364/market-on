# 030 · 백엔드에 아직 없는 API (프런트는 mock에서만 씀)

> 2026-11-26 · 지시서 [030](./030-frontend-integration.md) 5장 · 상태: **[제안]** (백엔드 담당 검토 전)
> 프런트는 아래 필드가 없으면 그 기능을 live에서 숨겨요. mock 값은 모두 예시 값이고 `frontend/src/api/mock/geo.ts`, `frontend/src/api/mock/index.ts`에 "예시 값" 주석을 달았어요.
> 타입은 `frontend/src/types/contract.ts` 끝의 030 구역(`StoreExtra`, `MarketExtra`, `VarietyExtra`, `PriceHistory`, `Favorite`, `MultiItemMap`)에 있어요.

| 필요한 것 | 쓰는 화면 | 제안 형태 | 지금 프런트 |
| --- | --- | --- | --- |
| 가격 구간 코드 | Result, Card, 목록의 작은 눈금 | `/price` 응답에 `band`(1~4, 없으면 null) | `utils/priceBand.ts`가 같은 규칙(-30% / +5% / +20%)으로 계산. `band`가 오면 그 값을 씀 |
| 점포 좌표, 카테고리, 네이버 지도에서 열 이름, 현장 확인 여부 | 지도 핀, Route | 지도 응답의 점포에 `lat`, `lng`, `category`(store_category id), `naver_name`, `verified` | 좌표가 없으면 시장 안 지도 자리에 평면도(`MiniMap`). 카테고리는 구역 이름으로 추정 |
| 시장 경계와 편의시설 | MarketInside | 시장(또는 지도 응답)에 `boundary`(좌표 목록), `facilities`(입구·주차장·화장실 `{kind,name,lat,lng}`), 시장 단위 `amenities{parking,toilet,onnuri}` | 없으면 경계·편의시설 표시를 생략 |
| 영업 중, 결제 수단, 점포별 품종, 오늘 품절 | 점포 목록, 검색 거르기, Store | 점포에 `open_now`, `payments`(`card`·`cash`·`transfer`·`onnuri`), `varieties`(variety id), `sold_out_item_ids` | 없으면 그 거르기 칩과 표시를 숨김 |
| 여러 품목 지도 | ShopRoute | `/markets/{id}/map?item=a&item=b` | live는 품목별 `/markets/{id}/map?item_id=`를 여러 번 불러 합침(`api/stores.getMultiItemMap`). 방문 순서는 프런트가 가까운 순으로 계산 |
| 품종 설명과 수확 시기 | Variety, Result | `varieties[]`에 `description`, `description_source`, `harvest`(온톨로지 `harvestPeriod`의 `label`, `from`, `to`) | mock은 `data/rag_docs/apple/varieties.md` 문장과 온톨로지 값만 넣음. 시나노골드·신고는 비움 |
| 품종별 최근 4주 시세 | Result | `/price/history?item=&variety=&weeks=4` → `{points:[{week_start, price}], source}` | live는 표시하지 않음(`api/price.getPriceHistory`가 null) |
| 단골 점포와 알림 | Store, Saved, SaleNew | `/me/favorites`(GET/PUT/DELETE), 웹 푸시 구독(아이폰은 홈 화면에 추가한 뒤) | mock만 |
| 손님 계정 | Login, Signup | 역할 `customer` 추가 | live에서는 손님 가입을 숨기고, 로그인은 지금 계정(상인·시장 관리자·운영자)으로 동작 |
| 가게 위치 저장, 품절 스위치 | StorePin, Merchant | `PUT /merchant/store/location {lat,lng}`, 품목별 품절 `PUT /merchant/store/sold-out` | mock만 |
| 경계·편의시설·공지 편집 | WebMarketAdmin | 이번에는 표시만, 편집은 mock | mock만 |
| 조회 수, 단골 수, 거리 | 목록, Store, Merchant | 점포에 `views_today`, `favorites`, 손님 위치가 있을 때 `distance_m` | mock 예시 값만 |
