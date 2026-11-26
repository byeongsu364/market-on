# 작업 지시서 027 · 시장 안 = 품목별 점포 / 시장 밖 = 시장 마커 + 길 안내

- 담당: Codex · 지시: Claude · 2026-11-26 · 승인: 병수 (네이버 지도)
- 요구 (병수): "시장에 있다면 그 시장의 품목별 구역을 보여 주고, 품목을 고르게 해서 그 품목을 파는 점포를 뿌려 준다. 시장 밖이라면 시장만 마커로 표시하고 클릭하면 구역이 보이게, 그 시장으로 안내한다"
- 기존: 시장 자동 선택(1km, `useFlows`·session), `/markets/nearby`(status listed·active, distance_m), `/markets/{id}/map`(구역·점포·highlight·layout schematic), `MiniMap`, `MarketMap.tsx`(`?item=`), 판매 점포 목록, `MarketRequest`(P-5 "이 시장도 쓰고 싶어요"), `useItemCatalog`
- 디자인: `frontend/DESIGN.md` 최우선 (토큰 색만, 둥근 칩)
- 범위: `backend/`(작은 것) + `frontend/`. **패키지 추가 금지** (네이버 지도는 스크립트 태그). 끝나면 `npm run format`, `ruff format`

## 1. 지도 화면 `/map` 두 모드
- 판단: 현재 위치 기준 가장 가까운 **active** 시장이 1km 안이고 그 시장이 선택돼 있으면 **시장 안 모드**, 아니면(위치 거부 포함) **시장 밖 모드**. 화면 위 토글로 바꿀 수 있음("시장 안 지도" / "주변 시장")
- `?item=`이 있으면 시장 안 모드 + 그 품목 선택 상태로 시작 (결과 화면 "파는 점포 보기"와 호환)

### 1-1. 시장 안 모드
- 상단 **품목 칩**: 이 시장에서 파는 품목만 (`/markets/{id}/items` 새 API — store_items에 있는 품목 + 판매 점포 수, 이름순). "전체"(선택 없음)도
- 칩 선택 → URL `?item=` 갱신 → 기존 `/markets/{id}/map?item=`로 강조 + 아래 목록 (10곳 + 더 보기, 기존 유지)
- **품목을 고르면 그 품목 구역이 지도에서 먼저 보이게**: 강조 점포가 가장 많은 구역으로 스크롤/확대(미니맵 viewBox 조정 또는 스크롤), 구역 이름 위에 "사과 32곳" 같은 개수 표시
- 기존 안내(배치는 예시 · 출처) 유지

### 1-2. 시장 밖 모드 (네이버 지도)
- 네이버 지도 JS v3: `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=<id>` (NCP Maps 신규 키 파라미터. 로드 실패 시 콘솔에 안내만, 화면은 아래 목록 대체)
- 키 전달: 백엔드 **`GET /config/public` → `{naver_map_client_id: string | null}`** (`settings.NAVER_MAP_CLIENT_ID`, **SECRET은 절대 응답에 넣지 않음**). 프론트는 이 값으로 스크립트를 한 번만 동적 로드 (`api/client.ts`의 request 사용, 스크립트 로더는 `utils/naverMap.ts`)
- 지도: 내 위치(있으면) 중심, 없으면 서울 시청. `/markets/nearby`로 받은 시장 마커
  - active: 진한 마커(토큰 색), listed(준비 중): 회색 마커
- 마커 클릭 → **시장 카드**(바텀시트, 기존 StoreSheet 스타일 재사용):
  - active: 시장 이름 · 거리 · **구역 미리보기**(그 시장 `/map`의 `MiniMap`을 작게, 점포 강조 없음) · 품목 수 · [이 시장 둘러보기](시장 선택 + 시장 안 모드) · **[길 안내]**
  - listed: 이름 · 거리 · "아직 Market-On에 없어요" · 기존 `MarketRequest` [이 시장도 쓰고 싶어요] · [길 안내]
- 키가 없거나(null) 로드 실패 → 지도 대신 **시장 목록 카드**(거리순, 같은 시장 카드 내용)로 대체 — 시연이 막히지 않게
- 목록·지도 모두 거리 표시 (1km 미만 m, 이상 km 소수 1자리)

### 1-3. 길 안내
- [길 안내] → 선택 시트: **네이버지도** / 카카오맵
  - 네이버 앱: `nmap://route/public?dlat=<lat>&dlng=<lng>&dname=<이름>&appname=<origin>` (모바일), 실패·데스크톱이면 웹 `https://map.naver.com/p/directions/-/<lng>,<lat>,<이름>/-/transit` (형식은 구현 시 네이버 공식 URL 스킴 문서로 확인, 확인 못 하면 웹 검색 링크 `https://map.naver.com/p/search/<이름>`로)
  - 카카오: `https://map.kakao.com/link/to/<이름>,<lat>,<lng>`
- 출발지는 앱이 현재 위치로 정함 (우리가 위치를 넘기지 않음 — 개인정보)

## 2. 백엔드
- `GET /markets/{id}/items` → `[{item_id, name, store_count}]` (활성 점포만, store_items 기준, 이름순). SQL은 `db/`
- `GET /config/public` (위)
- `/markets/nearby`에 `radius_km`(기본 5, 최대 30) — 시장 밖 지도용 범위. 기존 응답 모양 유지
- 계약·mock·계약 키 테스트

## 3. 테스트
- 백엔드: markets/items(비활성 점포 제외, 개수), config/public에 secret 없음, nearby radius
- 프론트: 모드 판단(1km 안 active → 안, 밖·거부 → 밖, `?item` → 안), 품목 칩 → URL·강조 요청, 가장 많은 구역 표시, 시장 카드(active/listed), 길 안내 URL 두 종류(이름 인코딩), 키 null → 목록 대체, 스크립트 1회 로드
- 기존 테스트 유지

## 하지 말 것
- 패키지 추가, `.env` 수정, 마이그레이션, 커밋, `marketon` DB 접근, 실제 네이버 호출(테스트는 window.naver 모킹), SECRET 노출, 사용자 위치를 외부 링크에 넣기, 새 색

## 자체 검수
- [ ] 프론트 `build`·`lint`·`test`·`format:check`, 백엔드 `pytest`(DB 막히면 보고)·`ruff format`
- [ ] `fetch(`는 `api/client.ts`만, HEX는 토큰 파일만 (네이버 마커 색도 CSS 변수에서 읽기)
- [ ] 실제 네이버 지도·길 안내는 Claude가 브라우저로 확인 (도메인 등록 필요)

## 보고 (한국어, 한 번)
변경 파일, 모드 판단 규칙, 네이버 키 전달 방식, 길 안내 URL, 계약 변경, 검수 결과, 남은 문제
