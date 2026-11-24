# 작업 지시서 012 · [1-1] 품목·시장 API

- 담당: Codex · 지시: Claude · 2026-11-24 · 승인: 병수 (1-1만)
- 로드맵: `docs/design/06-feature-roadmap.md` 1단계 1-1 (A3·A5·E2·E3)
- **계약(정답)**: `frontend/src/types/contract.ts`의 `Market`, `Item`, `Criterion`, `Zone`, `Store`, `MarketMap`, `ActiveSale` 와 `frontend/src/api/items.ts`·`markets.ts`가 부르는 경로. 백엔드를 이 모양에 맞춰요. **프론트는 수정하지 않아요**
- 참고: `02-structure.md` (router → service → repo, SQL은 `db/`에만), `03-ontology-alignment.md` (ID·관계), `04-operational-db.md`, `05-merchant-auth.md` 4장 (지도 `active_sale`)
- 범위: `backend/`만. 패키지 추가 금지. **이번 작업에 인식·가격표·시세 API는 넣지 않아요** (1-2~1-4는 따로 승인)

## 1. `GET /items/{item_id}?lang=ko` → `Item`
| 필드 | 채우는 방법 |
|---|---|
| `item_id` | 엔터티 ID |
| `name` | `lang` 라벨 중 preferred, 없으면 ko preferred, 없으면 `name_ko` |
| `synonyms` | ko synonym·colloquial 라벨 |
| `vision_labels` | kind `vision` 라벨 |
| `criteria` | `hasCriterion` 관계의 criterion 노드: `key`(ID의 `-` 뒤), `text`(lang 라벨 → name_ko), `source`(관계 source의 **제목**, 내부 키 아님) |
| `default_unit` | `soldBy` 관계 중 `props.default = true`의 단위 ID, 없으면 첫 단위, 없으면 `entities.kamis.unit` 기반 `unit:kg` 등 |
| `units` | `soldBy` 단위 ID 전부 (+ default) |
| `labels_i18n` | 언어별 preferred 라벨 |
- 없는 품목·type이 item이 아닌 엔터티 → `404 ITEM_NOT_FOUND`

## 2. `GET /items/search?q=` → `Item[]`
- 라벨 정규화(`label_norm`, 공백 제거·소문자) 기준: **완전 일치 → 앞부분 일치 → 포함** 순서, 같은 순위는 preferred 라벨 우선
- type `item`만, 중복 제거, 최대 10개, `q` 비거나 공백이면 `[]`
- 예: `파` → 대파가 양파보다 앞 (대파 라벨 "파"는 완전 일치) / `scallion` → 대파 / `apple` → 사과

## 3. `GET /markets/nearby?lat=&lng=` → `Market[]`
- `lat`·`lng`가 있으면 거리순(하버사인, Python에서 계산해도 됨), 없으면 이름순
- 좌표가 없는 시장은 목록 끝에, 계약상 `lat`·`lng`가 number라 **좌표 없는 시장은 제외**하고 보고에 적기

## 4. `GET /markets/{market_id}/map?item_id=` → `MarketMap`
- `zones`: `id`, `name`, `x`, `y` (계약에 카테고리·색이 없음 — 프론트는 구역 순서로 색을 정함. **구역 순서를 청과·채소·수산·정육·반찬·떡·분식으로 고정**해서 돌려주기)
- `stores`: `store_id`, `name`, `zone_id`, `sells`(item_id 목록), `map_x`, `map_y`, `hours`(문자열 `"09:00–20:00"`, 없으면 `""`), `highlight`(item_id를 팔면 true), `active_sale`(진행 중 마감세일 중 가장 늦게 올린 것 `{sale_price, regular_price, ends_at}` 또는 null)
- 위치(`map_x`/`map_y`) 없는 점포는 제외하고 개수를 로그로
- 없는 시장 `404 MARKET_NOT_FOUND`

## 5. 시연 시장 데이터를 프론트와 같게
- `scripts/seed_demo_market.py`의 구역 좌표·점포 좌표·판매 품목을 **프론트 mock(`frontend/src/api/mock/data.ts`, `frontend/src/constants/zones.ts`)과 같은 배치**로 맞춰요 (대파·양파 판매 = 채소 구역 A-05~A-07). 다시 돌려도 같은 결과
- 시장 좌표: 실제 시장 이름을 쓰지 않으므로 서울 시청 근처 임의 좌표 대신 **null 대신 쓸 고정 좌표를 상수로** 두고 주석에 "시연용 좌표" 명시

## 6. 계층
- 라우터: `routers/items.py`, `routers/markets.py` (없으면 생성) → 서비스: `services/item_service.py`, `services/market_service.py` → 저장소: `knowledge_repo`·`store_repo`·`sale_repo`
- 응답 스키마: `schemas/item.py`, `schemas/market.py` (Pydantic, 계약 필드 그대로)

## 테스트
- **계약 키 테스트**: 각 응답의 키 집합이 contract.ts 타입 필드와 정확히 같은지 (필드 목록을 테스트 안에 적어 비교)
- `/items/item:green_onion`: criteria 3개, source가 제목, default_unit `unit:bunch`
- `/items/search`: `파`(대파 첫째), `scallion`, `apple`, 빈 문자열
- `/markets/nearby`: 거리순·좌표 없음 제외
- `/markets/market:demo/map?item_id=item:green_onion`: highlight 3곳(A-05~A-07), 구역 6개 순서, 마감세일 올린 점포 `active_sale`
- 404 두 종류
- 기존 테스트 전부 유지

## 하지 말 것
- `frontend/`, `.env` 수정, 0001~0007 수정, 커밋, 패키지 추가, 인식·가격표·시세 API

## 자체 검수
- [ ] `TEST_DATABASE_URL=postgresql://localhost:5432/marketon_test pytest` (샌드박스에서 DB가 막히면 보고 — Claude가 검증)
- [ ] SQL은 `db/`에만, 층 규칙
- [ ] `../.venv/bin/ruff format app scripts tests`

## 보고 (한국어, 한 번)
변경 파일, 계약과 다르게 한 점, 검수 결과, 남은 문제
