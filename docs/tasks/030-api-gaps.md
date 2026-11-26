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

## 화면을 만들며 더 찾은 빈자리

| 필요한 것 | 쓰는 화면 | 제안 형태 | 지금 프런트 |
| --- | --- | --- | --- |
| 시장 하나 조회 | `/?market=`, Store | `GET /markets/{id}` | 위치 없이 `/markets/nearby`를 불러 그 안에서 찾음 |
| 시장 주소·점포 수·준비 중 시장 요청 수 | Main, WebMain, Markets | 시장 응답에 `address`, `store_count`, `requests` | 값이 없으면 그 줄을 숨김 |
| 점포 가격의 품종 | 검색 결과의 작은 눈금 | 점포 가격(`StorePrice`)에 `variety_id` | 고른 품종 기준시세와 단위가 같을 때만 견줌 |
| 알림 설정 | Saved | `/me/notifications {sales, season}` | mock만(이 기기 localStorage) |
| 가격표 품종의 원문 글자 | ScanConfirm | 인식 응답 `price_tag`에 `variety_text`(예: "부사") | "가격표에서 {품종}으로 읽었어요"로 씀 |
| 품종 동의어 | 직접 입력, 검색 | 품종에 `synonyms`(부사 ↔ 후지) | 품목 단위로만 검색 |
| 레시피 목록과 재료-품목 연결 | Shop "레시피로 장보기" | `/recipes`, 재료별 `item_id` | 넣지 않음 |
| 품목과 카테고리 연결 | SearchEmpty "수산 점포에서 찾아보세요" | 품목에 `store_category` | "{시장} 점포 지도에서 보기"로 대신 |
| 운영자용 시장 목록 | WebAdmin "요청만 있는 시장", "이용 중인 시장" | `/admin/markets?status=` | 넣지 않음 |
| 상인 주별·요일별 조회 수, 길 안내 연 횟수 | WebMerchant 막대그래프 | `/merchant/stats?weeks=` | 넣지 않고 "이 세일을 본 사람"만 |
| 가입 날짜 | Pending "신청한 날" | `/auth/me`에 `created_at` | 뺌 |
| 마감세일 품종 | SaleNew 품종 칩 | `SaleCreate`에 `variety_id` | 넣지 않음 |
| 점포 결제 수단·한 줄 소개 저장 | StoreEdit | `PATCH /merchant/store`에 `payments`, `intro` | 넣지 않음 |
