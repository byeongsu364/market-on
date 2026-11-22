# 03. 온톨로지 설계 ↔ DB 대응

> 상태: **[확정]** 2026-11-22
> 개념 설계: `docs/Ontology Architecture.md`, `docs/RAG Knowledge Base` (진용)
> 저장 설계: `docs/design/01-rag-db.md` (병수)
> 원칙: **DB 구조(엔터티 + 관계 + 문서 + 조각)는 그대로 두고**, 허용 값과 메타데이터 열만 넓혀서 개념 설계를 담아요. 개념 설계 문서는 바꾸지 않아요.

---

## 1. ID 규칙 (개념 설계를 따름)

| 대상 | 형식 | 예 |
|---|---|---|
| 품목 | `item:<영어 snake_case>` | `item:green_onion`, `item:sweet_persimmon` |
| 분류 | `cat:<영어>` | `cat:vegetable` |
| 품종 | `variety:<품목>-<품종>` | `variety:apple-hongro` |
| 판매 단위 | `unit:<영어>` | `unit:bunch`, `unit:kg` |
| 지역 | `region:<영어>` | `region:seoul` |
| 확인 포인트 | `crit:<품목>-<부위/항목>` | `crit:green_onion-leaf` |
| 구매 맥락 | `ctx:<영어>` | `ctx:gift`, `ctx:ancestral_rite` |
| 출처 | `src:<영어-kebab>` | `src:nongsaro`, `src:team-draft` |
| 시장·점포 | `market:<영어>`, `store:<시장>-<번호>` | `market:mangwon`, `store:mangwon-B03` |

- 과일 품목 ID는 Wayket KAMIS 코드표의 `class` 값과 같게 써요 (`apple`, `pear`, `sweet_persimmon`, `shine_muscat`, `mandarin` …). 코드표와 바로 연결돼요.

## 2. 노드 → 저장 위치

| 개념 노드 | 저장 위치 | 비고 |
|---|---|---|
| Item, Category, Variety, SaleUnit, Region, Season, Context, Weather, Recipe | `entities` (type) | |
| Criterion (확인 포인트) | `entities` type `criterion` + 관계 `hasCriterion` | 체크박스(C8)용 노드. 설명 문장은 RAG 문서(`criterion`)에도 둬요 |
| OriginTip, SafetyNote | `entities` type `origin_tip`, `safety_note` | RAG 문서도 함께 |
| Storage, Prep | 관계 `storedAs`·`hasPrep`의 값 + RAG 문서 | 짧은 값은 관계, 설명은 문서 |
| 라벨 (동의어·다국어·**Vision 라벨**) | `entity_labels` (kind에 `vision` 추가) | Vision 라벨 → 품목 매핑(A2) |
| `supportedBy` (근거) | `entity_relations.source_id`, `documents.source_id`, **`entities.source_id`(신규)** | |
| PriceObservation, Market, Zone, Store, TodayPick | **운영 테이블** (다음 작업) | 매일 바뀌는 데이터라 온톨로지 테이블에 두지 않아요. 엔터티 ID로 연결 |
| `hasPrice`, `observedIn`, `sells`, `hasZone`·`contains`, `locatedIn`, `posts`·`recommends` | 운영 테이블의 열·연결 테이블 | 같음 |

## 3. 관계 (entity_relations.predicate)

허용 목록: `isA`, `hasGrade`, `hasCriterion`, `soldBy`, `inSeason`, `storedAs`, `hasPrep`, `suitableFor`, `substituteFor`, `pairsWith`, `producedIn`, `specialtyOf`, `suitsWeather`, `usedIn`, `hasOriginTip`, `hasSafetyNote`

- **관계 속성 `props`(신규 jsonb)**: 품목마다 다른 값을 관계에 붙여요. 예: `item:green_onion soldBy unit:bunch {factor_kg: 0.8, default: true}`
- 기존 `soldAt`은 운영 테이블(`sells`)로 옮기므로 허용 목록에서 뺐어요

## 4. RAG 문서 유형 (documents.doc_type)

| 개념 설계 | doc_type | intent (검색·캐시용) |
|---|---|---|
| A 품목 정보 · B 품질 표준규격 | `criterion`, `grade` | `select` |
| A 보관법 · 손질법 | `storage`, `prep` | `store`, `prep` |
| C 시장·점포 이야기 | `story` | `story` |
| D 제철 | `season` | `season` |
| E 원산지 구별 | `origin` | `origin` |
| F 축산 등급 | `grade` | `select` |
| G 안전 주의 | `safety` | `safety` |
| H 구매 맥락 | `context` | `context` |
| I 지역 특산물 | `specialty` | `origin` |
| J 외국인 안내 | `guide` | `guide` |
| (기존) 레시피 · 상인 노하우 | `recipe`, `merchant_tip` | `recipe`, `select` |

- intent는 doc_type에서 정해지므로 열로 저장하지 않고 코드의 대응표 하나로 관리해요 (`knowledge/intents.py`)

## 5. 문서·출처 메타데이터

| 개념 설계 필드 | DB |
|---|---|
| `item_id`, `node_type` | `chunk_entities` (조각 ↔ 엔터티 연결, 여러 개 가능) |
| `market_id` | `documents.market_id` (신규) |
| `store_id` | `documents.store_id` (있음) |
| `source_id`, `license` | `documents.source_id` → `sources.source_key`, `sources.license` |
| `published` | `documents.published` (신규, date) |
| `quote_only` | `sources.quote_only` (신규, 공공누리 3·4유형이면 true) |
| `chunk_id` | `chunks.id` (숫자). 사람이 읽는 ID가 필요하면 `doc_key#chunk_index` |

## 6. 청크 크기
- 개념 설계: 300~500토큰, 50토큰 겹침 / 현재 구현: 약 500자, 50자 겹침
- 한국어는 bge-m3 기준 1자가 대략 1토큰 안팎이라 지금 설정을 유지해요. 실제 문서가 들어오면 다시 확인해요. **[확인 필요]**
