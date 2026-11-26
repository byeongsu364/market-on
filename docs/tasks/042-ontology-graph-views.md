# 작업 지시서 042 · 온톨로지 그래프 뷰(onto_node·onto_edge·rag_chunk) + 검수 상태 + 청크 메타데이터

- 담당: Codex · 지시: Claude · 2026-11-27 · 승인: 병수 ("뷰 방식으로 하고 3명 확인도 적용하자")
- 근거: 「MarketOn 온톨로지·RAG 적재 파이프라인 기획서 v1」(김진용, 2026-11-26) — 노드 `onto_node(id, type, props)`, 관계 `onto_edge(subj, pred, obj, source_id)`, 청크 `rag_chunk`, 클래스 13개, 관계 `isA·hasGrade·hasCriterion·soldBy·hasPrice·sells·contains·posts·reportedAt·confirmedBy·requests·supportedBy`, 청크 메타데이터 `review_status·variety_id·chunk_hash·numbers[]`
- **방식 [확정]: 표를 옮기지 않고 뷰(view)로** 지식 표(`entities`, `entity_relations`, `sources`, `documents`, `chunks`, `chunk_entities`)와 운영 표(`markets`, `zones`, `stores`, `store_items`, `closing_sales`, `price_observations`, `price_reports`, `store_price_confirmations`, `market_demand`)를 한 그래프로 보이게. 데이터 복사 없음
- 범위: `backend/`(마이그레이션·적재·검색·API) + 문서. 패키지 추가 금지. 화면 변경 없음(검수 상태 표시는 기존 `draft` 필드 그대로)

## 1. 마이그레이션 `0021_onto_views.sql`
### 1-1. `onto_node` 뷰 `(id text, type text, name text, props jsonb, source_key text)`
| type | 원본 | id |
|---|---|---|
| 기존 엔터티 type 그대로 (item·variety·criterion·unit·category·season·region·store_category) | `entities` | entities.id |
| `source` | `sources` | sources.source_key |
| `document` | `documents` | `doc:` + doc_key |
| `market` · `zone` · `store` | `markets` · `zones` · `stores` | 원래 id |
| `sale` | `closing_sales` | `sale:` + id |
| `price` | `price_observations` (props: 날짜·지역·유통·가격·단위, `origin: 'aT'`) | `price:` + id |
| `report` | `price_reports` (props: 가격·단위·수량·날짜, **device_hash는 넣지 않음**) | `report:` + id |
| `market_request` | `market_demand`를 시장별로 묶음 (props: 요청 수·최근 요청일) | `request:` + market_id |
### 1-2. `onto_edge` 뷰 `(subj text, pred text, obj text, obj_value jsonb, props jsonb, source_key text)`
- `entity_relations` 그대로 (pred = predicate)
- `sells`: store → item (`store_items`, props: source)
- `contains`: market → zone, zone → store (구역 없으면 market → store)
- `posts`: store → sale, sale `about` item
- `hasPrice`: item → price (variety가 있으면 variety → price도)
- `reportedAt`: report → store (store 없으면 → market), report `about` item
- `confirmedBy`: store → user id (`store_price_confirmations`, props: item_id·가격·날짜)
- `requests`: market_request → market
- `supportedBy`: 출처가 있는 노드·관계 → source (entities.source_id, entity_relations.source_id, documents.source_id)
- `describes`: document → item (`chunk_entities` 기준)
### 1-3. `rag_chunk` 뷰
`(chunk_id, document_id, item_ids text[], node_type(=doc_type), intent, variety_id, numbers text[], review_status, source_key, license, quote_only, chunk_hash(=content_hash), lang)` — `intent`는 `knowledge/intents.py`의 doc_type ↔ 의도 매핑과 같게(SQL `case`, 테스트로 두 매핑 일치 확인)

### 1-4. 열 추가
- `documents.review_status text not null default 'draft' check (in ('draft','reviewed','rejected'))`
- `chunks.variety_id text references entities(id) on delete set null`, `chunks.numbers text[] not null default '{}'`

## 2. 적재 (`knowledge/ingest.py`, `scripts/load_documents.py`)
- 문서 frontmatter `review_status`(선택, 기본 `draft`) 읽기. `rejected`는 적재하되 검색에서 제외
- 청크 `numbers`: `knowledge/fact_check.py`의 숫자·단위 추출 함수를 재사용해 "0℃", "90~95%", "한두 달" 같은 표기를 목록으로
- 청크 `variety_id`: frontmatter `varieties:` 목록이 있으면 그 값, 없으면 청크 글에 그 품목의 품종 이름(온톨로지 ko 라벨)이 **하나만** 나오면 그 품종
- 검색(`retriever`): `rejected` 제외, 질문에서 품종을 골랐으면 같은 `variety_id` 청크를 앞으로(지금 품종 매칭 결과 사용)
- 인용(`citation.py`): `draft` = `review_status != 'reviewed'` (첫 줄 "초안" 표시는 보조로 유지)
- `data/RAG_FORMATS.md`, `data/RAG_REVIEW.md`: 검수 끝나면 frontmatter에 `review_status: reviewed`를 적는 방법 안내

## 3. API (읽기 전용, 발표·검수용)
- `GET /ontology/items/{item_id}/graph?depth=1` → `{nodes: [...], edges: [...]}` (onto_node·onto_edge에서 그 품목 기준 1단계, depth 2까지. price·report는 최근 7일만, 최대 200개)
- 로그인 불필요, 개인 정보 없음(report는 기기 해시 제외, confirmedBy는 user id 대신 `merchant` 표시)

## 4. 테스트 (DB: `TEST_DATABASE_URL=postgresql:///marketon_test`)
- 뷰: 각 type·pred가 최소 1개 이상 나오는 픽스처, 뷰 노드 수 = 원본 표 합, `supportedBy`가 출처 있는 관계 수와 같음, report props에 device_hash 없음
- rag_chunk: intent 매핑이 `intents.py`와 같음, review_status·variety_id·numbers 적재
- 검색: rejected 제외, 품종 청크 우선
- graph API: depth, 개수 제한, 개인 정보 없음
- 기존 테스트 유지, 프런트 테스트는 바뀌는 것 없음(전체 1번 확인)

## 하지 말 것
- 기존 표 이름 바꾸기·데이터 복사, 패키지 추가, `.env` 수정, 기존 마이그레이션 수정, 커밋, `marketon` DB 접근
