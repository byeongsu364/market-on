# 작업 지시서 035 · 점포 좌표·영업 중·결제 수단, 시장 상세, 가게 위치 저장

- 담당: Codex · 지시: Claude · 2026-11-27 · 승인: 병수 ("오늘 품절은 빼고 남은기능 개발하자")
- 근거: `docs/tasks/030-api-gaps.md` (새 화면이 기다리는 API). 프런트 타입은 `frontend/src/types/contract.ts`의 `StoreExtra`, `MarketExtra`, `MerchantExtras`, `LatLng` — **이 이름·모양을 그대로 맞춤**
- 제외: 오늘 품절(`sold_out_item_ids`), 시장 경계·편의시설 위치(현장 자료 없음 — 지어내지 않음), 단골 수·조회 수(038), 점포별 품종(036)
- 범위: `backend/` + `frontend/`(mock 대신 live 연결·타입) + `docs/tasks/030-api-gaps.md`. 패키지 추가 금지

## 1. 데이터
- 마이그레이션 `0017_store_location.sql`: `stores`에 `lat double precision`, `lng double precision`, `location_verified boolean not null default false`, `payments text[] not null default '{}'`(값: card·cash·transfer·onnuri), `intro text`(80자 이내); `markets`에 `amenities jsonb`(null 허용)
- `backend/scripts/load_market_stores.py`: 상가정보 `lat`/`lon`을 점포 `lat`/`lng`로 저장(`location_verified=false`). 다시 적재해도 상인이 확인한 위치(`location_verified=true`)·`payments`·`intro`는 덮어쓰지 않음
- 경동시장 `amenities`는 **출처 있는 값이 없으므로 넣지 않음**(null → 화면에서 숨김)

## 2. API
- 지도 응답(`GET /markets/{id}/map`)의 점포에: `lat`, `lng`(없으면 null), `category`(store_category id), `naver_name`(= 상호명), `verified`(= location_verified), `open_now`(서울 시각과 `hours`로 계산, hours 없으면 null), `payments`, `intro`. 요청에 `?lat=&lng=`(손님 위치, 선택)가 있으면 `distance_m`(직선 거리, 정수)
- `GET /markets/{id}` (새): `{market_id, name, status, lat, lng, address, store_count(활성 점포), requests(최근 7일 요청 수), amenities}` — 없으면 404
- `/markets/nearby`·시장 검색 응답에도 `address`, `store_count`, `requests`
- `PUT /merchant/store/location` (상인, CSRF): `{lat, lng}` — 시장 중심에서 2km 이내만(아니면 422) → `location_verified=true`
- `PATCH /merchant/store`에 `payments`(위 4개 값만), `intro`(80자, 금칙어 검사는 `services/moderation.check` 재사용)
- `/auth/me` 사용자에 `created_at`
- 계약·mock 갱신

## 3. 화면
- `api/*`에서 mock으로만 쓰던 위 값들을 live 응답으로 쓰게 연결(값이 없으면 지금처럼 숨김 유지). 가게 위치 화면(`StorePin`)은 `PUT /merchant/store/location` 호출. 점포 정보(`StoreEdit`)의 결제 수단·한 줄 소개 저장
- `030-api-gaps.md`에서 끝난 줄 표시(날짜·지시서 번호)

## 4. 테스트
- 마이그레이션 제약(payments 값, intro 길이), 적재 스크립트가 좌표 저장·상인 확인 위치 보존, open_now(영업 전/중/후, 자정 넘김 없는 단순 범위, hours 없음), distance_m, 시장 상세·404·requests 7일, 위치 저장 2km·권한·CSRF, payments/intro 검증·금칙어, me.created_at
- 화면: 위치 저장, 결제 수단 저장, live 값 표시
- 기존 테스트 유지

## 하지 말 것
- 패키지 추가, `.env` 수정, 기존 마이그레이션 수정, 커밋, `marketon` DB 접근(적재는 Claude가 실행), 출처 없는 시장 편의시설·경계 값, 품절 기능

## 자체 검수
- backend `TEST_DATABASE_URL=postgresql:///marketon_test ../.venv/bin/pytest -q`, `ruff format`; frontend `npm run build`·`lint`·`npx vitest run`·`format:check`
