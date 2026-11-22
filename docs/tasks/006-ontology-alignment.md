# 작업 지시서 006 · 온톨로지 설계와 DB 맞추기

- 담당: Codex · 지시: Claude · 2026-11-22
- 기준 문서: **`docs/design/03-ontology-alignment.md`** (이번 작업의 명세), `docs/design/01-rag-db.md`, `data/RAG_FORMATS.md`
- 참고(수정 금지): `docs/Ontology Architecture.md`, `docs/RAG Knowledge Base`

## 목표
DB 구조는 그대로 두고, 03 문서대로 허용 값·메타데이터 열을 넓히고, 적재 코드·샘플 데이터를 새 ID 규칙에 맞춰요.

## 1. 마이그레이션 `backend/migrations/0005_ontology_alignment.sql`
- `entities.type` check: `item, category, variety, unit, region, season, criterion, context, weather, recipe, store_category, origin_tip, safety_note`
- `entity_labels.kind` check: 기존 + `vision`
- `entity_relations.predicate` check: 03 문서 3장 목록 (`soldAt` 제외)
- `entity_relations.props jsonb` 추가 (null 허용)
- `entities.source_id bigint references sources(id)` 추가 (null 허용)
- `documents.doc_type`, `chunks.doc_type` check: `criterion, grade, storage, prep, story, season, origin, safety, context, specialty, guide, recipe, merchant_tip`
- `documents.market_id text`, `documents.published date` 추가
- `sources.quote_only boolean not null default false` 추가
- 기존 check 제약 이름은 `\d`로 확인해서 `drop constraint` 후 다시 `add constraint` (같은 이름 유지)
- 0001~0004 수정 금지

## 2. 적재 코드
- 온톨로지 YAML
  - 엔터티 `source:` (선택) → `entities.source_id`
  - 라벨 `vision: [green onion, scallion]` → kind `vision` (lang은 `en`)
  - 관계 `props:` (선택) → `entity_relations.props`
  - 품목 아래 `criteria:` 목록 지원 → 엔터티 `crit:<품목ID에서 item: 뺀 값>-<key>` (type criterion, name_ko=text) 자동 생성 + `hasCriterion` 관계(source 포함) + 다국어 라벨(`labels:` 있으면)
    ```yaml
    criteria:
      - {key: leaf, text: 잎 끝이 마르지 않고 누런 잎이 없어요, source: src:team-draft}
    ```
  - 다시 적재해도 같은 결과(자동 생성 criterion 포함). 파일에서 사라진 criterion은 삭제
- sources.yaml: `quote_only` (선택, 기본 false). 키는 `src:` 접두어
- 문서 frontmatter: `market_id`, `published` (선택). `doc_type` 새 값 허용
- `knowledge/intents.py` 신규: 03 문서 4장의 doc_type → intent 대응표와 `doc_types_for_intent(intent)`. `retriever.search`에 `intent=` 인자 추가 (주면 doc_types로 변환)
- 조각 접두어의 doc_type 한글 이름에 새 유형 추가 (품질 등급·시장 이야기·원산지·안전 주의·구매 맥락·지역 특산물·이용 안내)
- `retriever` 결과에 `quote_only`, `published`, `market_id` 포함 (`match_chunks` 반환 컬럼을 바꾸지 말고, 필요하면 repo에서 chunk_id로 추가 조회하거나 **0005에서 `match_chunks`를 다시 만들어 컬럼 추가** — 다시 만들 경우 `hnsw.iterative_scan`·search_path 설정 유지)

## 3. 샘플 데이터 ID 바꾸기 (03 문서 1장)
- `item:daepa` → `item:green_onion`, 양파 `item:onion`, 사과 `item:apple`, 배 `item:pear`, 단감 `item:sweet_persimmon`
- 출처 키 → `src:team-draft`
- 대파에 `criteria` 3개, `vision` 라벨, `soldBy unit:bunch {factor_kg: 0.8, default: true}` 예시 추가 (`unit:bunch` 엔터티 포함). 내용 첫 줄 "샘플 · 검수 전" 유지
- `data/rag_docs/daepa/` 폴더명 → `green_onion/` 등 품목 ID와 맞춤
- `data/RAG_FORMATS.md`를 새 필드·ID 규칙으로 갱신

## 4. 테스트
- 기존 테스트를 새 ID로 수정
- 추가: criterion 자동 생성·재적재 멱등·삭제, vision 라벨로 `resolve_entities("scallion")` → `item:green_onion`, `intent='store'` 검색이 storage 문서만, 0005 제약(잘못된 predicate 거부, `soldAt` 거부), props 저장

## 하지 말 것
- 진용 님 문서 두 개 수정, 0001~0004 수정, `.env` 수정, 커밋
- 운영 테이블(시세·시장·점포·오늘 추천) — 다음 작업

## 자체 검수 항목
- [ ] `TEST_DATABASE_URL=postgresql://localhost:5432/marketon_test pytest` 전부 통과 (DB 연결이 샌드박스에서 막히면 그렇다고 보고. Claude가 다시 검증해요)
- [ ] `EMBEDDING_PROVIDER=fake load_all --embed` 두 번 (두 번째 변경 0)
- [ ] `grep -rn "item:daepa\|team_draft"` 결과가 `docs/tasks/` 외에 없음
- [ ] 층 규칙, SQL은 `db/`에만, 키·서버 IP 없음

## 보고 형식 (한국어)
변경 파일, 검수 결과(명령·출력 요약), 03 문서와 다르게 한 점, 남은 문제. 모든 검수가 끝난 뒤 한 번만 보고.
