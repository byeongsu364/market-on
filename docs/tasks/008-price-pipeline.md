# 작업 지시서 008 · aT 시세 수집 + 기준시세 조회 + price_service

- 담당: Codex · 지시: Claude · 2026-11-24
- 기준 문서: `docs/design/04-operational-db.md` 3·4·5장, `docs/design/02-structure.md` (층 규칙), `docs/design/00-wayket-reuse.md` 2장
- 참고: `git show "origin/Water:docs/data/API_데이터확인.md"` (aT API 실제 요청·응답 형식, 시장 구분, 주의사항)
- 데이터: `data/kamis/aT_소매_품목코드표_20261120.csv` (83품목·108품종), `data/kamis/n8n_가격조회목록_v1.csv` (Wayket 과일 평균 무게)

## 목표
온톨로지에 KAMIS 코드가 있는 품목의 aT 소매가격을 하루 1회 받아 `price_observations`에 쌓고, "이 품목 기준시세가 얼마인지(전통시장·대형유통·이 시장)"를 한 함수로 돌려줘요.

## 1. 클라이언트 `clients/at_price.py` (기존 `clients/kamis.py`를 이름 변경)
- 엔드포인트 `https://apis.data.go.kr/B552845/periodRetail/price` (기간별 소매가격). 키 `settings.DATA_GO_KR_KEY`
- `fetch_period_retail(ctgry_cd, item_cd, vrty_cd=None, start: date, end: date) -> list[dict]`
  - 파라미터: `serviceKey`, `returnType=JSON`, `pageNo`, `numOfRows=1000`, `cond[exmn_ymd::GTE]`/`LTE` (YYYYMMDD), `cond[ctgry_cd::EQ]`, `cond[item_cd::EQ]`, 선택 `cond[vrty_cd::EQ]`, `cond[se_cd::EQ]=01`, `cond[grd_cd::EQ]=04`
  - 페이지가 남으면 계속 (totalCount 기준)
  - 응답 `response.body.items.item` (항목이 1개면 dict일 수 있으니 리스트로 통일), 에러 형식 `OpenAPI_ServiceResponse.cmmMsgHeader.errMsg` → `AppError('AT_API_ERROR', ...)`
  - `LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR` → 30초 기다렸다 최대 2번 재시도
  - 호출 사이 최소 1.1초 간격 (모듈 수준 마지막 호출 시각)
  - HTTP는 `core/http.get_sync` 경유. 키가 URL 로그에 찍히지 않게 (로그에서 serviceKey 가리기)
  - 키가 없으면 `AppError('AT_NOT_CONFIGURED', ..., 503)`

## 2. 온톨로지에 KAMIS 코드 채우기
- `scripts/sync_kamis_codes.py`: `data/ontology/*.yaml`의 품목 중 `kamis`가 비어 있는 것을 aT 품목코드표에서 이름으로 찾아 **후보를 출력만** (자동 수정 안 함). 사람이 YAML에 옮겨 적어요
- 샘플 5품목(`green_onion`, `onion`, `apple`, `pear`, `sweet_persimmon`)의 `kamis`는 코드표 값으로 YAML에 직접 채워 주세요: `{ctgry_cd, item_cd, vrty_cd, grd_cd: "04", unit, unit_sz}`. 대파는 `246/00`
- `entities.kamis` 형식 문서화 (`data/RAG_FORMATS.md`)

## 3. 수집 스크립트 `scripts/update_prices.py`
- 대상: `entities` 중 `kamis`가 있는 품목 (repo 함수로 조회)
- 기본 기간: 최근 7일 (주말·공휴일은 데이터 없음). `--days N`, `--date YYYY-MM-DD`(끝 날짜), `--item item:green_onion`(하나만)
- 응답 행 → `price_observations` upsert: `market_type`은 `utils/market_type.classify_market_type`, `price`=`exmn_dd_prc`(정수, 빈 값·0은 건너뜀), `item_id`·`variety_id`는 코드로 엔터티 매핑, `source='at_period_retail'`
- 끝에 요약: 품목별 받은 행 수·추가·변경·건너뜀, 실패한 품목
- 한 품목 실패해도 나머지는 계속

## 4. 기준시세 조회
### `db/repositories/price_repo.py`
- `baseline(conn, item_id, *, on_date, sgg_nm=None, market_at_cd=None, lookback_days=14) -> dict | None`
  - `on_date` 이하에서 그 품목의 **가장 최근 조사일**을 고르고 그날 값으로 계산 (조사일이 `on_date - lookback_days` 보다 오래되면 None)
  - 반환: `exmn_ymd`, `unit`, `unit_sz`, `traditional {avg, min, max, n}`, `large_retail {…}`, `all {…}`, `this_market {price, mrkt_nm} | None` (market_at_cd가 있으면)
  - `sgg_nm`을 주면 그 지역만. 그 지역 값이 없으면 전국으로 대체하고 `scope='national'` 표시 (있으면 `scope='region'`)
  - 품종(variety)이 여러 개면 온톨로지 `kamis.vrty_cd` 품종만 사용
- SQL은 이 파일에만

### `services/price_service.py`
- `get_price(conn, item_id, *, market_id=None, on_date=None, unit_id=None) -> PriceView`
  - `market_id`가 있으면 `markets.at_sgg_nm`·`at_mrkt_cd` 사용
  - **단위 환산**: aT 조사 단위 → 사용자 단위. 온톨로지 `soldBy` 관계 `props.factor_kg` 사용 (예: 대파 1단 = 0.8kg). aT 단위가 kg/g이면 kg 기준으로 환산, 개수 단위(개·포기·마리)는 `per_unit` 그대로. 환산이 불가능하면 aT 단위 그대로 + `converted=false`
  - `unit_id` 없으면 `soldBy`의 `props.default=true` 단위, 그것도 없으면 aT 단위
  - `compare(seen_price, quantity=1)` 헬퍼: 기준(전통시장 평균 우선, 없으면 전체) 대비 % (음수 = 더 쌈)
- `schemas/price.py`: `PriceView` (기준일, 범위 scope, 단위, 환산 여부, 전통시장·대형유통·이 시장 가격(환산 후), 출처 문구 "aT 기간별 소매가격, YYYY-MM-DD 조사")
- 라우터 `routers/price.py`: `GET /price/{item_id}?market_id=&unit_id=&seen_price=` → `PriceView` (+ seen_price 있으면 비교 결과)

## 5. 적재 정리 기능 수정 (007 남은 문제)
- `load_ontology --prune`에서 **`chunk_entities`만 참조하는 엔터티는 지워요** (조각 태그는 파생 데이터, FK cascade). 운영 테이블·`documents`·`entity_relations`(다른 엔터티가 가리킴)이 참조하면 지금처럼 경고 후 건너뜀
- 엔터티를 지운 뒤 영향받은 문서는 다시 태깅되도록 해당 문서들의 content_hash를 비우거나 재태깅 함수 호출 (방법은 구현에 맞게, 보고에 적기)

## 6. 테스트
- aT 응답 고정 파일 `tests/fixtures/at_period_retail_green_onion.json`: Water 문서의 응답 형식으로 경동(전통)·B-유통(대형)·가락도매(se_cd 02)·빈 가격 행 포함 10행 정도 + 에러 응답 파일 1개
- `core.http.get_sync`를 monkeypatch: 페이지 넘김, 1개 항목 dict 응답, 에러 응답, 초당 제한 재시도(대기 시간은 monkeypatch로 0), serviceKey 로그 가림
- DB: update_prices 두 번 → 두 번째 추가 0 / baseline 전통·대형 평균 값 / 최근 조사일 선택(주말 건너뜀) / 지역 없을 때 전국 대체 / this_market
- price_service: 대파 kg → 1단(0.8kg) 환산, 개수 단위는 환산 안 함, compare % 부호
- prune: chunk_entities만 참조 → 삭제, store_items 참조 → 경고
- `/price/item:green_onion` 라우터 테스트 (TestClient, DB 테스트일 때)

## 하지 말 것
- `.env`·`.env.example` 수정, 실제 aT 호출(키 없음 — Claude가 검증), 0001~0006 수정, 커밋

## 자체 검수 항목
- [ ] `TEST_DATABASE_URL=postgresql://localhost:5432/marketon_test pytest` 전부 통과 (샌드박스에서 DB가 막히면 보고 — Claude가 검증)
- [ ] `python -m scripts.update_prices --help`, 키 없을 때 `AT_NOT_CONFIGURED` 메시지로 끝남
- [ ] 층 규칙 (router → service → repo/clients), SQL은 `db/`에만, HTTP는 `core/http`만, 키 없음

## 보고 형식 (한국어)
변경 파일, 샘플 5품목에 채운 KAMIS 코드, 검수 결과, 설계와 다르게 한 점, 남은 문제. 모든 검수가 끝난 뒤 한 번만.
