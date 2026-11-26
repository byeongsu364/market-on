# 작업 지시서 025 · [2-5] 품종별 기준시세

- 담당: Codex · 지시: Claude · 2026-11-26 · 승인: 병수 ("세부 품목이 있으면 그 가격을 보여줘야 한다")
- 팀 설계: `docs/Ontology Architecture.md` — 관계 **`hasGrade`(품목 → 품종·등급, KAMIS 코드 매핑)**, C4 "품종: 칩 선택 (예: 대파/쪽파)". ID 규칙 `docs/design/03-ontology-alignment.md`: **`variety:<품목>-<품종>`** (예: `variety:apple-hongro`)
- 기존: `entities.type`에 `variety` 허용(0005), `price_observations.variety_id` 열 있음, `scripts/update_prices.py`(aT periodRetail, 지금은 품목 엔터티의 코드 하나만), `price_service.get_price`, `GET /price`, 결과 화면 가격 비교(`PriceCompare`), 사진 가격표(`price_tag.unit_text`), `/ask` price·`/chat` `reference_price` 도구
- aT 코드표: `data/kamis/aT_소매_품목코드표_20261120.csv`
- 범위: `data/ontology/` + `backend/` + `frontend/`. 패키지 추가 금지. 끝나면 `ruff format`, `npm run format`

## 1. 온톨로지 (`data/ontology/items.yaml`)
- 품종 엔터티 (aT 코드표에서 우리 5품목에 있는 것만):
  | id | 이름 | aT 코드 | 라벨(동의어) |
  |---|---|---|---|
  | `variety:apple-fuji` | 후지 | 400/411/05 | 후지, 부사, fuji |
  | `variety:apple-hongro` | 홍로 | 400/411/07 | 홍로 |
  | `variety:apple-shinano-gold` | 시나노골드 | 400/411/08 | 시나노골드, 황금사과 아님(라벨 넣지 말 것) |
  | `variety:pear-shingo` | 신고 | 400/412/01 | 신고, 신고배 |
  | `variety:sweet_persimmon-fuyu` | 부유 | 400/416/00 | 부유 |
  | `variety:green_onion-daepa` | 대파 | 200/246/00 | (라벨 없음 — 품목과 같음) |
  | `variety:onion-onion` | 양파 | 200/245/00 | (라벨 없음) |
  - 각 품종 `kamis`: 품목과 같은 형식(`ctgry_cd, item_cd, vrty_cd, grd_cd: 04, unit, unit_sz` — 코드표의 대표 조사단위)
  - 관계: 품목 → `hasGrade` → 품종. 품목의 **기본 품종**은 `props: {default: true}` (사과=후지, 나머지는 하나뿐)
  - 품목 엔터티의 `kamis`는 기본 품종 코드 그대로 둠 (기존 호환)
  - 쪽파(246/02)는 대파의 품종이 아니라 별도 품목 → 이번엔 넣지 않음 (30품목 작업 때)
- `tests/test_ingest_files.py`의 엔터티 수 등 고정 숫자 갱신, aT 코드표 대조 검사가 품종 코드도 확인하게

## 2. 수집 (`scripts/update_prices.py`)
- 품목마다 **`hasGrade` 품종 전부**의 코드로 수집 (품종이 없으면 지금처럼 품목 코드)
- 관측값 저장 시 `item_id`(품목)와 `variety_id`(품종) 둘 다 채움 — 품종 코드로 받은 행은 그 품종의 부모 품목으로
- 기존 관측값(`variety_id` 비어 있음)은 코드(item_cd·vrty_cd)로 품종을 채우는 **일회성 백필**을 `update_prices --backfill-varieties` 옵션으로 (마이그레이션 아님)

## 3. API · 계약
```ts
type VarietyPrice = {
  variety_id: string; name: string;
  reference_price: number | null; unit: string;   // 요청 단위로 환산 (기존 환산 재사용)
  observed_on: string | null; count: number;      // 전통시장 조사처 수
  default: boolean;
};
PriceView += { variety_id: string | null; variety_name: string | null; varieties: VarietyPrice[] };
```
- `GET /price?item_id=&market_id=&unit=&seen_price=&variety_id=` — `variety_id`가 있으면 그 품종 기준으로 `reference_price`·`diff_pct`. 없으면 **기본 품종**(없으면 지금처럼 품목 전체)
- `varieties`는 품종이 2개 이상일 때만 채움(하나면 빈 배열 — 화면에서 칩 안 보이게). 대체(fallback) 규칙은 품종별로 기존과 같게(지역 평균 → 전국 → 최근 유효값)
- 품종이 다른 품목의 것이면 422
- `/ask` price 응답·`/chat` `reference_price` 도구 결과에 `varieties` 포함 (도구 인자에 `variety_id?` 추가). chat 값 대조 근거에 품종별 가격도 들어가게
- 계약 키 테스트

## 4. 가격표 → 품종
- `/recognize`의 `price_tag`에 **`variety_id: string | null`** 추가: `unit_text`와 Gemma 라벨·가격표 글자에 품종 라벨(후지·부사·홍로…)이 있으면 그 품종 (`knowledge/ontology`의 라벨 매칭 재사용, 그 품목의 품종만). 프롬프트에 "가격표에 품종 이름(예: 부사, 홍로)이 보이면 `variety_text`로" 한 줄 추가, 없으면 null
- **사진 모양으로 품종을 추측하지 않음** (프롬프트에도 명시)

## 5. 화면
- 결과 화면 가격 비교: `varieties`가 있으면 **품종 칩**(이름 · 기준시세 · "조사 N곳") — 선택된 품종 기준으로 ±% 다시 요청(`variety_id`). 기본 선택: 가격표에서 읽은 품종 → 없으면 기본 품종. 칩 아래 작게 "품종은 가격표나 상인에게 확인해 주세요"
- 확인 화면(사진 → 확인): 가격표에서 품종을 읽었으면 "품종: 홍로 (가격표에서 읽었어요)" 표시, 바꿀 수 있게
- 품종이 하나뿐인 품목은 지금 화면 그대로
- 가격 제보(`POST /price-reports`)는 이번엔 품종 없이 그대로 (점포 가격은 확장 기능)
- DESIGN.md·토큰만, 새 색 금지

## 6. 테스트
- 온톨로지 적재: 품종 엔터티·`hasGrade`·기본 품종, aT 코드표 일치
- 수집: 품종별 행 → item_id·variety_id, 백필 옵션
- 가격: 기본 품종 기준, variety_id 지정 시 그 품종, 품종 1개면 varieties 빈 배열, 다른 품목 품종 422, 품종별 fallback
- 가격표: "부사 3개 5,000원" → variety apple-fuji, 품종 글자 없음 → null, 다른 품목 품종 라벨 무시
- ask·chat 가격에 varieties, 계약 키
- 프론트: 품종 칩 표시·선택 시 재요청·기본 선택(가격표 품종 우선), 품종 1개면 칩 없음
- 기존 테스트 유지

## 하지 말 것
- 패키지 추가, `.env` 수정, 기존 마이그레이션 수정(새 마이그레이션 필요 없음), 커밋, `marketon` DB 접근, 실제 aT·LLM 호출, 사진으로 품종 추정, 새 색

## 자체 검수
- [ ] 백엔드 `pytest`(DB 막히면 보고 — Claude가 실제 aT 수집·화면 검증)·`ruff format`, 프론트 `build`·`lint`·`test`·`format:check`

## 보고 (한국어, 한 번)
변경 파일, 품종 엔터티 목록, 수집·백필 방법, 계약 변경, 검수 결과, 남은 문제
