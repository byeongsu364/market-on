# 작업 지시서 007 · 운영 테이블 스키마 + 설정 이름 정리 + 적재 정리 기능

- 담당: Codex · 지시: Claude · 2026-11-24
- 기준 문서: **`docs/design/04-operational-db.md`** (명세), `docs/design/02-structure.md` (층 규칙), `docs/design/03-ontology-alignment.md` (ID 규칙)

## 1. 마이그레이션 `backend/migrations/0006_operational.sql`
04 문서 2장의 테이블 7개: `price_observations`, `markets`, `zones`, `stores`, `store_items`, `today_picks`, `price_reports`, `media`
- 컬럼·타입·FK·UNIQUE·인덱스는 04 문서 그대로. 시간 컬럼 `not null default now()`, 이름 컬럼 not null
- check 제약: `price_observations.market_type in ('traditional','large_retail','wholesale','unknown')`, `se_cd in ('01','02')`, `media.kind in ('photo','audio')`, `price_reports.method in ('price_tag_photo','manual')`, `store_items.source in ('merchant','sbiz_guess','manual')`, `stores.source in ('sbiz','manual')`, `markets.source in ('std_market_data','manual')`, `price > 0`
- `today_picks.valid_until` 기본값: 오늘 23:59:59 Asia/Seoul (`(date_trunc('day', now() at time zone 'Asia/Seoul') + interval '1 day' - interval '1 second') at time zone 'Asia/Seoul'`)
- 엔터티 FK는 `on delete restrict` (지식 데이터를 지울 때 운영 데이터가 조용히 사라지지 않게). 운영 테이블끼리는 부모 삭제 시 cascade (`stores`→`store_items`·`today_picks`), `price_reports.store_id`는 `set null`
- `entities.type` check에 `store_category`는 이미 있음. 0001~0005 수정 금지

## 2. 저장소 함수 (`db/repositories/`)
- `price_repo.py`: `upsert_observations(conn, rows) -> (inserted, updated)` (UNIQUE 기준 upsert), `latest_exmn_date(conn, item_id, variety_id=None, on_date=None)`, `insert_report(...)`, `list_reports(conn, market_id, item_id=None, since=None)`
- `store_repo.py`: 시장·구역·점포 upsert/조회, `stores_selling(conn, market_id, item_id)`, `set_store_items(conn, store_id, item_ids, source)`
- `stock_repo.py` → **`merchant_repo.py`로 이름 변경** (오늘 추천: `insert_pick`, `active_picks(conn, market_id, now)`). 02 문서 트리도 같이 수정
- `media_repo.py`: `insert_media`, `get_media`
- 이번 작업은 SQL 함수(`price_baseline`)를 만들지 않아요 (다음 작업 008)

## 3. 설정 이름 정리 (팀 `.env` 양식에 맞춤)
`core/config.py`
- 추가: `DATA_GO_KR_KEY` (공공데이터포털 공통 키: aT·상가정보·기상청·이달의 식재료), `FOODSAFETY_KEY`, `NAVER_MAP_CLIENT_ID`, `NAVER_MAP_CLIENT_SECRET`, `MEDIA_DIR` (기본 `backend/storage` 절대경로)
- 삭제: `KAMIS_SERVICE_KEY`, `KMA_SERVICE_KEY`, `KAKAO_REST_API_KEY` (코드에서 쓰는 곳 정리)
- **`.env`, `.env.example`은 수정하지 않아요** (팀원 담당). 대신 보고에 "`.env.example`에 필요한 변수 목록"을 적어 주세요
- `clients/stores.py` docstring 등 카카오 언급 → 상가정보(소진공) 기준으로 정리, `clients/weather.py`는 `DATA_GO_KR_KEY` 사용
- `.gitignore`에 `backend/storage/` 추가

## 4. 적재 정리 기능 (지난 작업 남은 문제)
파일에서 지운 엔터티·출처가 DB에 남는 문제
- `load_ontology --prune`: 온톨로지 파일에 없는 엔터티 삭제. 단 **운영 테이블이나 문서·조각이 참조하는 엔터티는 지우지 않고 경고 목록으로 출력** (FK restrict로 실패하지 않게 미리 확인)
- `load_sources --prune`: 파일에 없는 출처 삭제. 문서가 참조 중이면 지우지 않고 경고
- `load_all --prune`이 세 가지(sources·ontology·documents) 모두에 적용. 순서: 문서 정리 → 엔터티 → 출처
- `--prune` 없으면 지금과 똑같이 동작

## 5. 데이터 파일
- `git show "origin/Water:docs/data/aT_소매_품목코드표_20261120.csv"` 내용을 `data/kamis/aT_소매_품목코드표_20261120.csv`로 저장 (원본 BOM·인코딩 유지). `data/SOURCES.md`에 한 줄 추가 (aT 소매 품목코드표, 신태빈 정리, Water 브랜치, 2026-11-20 기준, 공공데이터 이용허락 제한 없음)
- 지금은 온톨로지에 반영하지 않아요 (008에서 사용)

## 6. 테스트
- 0006 적용 후 제약 확인: 잘못된 market_type·price 0 거부, 점포 삭제 시 store_items cascade, 엔터티 삭제가 store_items 때문에 막힘
- `upsert_observations` 두 번 → 두 번째 inserted 0
- `today_picks` 기본 valid_until이 오늘 서울 시간 23:59:59
- prune: 파일에서 품목 하나 지우고 `--prune` → 삭제됨 / 그 품목이 store_items에 있으면 남고 경고
- 기존 테스트 전부 통과

## 하지 말 것
- `.env`·`.env.example` 수정, 팀원 문서 수정, 0001~0005 수정, 커밋
- aT API 호출 코드 (008), 라우터

## 자체 검수 항목
- [ ] `TEST_DATABASE_URL=postgresql://localhost:5432/marketon_test pytest` 전부 통과 (샌드박스에서 DB가 막히면 그렇다고 보고 — Claude가 검증)
- [ ] `grep -rn "KAMIS_SERVICE_KEY\|KAKAO\|KMA_SERVICE_KEY" backend` 결과 없음
- [ ] 층 규칙, SQL은 `db/`에만, 키 없음

## 보고 형식 (한국어)
변경 파일, `.env.example`에 필요한 변수 목록, 검수 결과, 04 문서와 다르게 한 점, 남은 문제. 모든 검수가 끝난 뒤 한 번만.
