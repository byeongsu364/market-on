# 작업 지시서 017 · [P-3] 점포별 가격 표시 (손님 제보 집계 + 상인 확인)

- 담당: Codex · 지시: Claude · 2026-11-24 · 승인: 병수 (P-3)
- 설계: **`docs/design/07-pull-growth.md` 2장 "믿을 수 있게"**, 3-3 "가격을 올린 점포가 먼저 보임"
- 기존: `price_reports`(0006·0009, 1-4에서 저장), `/markets/{id}/map?item_id=`, 결과 화면 판매 점포 목록(1-5, 지금 "가격 정보 준비 중"), 상인 홈
- 디자인: `frontend/DESIGN.md` 최우선 (판정·과장 문구 금지, 새 색 금지)
- 범위: `backend/` + `frontend/`. 패키지 추가 금지. 끝나면 `npm run format`, `ruff format`

## 1. 집계 규칙 (조회할 때 계산, 저장 테이블 없음)
점포 하나·품목 하나에 대해:
1. 최근 **7일** 안의 그 점포 제보만 (`store_id` 있는 것). 7일 지나면 숨김
2. 각 제보를 **요청 단위의 1단위 가격**으로 바꿈: `price / quantity` 후 단위 환산 (기존 `price_service`의 `factor_kg`·`count` 환산 재사용, 환산 못 하는 제보는 제외)
3. **기기 하나당 최신 1건만** (`device_hash`별 최신)
4. 중앙값 m을 구하고, 값이 3개 이상이면 **m의 ±30% 밖은 제외**(혼자 튀는 값). 남은 값의 중앙값 = 표시 가격
5. `reporters` = 남은 값의 기기 수, `latest_at` = 남은 제보 중 가장 최근 시각
6. `stale` = `latest_at`이 **오늘(Asia/Seoul) 이전**이면 true (화면에서 날짜와 함께 흐리게)
- 규칙 숫자(7일·30%)는 서비스 상수로 한 곳에

## 2. 상인 확인 (선택 기능)
- 마이그레이션 **`0010_store_price_confirmations.sql`**: `store_price_confirmations(id, store_id → stores on delete cascade, item_id → entities, unit_id → entities, price int check (price>0), confirmed_by → users on delete set null, confirmed_at timestamptz default now())`, 인덱스 `(store_id, item_id, confirmed_at desc)`. 0001~0009 수정 금지
- `GET /merchant/prices`: 내 점포 취급 품목별 손님 집계(1장 결과, 품목 기본 단위) + 내 마지막 확인
- `POST /merchant/prices/confirm` `{item_id, unit?, price}`: 내 점포 취급 품목만, 가격 10원~1천만 원. 손님 집계 가격을 그대로 확인하거나 고쳐서 확인. 기존 상인 인증·CSRF 규칙 그대로
- 표시 규칙: **7일 안의 상인 확인이 최신 손님 제보보다 나중이면** 상인 확인 가격을 보여 주고 `source: "merchant"`, 아니면 손님 집계 `source: "customers"`. 손님 제보가 없어도 상인 확인만으로 표시 가능

## 3. API · 계약
`GET /markets/{id}/map?item_id=&unit=` 의 각 점포에 `price` 추가 (item_id 없으면 모두 null):
```ts
type StorePrice = {
  price: number;            // 요청 단위 1단위 가격 (원, 정수 반올림)
  unit: string;             // unit 엔터티 id (unit 없으면 품목 default_unit)
  source: 'customers' | 'merchant';
  reporters: number;        // source=customers일 때 기기 수, merchant면 0
  latest_at: string;        // ISO
  stale: boolean;
  merchant_confirmed: boolean; // 상인 확인이 있고 7일 안이면 true (source와 별개 배지)
} | null;
MapStore += { price: StorePrice }
MerchantPriceRow = { item_id; name; unit; customers: StorePrice | null; my_confirmation: { price; confirmed_at } | null }
```
- `contract.ts`·mock 함께 갱신, 계약 키 테스트 추가
- 점포 목록 정렬: item_id가 있을 때 **가격 있는 점포 먼저**(stale 아닌 것 → stale), 그다음 기존 순서

## 4. 화면
- **결과 화면 판매 점포 목록**(1-5의 "가격 정보 준비 중" 자리):
  - customers: "1,800원 / 1개" + 작게 **"손님 3명 확인 · 오늘 14:20"** (오늘이 아니면 "11월 22일 14:20", stale이면 흐리게 — 기존 muted 토큰)
  - merchant: "1,800원 / 1개" + **"상인 확인 · 오늘 09:10"**
  - `merchant_confirmed`이고 source가 customers면 "상인 확인" 작은 배지 추가
  - 가격 없으면 지금처럼 "가격 정보 준비 중"
  - 손님이 본 가격(현장 가격)이 있어도 점포 간 "가장 싼 곳" 같은 순위·강조 **금지** (컨셉: 이걸 살까)
- 지도 점포 바텀시트·점포 공개 페이지(`/s/:storeId`)에도 같은 표시 (선택한 품목이 있을 때)
- **상인 홈**: "손님이 본 오늘 가격" 카드 — 품목별 손님 집계 + **[확인]** 버튼(그 가격 그대로) + [고쳐서 확인](가격 입력). 확인하면 "상인 확인 · 시각"으로 바뀜. 문구: "손님이 가격표를 찍으면 여기에 쌓여요. 확인을 누르면 손님 화면에 '상인 확인'이 붙어요"
- 덤(1-5 검수에서 나온 것): **직접 입력으로 들어온 결과 화면에서 "인식 라벨" 줄 숨기기**

## 5. 테스트
- 백엔드(집계 함수는 DB 없이 단위 테스트):
  - 기기당 최신 1건, ±30% 제외(값 3개 이상일 때만), 7일 지난 값 숨김, stale(어제 값), 단위 환산(3개 5,000원 → 1개 1,667원, 1kg 제보 → 1단 요청 시 factor_kg), 환산 불가 제외
  - source 결정: 상인 확인이 최신이면 merchant, 손님 제보가 더 최신이면 customers + merchant_confirmed true, 8일 지난 확인은 무시
  - API(DB): map 응답 `price`·정렬, `/merchant/prices`·`confirm` (남의 점포 품목 422/403, 취급 안 하는 품목 422, 비로그인 401, CSRF 없음 403), 계약 키
- 프론트: 결과 목록 customers/merchant/null 표시, stale 흐림, 상인 확인 버튼 → POST, 직접 입력 결과에 인식 라벨 없음

## 하지 말 것
- 패키지 추가, `.env` 수정, 0001~0009 수정, 커밋, 점포 가격 순위·"최저가" 강조, 판정 문구, 새 색, 집계 결과 저장 테이블

## 자체 검수
- [ ] 프론트 `build`·`lint`·`test`·`format:check`, 백엔드 `pytest`(DB 막히면 보고 — Claude가 검증)·`ruff format`
- [ ] SQL은 `db/`, `fetch(`는 `api/client.ts`만, HEX는 토큰 파일만, 140자 넘는 줄 없음

## 보고 (한국어, 한 번)
변경 파일, 집계 규칙 구현 위치, 계약 변경, 검수 결과, 남은 문제
