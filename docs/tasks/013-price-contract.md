# 작업 지시서 013 · [1-2] 시세 API 계약 맞추기

- 담당: Codex · 지시: Claude · 2026-11-24 · 승인: 병수 (1-2)
- 로드맵: `docs/design/06-feature-roadmap.md` 1단계 1-2 (A4·A7)
- **계약(정답)**: `frontend/src/types/contract.ts`의 `Price`, `PriceRequest`, `Stat` / `frontend/src/api/price.ts` → `GET /price?item_id=&market_id=&unit=&seen_price=`. **프론트는 수정하지 않아요**
- 재사용: `services/price_service.get_price()`, `db/repositories/price_repo.baseline()` (008에서 만든 것) — 모양만 계약에 맞추고 계산 로직은 살려요
- 범위: `backend/`만. 패키지 추가 금지. 인식·가격표 API는 넣지 않아요

## 1. 응답 필드 규칙 (Price)

| 필드 | 값 |
|---|---|
| `item_id` | 요청 그대로 |
| `unit` | **실제로 돌려준 가격의 단위 ID**. 요청 `unit`으로 환산했으면 그 값, 환산 불가면 aT 조사 단위에 맞는 단위 ID(`unit:kg`, `unit:piece` 등 — 없으면 엔터티 추가는 하지 말고 `unit:at-<unit_sz><unit>` 같은 임시 문자열 대신 **aT 단위 그대로 쓰는 규칙을 보고에 제안**) |
| `reference_price` | **기준 = 그 지역 전통시장 평균**, 요청 단위로 환산, 원 단위 반올림 정수 |
| `seen_price` | 요청에 있으면 그대로 |
| `diff_pct` | `seen_price`가 있으면 `round((seen - ref) / ref * 100)` 정수, 없으면 `null` |
| `region` | 사용한 aT 조사지역 이름 (`서울`), 전국이면 `전국` |
| `observed_on` | 사용한 조사일 `YYYY-MM-DD` |
| `fallback` | 아래 2장 |
| `source` | `"aT 기간별 소매가격 · YYYY-MM-DD 조사"` (사람이 읽는 문장) |
| `by_market_type` | `traditional`·`large_retail` 각각 `Stat`(계약 필드 그대로, 환산 후 평균 가격·조사처 수). 값 없는 쪽은 키 생략 |
| `this_market` | 시장에 `at_mrkt_cd`가 있고 그날 그 조사처 값이 있으면 `{price(환산), name(시장 이름)}`, 아니면 키 생략 |

## 2. 기준값과 대체(fallback) 순서
시장의 `at_sgg_nm`(없으면 전국)에서 **오늘 이하 가장 최근 조사일** 기준
1. 그 지역 **전통시장 평균** 있음 → `fallback: null`
2. 그 지역 전통시장 값 없음 → 그 지역 **전체(전통+대형) 평균** → `fallback: "region_avg"`
3. 지역 값 없음 → **전국 전통시장 평균**(없으면 전국 전체) → `fallback: "national_avg"`, `region: "전국"`
4. 가장 최근 조사일이 **7일보다 오래됨** → 그 값을 쓰되 `fallback: "last_valid"` (1~3보다 우선해서 표시)
5. 14일 안에 값이 하나도 없음 → `404 PRICE_NOT_FOUND`

## 3. 오류
- `item_id`가 없는 품목 → `404 ITEM_NOT_FOUND` (먼저 확인, PRICE_NOT_FOUND와 구분)
- `market_id`가 없는 시장 → `404 MARKET_NOT_FOUND`
- `seen_price` ≤ 0 또는 숫자 아님 → `422`
- `unit`이 그 품목 단위가 아님 → 환산하지 않고 aT 단위로 돌려줌 (오류 아님, `unit` 필드로 알 수 있음)

## 4. 정리
- 기존 `GET /price/{item_id}` 경로 삭제 (프론트가 안 씀), 관련 테스트 정리
- `schemas/price.py`에 계약 모양 `PriceResponse`, `PriceStat`
- 시연 시장(`market:demo`)은 `at_sgg_nm='서울'`, `at_mrkt_cd`는 비움 (가상 시장이라 특정 시장 가격을 보여 주지 않음) — seed 스크립트에서 보장
- `ruff format`

## 테스트
- 계약 키 테스트 (Price, Stat)
- fallback 4가지 + 404 두 종류 + 422
- 대파 kg → 1단(0.8kg) 환산, 사과(10개 단위) 요청 단위 불일치 시 aT 단위 유지
- `diff_pct` 부호·반올림, `this_market` (at_mrkt_cd 있는 시장 fixture)
- 기존 테스트 유지

## 하지 말 것
- `frontend/`, `.env` 수정, 0001~0008 수정, 커밋, 패키지 추가, 인식·가격표 API

## 자체 검수
- [ ] `TEST_DATABASE_URL=postgresql://localhost:5432/marketon_test pytest` (DB가 막히면 보고 — Claude가 검증)
- [ ] 층 규칙, SQL은 `db/`에만, `ruff format`

## 보고 (한국어, 한 번)
변경 파일, 계약과 다른 점, `unit` 규칙 제안, 검수 결과, 남은 문제
