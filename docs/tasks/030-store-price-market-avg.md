# 작업 지시서 030 · 점포 가격 기본값 = 시장 평균, 상인 확인 우선

- 담당: Codex · 지시: Claude · 2026-11-26 · 승인: 병수 ("응 그렇게 하고 커밋하자")
- 결정 **[확정]**
  1. 경동시장 초기 점포 가격은 **시장 평균(aT 이 시장 조사값)** 으로 보여 줘요. 현장 확인은 하지 않아요.
  2. 평균값을 점포마다 DB에 복사하지 않아요. **응답을 만들 때** 가격이 없는 점포에 채워요 (`price_observations`의 이 시장 값 한 번 조회).
  3. 표시 순서: **상인 확인(7일 이내) → 손님 제보 → 시장 평균 → 없음**
- 기존: `services/store_price_service.py` `aggregate()`는 상인 확인이 **가장 최근 손님 제보보다 새로울 때만** 상인 값. `services/market_service.py` `market_map()`이 판매 점포마다 `store_price(...)[1]`을 `Store.price`로 넣음(결과 화면·지도 시트·점포 페이지가 모두 이 값을 씀). `price_service.get_price(..., market_id=)`가 `this_market`(aT 이 시장 값, 단위 환산됨)을 돌려줌.
- 범위: `backend/` + `frontend/`. 패키지 추가 금지. 끝나면 `ruff format`, `npm run format`

## 1. 백엔드
- `aggregate()`: 7일 이내 상인 확인이 있으면 **손님 제보가 더 새로워도** 표시값은 상인 값(`source='merchant'`). 첫 번째 반환값(손님 집계)은 그대로. `merchant_service.prices`(상인 화면)는 바꾸지 않음.
- `schemas/market.py` `StorePrice.source`에 `'market_avg'` 추가, 필드 추가 `observed_on: date | None = None`.
- `market_map(conn, market_id, item_id, unit)`:
  - `item_id`가 있을 때 **요청당 한 번** `get_price(conn, item_id, market_id=market_id, unit_id=unit)` 호출 → `this_market`이 있으면 시장 평균 `StorePrice(price=this_market.price, unit=응답 unit, source='market_avg', reporters=0, latest_at=조사일 00:00 KST, observed_on=조사일, stale=조사일이 오늘(서울)보다 이전, merchant_confirmed=False)`
  - 판매 점포 중 `store_price(...)[1]`이 `None`인 점포에만 이 값을 넣음
  - `this_market`이 없거나 `PRICE_NOT_FOUND`면 채우지 않음(지금처럼 `None`). **지역·전국 평균은 "시장 평균"으로 쓰지 않음**
  - 정렬: 실제 가격(새 것) → 실제 가격(지난 것) → 시장 평균 → 없음
- 계약·mock 갱신

## 2. 화면 (`StorePriceDisplay`)
- `source === 'market_avg'` → `2,000원 / 1개` + 작게 **"시장 평균 · aT 11월 25일 조사"** (점포 실제 가격이 아님을 분명히). `stale` 스타일은 쓰지 않음(조사값은 원래 하루 지남)
- 상인 확인·손님 제보 표시는 그대로

## 3. 테스트
- aggregate: 상인 확인(3일 전) + 손님 제보(1일 전) → 표시 merchant / 8일 전 상인 확인 → 손님 값
- market_map: 제보 없는 판매 점포 → market_avg, 제보 있는 점포 → customers, 상인 확인 점포 → merchant, 안 파는 점포 → None, `this_market` 없음 → None, `get_price` 1회만 호출, 정렬 순서
- 화면: market_avg 문구, 기존 문구 유지
- 기존 테스트 유지 (순서 규칙이 바뀐 테스트만 고치고 보고)

## 하지 말 것
- 패키지 추가, `.env` 수정, 마이그레이션 추가, 커밋, `marketon` DB 접근, 점포별 가격 행 삽입, 판정 문구("싸요"·"추천")

## 자체 검수
- [ ] 백엔드 `pytest`(DB 막히면 보고)·`ruff check`·`ruff format`, 프론트 `build`·`lint`·`test`·`format:check`
- [ ] SQL은 `db/`

## 보고 (한국어, 한 번)
변경 파일, 바뀐 테스트와 이유, 검수 결과, 남은 문제
