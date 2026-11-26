# 작업 지시서 047 · aT 소매 조사 품목 전체(6부류 95개) 넣기

- 담당: Codex · 지시: Claude · 2026-11-27 · 승인: 병수 ("품목에 나머지 다 넣어줘", "딸기도 넣고 6개 부류 전부 넣자")
- 입력 데이터 (Claude가 API로 받아 둠, 커밋 대상):
  - `data/kamis/at_retail_items_20261127.json` — aT 기간별 소매가격 API 2026-11-19~25 소매 조사 행을 집계한 **품목 95개 · 품종 · 등급 · 조사 단위**(가격 없음). 부류 100 식량작물·200 채소·300 특용작물·400 과일·500 축산물·600 수산물
  - `data/kamis/month_food_map_20261127.json` — 위 품목 중 「농식품 이달의 식재료」 API와 **이름이 같은** 품목 → `fdmtSn`·소개 달(새로 연결되는 품목: 쌀·팥·녹두·고구마·배추·알배기배추·시금치·호박·무·생강·브로콜리)
  - `data/raw/nics/{fdmtSn}.json` — 그 원문(이용허락범위 제한 없음)
- 범위: `backend/scripts/`, `data/ontology/`, `data/sources.yaml`, `data/rag_docs/`, `data/markets/gyeongdong.yaml`, `backend/scripts/load_market_stores.py`, `frontend/`(아이콘·이미지 연결), 테스트. 패키지 추가 금지

## 1. 생성 스크립트 `backend/scripts/build_at_items.py` (네트워크 없이 위 파일만 읽음, 다시 돌려도 같은 결과)
- 출력 **`data/ontology/items_at.yaml`** (기존 `items.yaml`의 6품목[대파·양파·사과·배·단감·귤]과 그 품종·예시 품종은 **건드리지 않고 건너뜀**)
- 품목 엔터티 `item:<영문 슬러그>`(사람이 읽을 영문 이름, 예: `item:napa_cabbage`, `item:mackerel`, `item:pork` — 슬러그 표는 스크립트 안 상수로, 겹치지 않게), name_ko = aT 품목명(괄호 정리: "깐마늘(국산)" → "깐마늘"), labels ko(이름 + 이달의 식재료 이름이 다르면 그 이름), en(슬러그와 같은 영어)
- **품종**: aT 품종마다 `variety:<item>-<vrty_cd>` (name_ko = aT 품종명), kamis `{ctgry_cd, item_cd, vrty_cd, grd_cd(그 품종에서 행이 가장 많은 등급), unit, unit_sz}`; 행이 가장 많은 품종이 `default`. 품목 kamis = 기본 품종 kamis
- **판매 단위**: 기본 품종의 조사 단위를 그대로 기본 판매 단위로 (`1포기`, `100g`, `10개`, `1마리`, `1손`, `10장`, `5kg`, `10구`, `1L` …). 없는 단위는 `items_at.yaml`에 단위 엔터티로 추가(`unit:head`(포기), `unit:g100`(factor_kg 0.1), `unit:fish`(마리, count) 등 — g·kg은 factor_kg, 셀 수 있는 것은 count). aT 기준시세가 그 단위로 바로 보이게(`observation_unit_id`가 찾을 수 있게)
- **분류**: 새 분류 엔터티 `cat:grain`(곡물), `cat:special`(특용작물), `cat:livestock`(축산물), `cat:seafood`(수산물) 추가, 채소·과일은 기존 `cat:vegetable`·`cat:fruit`. 감자·고구마는 `cat:vegetable`, 버섯은 `cat:vegetable`(장 보는 사람 기준, 주석)
- **제철·확인 포인트·근거 문서**: `month_food_map`에 있는 품목만
  - `inSeason` → 소개 달 (source = 그 품목의 새 출처 키)
  - 출처: `data/sources.yaml`에 `src:nics-month-food-<slug>` 추가(기존 형식, 바로 위 `# fdmtSn N` 주석, license "공공데이터포털 이용허락범위 제한 없음", kind public_api) — 배추·알배기배추처럼 같은 원문이면 출처 하나를 같이 씀
  - 확인 포인트: 원문 `prchCheatDtl`의 "구입요령" 항목 줄에서 최대 4개, **원문 문장을 그대로**(앞의 "- "·"■"만 정리, 어미를 바꾸지 않음), `key`는 순서(`p1`…). 품목 엔터티 attrs에 `criteria_style: 'source_quote'`(화면은 그대로 보여 줌)
  - 근거 문서 `data/rag_docs/<slug>/{criterion,storage,prep}.md`: 원문 해당 단락(구입요령 / 보관법 / 손질법)을 **문장 그대로** 옮기고, 첫 줄 `> 원문 옮김 · 검수 전 (자동 생성 2026-11-27)`, 끝 `출처:` 줄. 단락이 없으면 그 문서를 만들지 않음. 영양·효능·연구 단락은 옮기지 않음
  - 그 밖의 품목은 확인 포인트·문서·제철 없음 → 화면 "자료 준비 중"
- **점포 카테고리 연결**: `data/ontology/item_store_categories.yaml`(팀 작성 규칙표, `source: src:team-draft`) — 품목 → 경동시장 업종 카테고리
  - 채소·과일·버섯·감자·고구마 → `store_category:produce`
  - 쌀·찹쌀·현미·보리쌀·혼식곡·콩·팥·녹두·계란·우유 → `store_category:side_dish`
  - 참깨·땅콩·호두·아몬드·건고추·고춧가루 → `store_category:dried`(고춧가루·건고추는 채소·과일 가게도 팔지만 대표 하나)
  - 소·돼지·닭·수입 소고기·수입 돼지고기 → `store_category:meat`
  - 생물·냉장·냉동 수산(고등어·갈치·조기·오징어·굴·전복·새우·꽃게·홍합·가리비·바지락·낙지·꼬막·삼치·꽁치·명태·고등어필렛·수입조기) → `store_category:seafood`
  - 마른멸치·마른오징어·김·마른미역·건다시마·새우젓·멸치액젓·천일염 → `store_category:dried`
- `load_market_stores.py`: 지금 `category_items`(분류 → 업종) 대신/에 더해 이 규칙표로 `store_items`(source `sbiz_guess`) 생성. 기존 6품목 연결 결과는 그대로여야 함

## 2. 화면
- 품목 아이콘: 95개를 다 그리지 않고 **분류별 공통 아이콘 6개**(`vegetable·fruit·grain·special·livestock·seafood`, 기존 `public/items/*.svg` 스타일) + `utils/itemImage.ts`가 품목 → 분류 아이콘으로 대체. 기존 품목 아이콘은 그대로
- 확인 포인트가 원문 인용(`criteria_style: source_quote`)이면 작은 "원문" 표시
- 확인 포인트가 없는 품목: "이 품목은 확인 포인트 자료를 준비 중이에요" + 기준시세·판매 점포는 그대로
- 검색·품목 목록·지도 품목 칩이 많은 품목을 감당하게(분류 탭·검색, 칩 최대 개수) — 시안 Search·MarketInside 구조 따름

## 3. 테스트
- 생성 스크립트: 품목 수 = 95 − 기존 6 = 89, 슬러그 중복 없음, 모든 품종 kamis 존재·기본 품종 1개, 단위 엔터티 존재, 이달의 식재료 품목만 출처·확인 포인트·문서, 원문 문장 그대로(원문 텍스트에 포함), 다시 돌려도 같은 파일
- 적재(DB): 엔터티·관계 수, 출처 검사(044 파이프라인 검사 4개 통과), 점포 연결(업종별)
- 기존 테스트의 고정 개수 갱신(이유 주석)
- 화면: 분류 아이콘 대체, 자료 준비 중 표시, 많은 품목 검색
- 백엔드 `TEST_DATABASE_URL=postgresql:///marketon_test` 전체, 프런트 전체 3번 연속

## 하지 말 것
- 원문에 없는 확인 포인트·제철·설명, 효능 문장 옮기기, 판정 문구, 기존 `items.yaml` 6품목 수정, 패키지 추가, `.env` 수정, 기존 마이그레이션 수정, 커밋, `marketon` DB 접근(적재·시세 수집은 Claude), 네트워크 호출
