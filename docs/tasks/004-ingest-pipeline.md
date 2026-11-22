# 작업 지시서 004 · RAG 적재 파이프라인

- 담당: Codex · 지시: Claude · 2026-11-22
- 기준 문서: `docs/design/01-rag-db.md` (5·6·7·9장), `docs/design/02-structure.md` (층 규칙), `backend/migrations/0001·0002`
- 로컬 DB: PostgreSQL 16 + pgvector 0.8.7, `DATABASE_URL=postgresql://localhost:5432/marketon` (0001·0002 적용됨)

## 목표
데이터 파일(온톨로지·출처·문서) → PostgreSQL 적재 → 임베딩 → 검색까지 한 번에 돌아가게 만들어요. 몇 번을 다시 돌려도 결과가 같아야 해요.

---

## 1. 마이그레이션 `backend/migrations/0003_ingest_keys.sql`
다시 적재할 때 옛 행을 찾기 위한 안정 키를 추가해요.
- `sources.source_key text not null unique` (기존 행이 없으니 not null 가능)
- `documents.doc_key text not null unique`: 파일 문서는 `data/rag_docs` 기준 상대 경로, 상인 노하우는 `merchant_tip:<uuid>`
- 0001·0002 파일은 수정하지 않아요

## 2. 데이터 파일 형식

### 2-1. 출처 `data/sources.yaml`
```yaml
team_draft:                       # source_key
  title: Market-On 팀 작성 초안
  publisher: Market-On
  url: null
  license: 팀 자체 작성
  kind: team_written             # public_doc | public_api | merchant_voice | team_written
  retrieved_at: 2026-11-22
```
- `data/SOURCES.md`에 "RAG 출처의 원본은 `sources.yaml`" 한 줄 추가

### 2-2. 온톨로지 `data/ontology/*.yaml` (파일 여러 개, 모두 읽어 합침)
```yaml
entities:
  - id: item:daepa
    type: item
    name_ko: 대파
    kamis: null                  # {ctgry_cd, item_cd, vrty_cd, grd_cd, unit} 또는 null
    attrs: {}
    labels:
      ko: [대파, 파]             # 첫 번째가 preferred, 나머지 synonym
      en: [green onion, scallion]
    relations:
      - {p: isA, o: cat:vegetable}
      - {p: inSeason, v: {months: [3, 4, 5, 10, 11]}, source: team_draft}
```
- `o`는 엔터티 ID(object_id), `v`는 값(object_value). 둘 중 하나만.
- 문서 01의 JSON-LD 대신 YAML을 써요 (팀원이 한글로 직접 쓰기 쉬움). 01 문서 9장 문구도 바꿔 주세요.

### 2-3. RAG 문서 `data/rag_docs/**/*.md`
```markdown
---
source: team_draft
doc_type: criterion              # criterion | season | storage | recipe | merchant_tip | prep
lang: ko
title: 대파 확인 포인트
entities: [item:daepa]           # 미리 아는 품목 (6장 3번 규칙)
store_id: null
---
- 잎 끝이 마르지 않고 누런 잎이 없어요
- 흰 줄기가 단단하고 윤기가 있어요
```

### 2-4. 샘플 데이터 (파이프라인 검증용)
- 엔터티: 분류 2개(`cat:vegetable`, `cat:fruit`), 품목 5개(대파, 양파, 사과, 배, 단감)
- 과일 3종의 `kamis`는 `data/kamis/n8n_가격조회목록_v1.csv`에서 우선순위 1 품종 값으로 채워요 (sgg 무관, 첫 행). 채소는 null.
- 문서: 품목마다 `criterion` 1개 + 대파·사과 `storage` 1개, 긴 문서 1개(제목 3개 이상, 1,500자 이상, 6번 분할 검증용)
- 내용 첫 줄에 `> 샘플 데이터 · 검수 전` 표시. 사실 확인이 안 된 내용이라 시연 데이터로 쓰지 않아요.

## 3. 코드 (02 문서 층 규칙 준수)

### llm/
- `base.py`: `embed(texts, *, task: Literal['document','query']) -> list[list[float]]`
- `gemini.py`: `embed`만 구현 (google-genai SDK). 모델은 `settings.EMBEDDING_MODEL`(기본 `gemini-embedding-001` **[확인 필요]**), `output_dimensionality=settings.EMBEDDING_DIM`, task → `RETRIEVAL_DOCUMENT`/`RETRIEVAL_QUERY`. 100개 단위 배치, 429·5xx 지수 백오프 3회. 반환 차원이 `EMBEDDING_DIM`과 다르면 `AppError`. `generate`는 그대로 NotImplemented.
- `fake.py` 신규: 텍스트 해시로 만드는 결정적 벡터(같은 텍스트 → 같은 벡터, 단위 벡터). 테스트·오프라인 개발용.
- `factory.py`: `gemini | gemma | fake`. 임베딩 공급자는 `settings.EMBEDDING_PROVIDER`(기본 `gemini`)로 생성 공급자와 따로 고를 수 있게 `get_embedder()` 추가.
- `core/config.py`: `EMBEDDING_MODEL`, `EMBEDDING_PROVIDER` 추가, `.env.example`에도.

### knowledge/
- `ontology.py`
  - `load_label_dictionary(conn) -> list[(label_norm, entity_id, original_label)]`
  - `resolve_entities(conn, text) -> list[entity_id]`: 문장 속 라벨 찾기 (아래 태깅 규칙과 같은 함수 사용)
  - `normalize(text)`: 소문자 + 공백 제거 (SQL `label_norm`과 같은 규칙)
- `ingest.py` (scripts와 상인 노하우 API가 같이 씀)
  - `chunk_document(doc) -> list[Chunk]`: 01 문서 5장. `criterion·season·storage·prep·merchant_tip`과 600자 이하 문서는 통째로 1조각. 그 외는 `##` 제목 단위, 제목 하나가 600자를 넘으면 약 500자·50자 겹침으로 다시 나눔(문장 경계 우선). 조각 앞에 `[{엔터티 대표 이름들} · {doc_type 한글}] ` 접두어 (doc_type 한글: 확인 포인트·출하 시기·저장 조건·레시피·상인 노하우·손질법).
  - `tag_entities(text, dictionary) -> set[entity_id]`: 01 문서 6장.
    - 정규화한 본문에서 **긴 라벨부터** 찾고, 이미 잡힌 구간과 겹치는 짧은 라벨은 버림 (`양파` 안의 `파` 방지)
    - 한 글자 라벨은 바로 앞 글자가 한글이 아닐 때만 인정
    - 문서 frontmatter `entities`는 모든 조각에 무조건 붙임
  - `upsert_document(conn, doc, *, embedder=None) -> UpsertResult`: `doc_key`로 기존 문서 조회 → content_hash 같으면 건너뜀, 다르면 기존 문서 삭제(조각 cascade) 후 삽입 → 조각·`chunk_entities` 삽입 → embedder가 있으면 바로 임베딩. 태깅된 엔터티의 `response_cache` 무효화(`invalidate_cache_for_entity`). 한 트랜잭션.
  - content_hash: 문서 = sha256(source_key, doc_type, lang, title, store_id, body), 조각 = sha256(doc_key, chunk_index, content)
- `embedder.py`: `embed_pending(conn, embedder, batch=100) -> int`: `embedding is null`인 조각을 배치로 임베딩해 update. 다시 돌리면 0.
- `retriever.py`: `search(conn, embedder, query, *, entity_ids=None, doc_types=None, lang=None, k=5, min_similarity=0.0) -> list[RetrievedChunk]`. `entity_ids`가 None이면 `resolve_entities`로 질문에서 찾고, 못 찾으면 필터 없이. 질문 임베딩은 `task='query'`. `match_chunks` 호출.
- 반환 타입(`Chunk`, `UpsertResult`, `RetrievedChunk` 등)은 `schemas/knowledge.py`에 Pydantic 또는 dataclass로.

### db/repositories/knowledge_repo.py
- SQL은 전부 여기. knowledge/ 는 repo 함수만 부름. (sources·entities·labels·relations upsert, document 조회·삭제·삽입, chunk 삽입, embedding update, match_chunks, invalidate)
- 벡터 파라미터는 `pgvector.Vector`로 넘김

### scripts/ (backend/에서 `python -m scripts.xxx`)
- `load_sources.py`: sources.yaml → `sources` upsert (source_key 기준)
- `load_ontology.py`: yaml → entities upsert, labels는 엔터티별 전부 지우고 다시 삽입, relations는 파일에 나온 subject들의 관계를 지우고 다시 삽입. 존재하지 않는 엔터티를 가리키는 관계는 에러로 중단(어느 파일·어느 줄인지 출력).
- `load_documents.py`: rag_docs 전부 `upsert_document` (임베딩은 하지 않음). `--prune`: 파일이 사라진 `doc_key`(merchant_tip 제외) 문서 삭제.
- `build_embeddings.py`: `embed_pending`
- `load_all.py`: 위 4개 순서대로. `--embed/--no-embed`
- `search.py`: `python -m scripts.search "파 고르는 법" [--lang ko --k 5]` → 결과와 유사도·출처 출력 (검증용 CLI)
- 각 스크립트 끝에 건수 요약 출력 (추가·변경·건너뜀·삭제)

### 의존성
- `pyyaml` 추가

## 4. 테스트 (`backend/tests/`)
- `TEST_DATABASE_URL`이 있을 때만 DB 테스트 실행, 없으면 skip. 테스트 시작 시 그 DB의 public 스키마를 비우고 마이그레이션 적용(scripts.migrate 함수 재사용).
- 단위: `tag_entities` (양파/파 겹침, 한 글자 경계, 영문 대소문자·공백), `chunk_document` (짧은 문서 1조각, 긴 문서 분할·겹침·접두어), `normalize`가 SQL label_norm과 같은 결과
- DB 통합 (fake embedder): `load_all` 두 번 실행 → 두 번째는 변경 0 / 문서 본문 수정 후 재실행 → 해당 문서만 교체, 조각 수 일치, 옛 조각 없음 / `search("파 고르는 법")` 첫 결과가 대파 criterion / 캐시 무효화 동작
- 실제 Gemini 호출 테스트는 만들지 않아요 (키 없음)

## 하지 말 것
- 0001·0002 수정, `.env` 생성·수정, 커밋, 시스템 설치
- 라우터·API 엔드포인트 (상인 노하우 API는 다음 작업)
- `generate` 구현

## 자체 검수 항목
- [ ] `createdb marketon_test` 후 `TEST_DATABASE_URL=postgresql://localhost:5432/marketon_test pytest` 전부 통과 (DB 접속이 샌드박스에서 막히면 그렇다고 보고)
- [ ] `EMBEDDING_PROVIDER=fake python -m scripts.load_all --embed`를 `marketon_test`에 두 번 실행한 출력 (두 번째 변경 0)
- [ ] `EMBEDDING_PROVIDER=fake python -m scripts.search "파 고르는 법"` 출력
- [ ] SQL 문자열이 `db/` 밖에 없음, 외부 호출 위치 규칙, 층 방향 위반 없음 (grep 결과)
- [ ] 키 값 없음

## 보고 형식 (한국어)
변경 파일, 데이터 형식 요약, 검수 결과(명령·출력 요약), 설계와 다르게 한 점, 남은 문제
