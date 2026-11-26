# 030 · 백엔드에 아직 없는 API (프런트는 mock에서만 씀)

> 2026-11-26 · 지시서 [030](./030-frontend-integration.md) 5장 · 상태: **[제안]** (백엔드 담당 검토 전)
> 프런트는 아래 필드가 없으면 그 기능을 live에서 숨겨요. mock 값은 모두 예시 값이고 `frontend/src/api/mock/geo.ts`, `frontend/src/api/mock/index.ts`에 "예시 값" 주석을 달았어요.
> 타입은 `frontend/src/types/contract.ts` 끝의 030 구역(`StoreExtra`, `MarketExtra`, `VarietyExtra`, `PriceHistory`, `Favorite`, `MultiItemMap`)에 있어요.

| 필요한 것 | 쓰는 화면 | 제안 형태 | 지금 프런트 |
| --- | --- | --- | --- |
| 가격 구간 코드 | Result, Card, 목록의 작은 눈금 | `/price` 응답에 `band`(1~4, 없으면 null) | `utils/priceBand.ts`가 같은 규칙(-30% / +5% / +20%)으로 계산. `band`가 오면 그 값을 씀 |
| 점포 좌표, 카테고리, 네이버 지도에서 열 이름, 현장 확인 여부 | 지도 핀, Route | 지도 응답의 점포에 `lat`, `lng`, `category`(store_category id), `naver_name`, `verified` | 완료 · 2026-11-27 · 035, live 좌표·카테고리·상호·확인 여부 |
| 시장 경계와 편의시설 | MarketInside | 시장(또는 지도 응답)에 `boundary`(좌표 목록), `facilities`(입구·주차장·화장실 `{kind,name,lat,lng}`), 시장 단위 `amenities{parking,toilet,onnuri}` | 없으면 경계·편의시설 표시를 생략 |
| 영업 중, 결제 수단, 점포별 품종, 오늘 품절 | 점포 목록, 검색 거르기, Store | 점포에 `open_now`, `payments`(`card`·`cash`·`transfer`·`onnuri`), `varieties`(variety id), `sold_out_item_ids` | 부분 완료 · 2026-11-27 · 035, 영업 중·결제 수단 live 연결. 품종은 036 완료 · 오늘 품절은 제외 |
| 여러 품목 지도 | ShopRoute | `/markets/{id}/map?item=a&item=b` | live는 품목별 `/markets/{id}/map?item_id=`를 여러 번 불러 합침(`api/stores.getMultiItemMap`). 방문 순서는 프런트가 가까운 순으로 계산 |
| 품종 설명과 수확 시기 | Variety, Result | `varieties[]`에 `description`, `description_source`, `harvest`(온톨로지 `harvestPeriod`의 `label`, `from`, `to`) | 완료 · 2026-11-27 · 036, 지정 설명 3개·출처·수확 시기 live 연결 |
| 품종별 최근 4주 시세 | Result | `/prices/history?item_id=&variety_id=&market_id=&weeks=4` → `{points:[{week_start, price}], source}` | 완료 · 2026-11-27 · 036, 주별 평균·빈 주 null·live 그래프 |
| 단골 점포와 알림 | Store, Saved, SaleNew | `/me/favorites`(GET/PUT/DELETE), 웹 푸시 구독(아이폰은 홈 화면에 추가한 뒤) | mock만 |
| 점포 리뷰 | Store, 지도 점포 시트 | `GET /stores/{id}/reviews`, `PUT/DELETE /stores/{id}/reviews/me` | 완료 · 2026-11-27 · 0016, live/mock 표시·작성·수정·삭제 |
| 손님 계정 | Login, Signup | 역할 `customer` 추가 | 완료 · 2026-11-27 · 0015, live/mock 손님 가입과 로그인 지원 |
| 가게 위치 저장, 품절 스위치 | StorePin, Merchant | `PUT /merchant/store/location {lat,lng}`, 품목별 품절 `PUT /merchant/store/sold-out` | 부분 완료 · 2026-11-27 · 035, 가게 위치 live 저장. 품절 스위치는 제외 |
| 경계·편의시설·공지 편집 | WebMarketAdmin | 이번에는 표시만, 편집은 mock | mock만 |
| 조회 수, 단골 수, 거리 | 목록, Store, Merchant | 점포에 `views_today`, `favorites`, 손님 위치가 있을 때 `distance_m` | 부분 완료 · 2026-11-27 · 035, 지도 `distance_m`. 037 상인 조회 통계 완료 · 단골 수는 제외 |

## 화면을 만들며 더 찾은 빈자리

| 필요한 것 | 쓰는 화면 | 제안 형태 | 지금 프런트 |
| --- | --- | --- | --- |
| 시장 하나 조회 | `/?market=`, Store | `GET /markets/{id}` | 완료 · 2026-11-27 · 035, 시장 상세 live 연결 |
| 시장 주소·점포 수·준비 중 시장 요청 수 | Main, WebMain, Markets | 시장 응답에 `address`, `store_count`, `requests` | 완료 · 2026-11-27 · 035, 주소·활성 점포 수·최근 7일 요청 수 |
| 점포 가격의 품종 | 검색 결과의 작은 눈금 | 점포 가격(`StorePrice`)에 `variety_id` | 고른 품종 기준시세와 단위가 같을 때만 견줌 |
| 알림 설정 | Saved | `/me/notifications {sales, season}` | mock만(이 기기 localStorage) |
| 가격표 품종의 원문 글자 | ScanConfirm | 인식 응답 `price_tag`에 `variety_text`(예: "부사") | "가격표에서 {품종}으로 읽었어요"로 씀 |
| 품종 동의어 | 직접 입력, 검색 | 품종에 `synonyms`(부사 ↔ 후지) | 완료 · 2026-11-27 · 036, 품종 동의어로 검색하고 `variety_id` 반환 |
| 레시피 목록과 재료-품목 연결 | Shop "레시피로 장보기" | `/recipes`, 재료별 `item_id` | 넣지 않음 |
| 품목과 카테고리 연결 | SearchEmpty "수산 점포에서 찾아보세요" | 품목에 `store_category` | "{시장} 점포 지도에서 보기"로 대신 |
| 운영자용 시장 목록 | WebAdmin "요청만 있는 시장", "이용 중인 시장" | `/admin/markets?status=` | 완료 · 2026-11-27 · 037, listed/active live 목록 |
| 상인 주별·요일별 조회 수, 길 안내 연 횟수 | WebMerchant 막대그래프 | `/merchant/stats?days=7` | 완료 · 2026-11-27 · 037, 서울 날짜별 조회·길 안내 live 그래프 |
| 가입 날짜 | Pending "신청한 날" | `/auth/me`에 `created_at` | 완료 · 2026-11-27 · 035, `created_at` 응답 |
| 마감세일 품종 | SaleNew 품종 칩 | `SaleCreate`에 `variety_id` | 완료 · 2026-11-27 · 036, 칩 선택·품목 소속 검증·공개 응답 |
| 점포 결제 수단·한 줄 소개 저장 | StoreEdit | `PATCH /merchant/store`에 `payments`, `intro` | 완료 · 2026-11-27 · 035, live 저장 |

### 035 부분 완료 · 2026-11-27

- 영업 중·결제 수단·한 줄 소개: 지도 live 응답 및 StoreEdit 저장 완료. 품종은 036에서 완료. 오늘 품절은 제외.
- 가게 위치: `PUT /merchant/store/location` 및 StorePin live 저장 완료. 품절 스위치는 제외.
- 거리: 손님 좌표가 있는 지도 요청의 `distance_m` 완료. 037 상인 조회 통계 완료 · 단골 수는 제외.
- 시장 `amenities`는 nullable 계약만 추가. 출처 있는 현장 값이 없어 null 유지. 경계·편의시설 위치는 제외.


### 036 완료 · 2026-11-27

- 품종 설명 3개(지정 원문만)·출처 제목·수확 시기·동의어: `/price` 및 `/prices`의 `varieties`, `GET /items/{item_id}/varieties` live 연결.
- 품종 동의어 검색: `/items/search?q=부사` → 사과 및 `variety_id`.
- 최근 4주 시세: `GET /prices/history?item_id=&variety_id=&market_id=&weeks=4` (1~8주, 선택 `unit`). 지역 우선·전통시장 평균·기존 단위 환산, 빈 주 null. Variety·Result live 표시.
- 세일 품종: `POST /merchant/sales`의 선택 `variety_id`, 공개 응답 `variety_id`·`variety_name`, SaleNew 칩.
- 점포 품종: `GET/PATCH /merchant/store`의 `varieties: {item_id: [variety_id]}`, 지도 점포의 `varieties: [variety_id]`, StoreEdit 저장.
- 마이그레이션: `0018_variety_links.sql`. 가격 구간·품절·단골 알림 등 나머지 빈자리는 기존 상태 유지.


### 037 완료 · 2026-11-27

- `POST /stores/{store_id}/directions`: CSRF, 기기 해시 메모리로 점포당 10분 중복 제외. 네이버·카카오 길 안내 클릭에서 호출.
- `GET /merchant/stats?days=7` (1~28일): 점포·세일 합산 조회, 길 안내, 빈 날 0, 서울 날짜. 단골 수는 null.
- `GET /market-admin/stats`: 자기 시장 활성 점포·승인/대기 상인·최근 7일 조회·승인 상인 최근 세일 활동.
- `GET /admin/markets?status=listed|active`: 요청 수·최근 신청, 활성 시장 통계. 운영자 두 목록 live 연결.
- 마이그레이션 `0020_store_directions.sql`. 단골·오늘 품절 기능은 범위 제외.
