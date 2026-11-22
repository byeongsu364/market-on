# 01. RAG 적재용 DB 설계 (PostgreSQL + pgvector)

> 상태: **[제안]** 초안 · 2026-11-22
> 2026-11-22 변경: PostgreSQL → 직접 운영하는 PostgreSQL. RLS·RPC 대신 앱 전용 DB 계정과 SQL 함수를 써요.
> 범위: 온톨로지·RAG 지식을 PostgreSQL(pgvector)에 적재하고 검색하는 구조. 가격표·점포·재고 테이블은 다음 문서에서 다뤄요.
> 사전 제작 제한은 구두 합의로 적용하지 않아요 (2026-11-22). 설계가 확정되면 SQL과 적재 스크립트를 바로 만들어요.

---

## 1. 설계 목표

| 목표 | 설계에서 하는 일 |
|---|---|
| 온톨로지와 RAG를 **하나로 연결** | 문서 조각(chunk)마다 관련 품목 엔터티를 태그해요. 검색할 때 "엔터티로 거르기 → 벡터 유사도 순 정렬" 순서로 찾아요. |
| 동의어 처리 ("대파 값" = "파 가격") | 엔터티 라벨 테이블에 동의어·다국어 라벨을 모아요. 질문 속 단어를 엔터티 ID로 바꾼 뒤 검색해요. |
| 근거 출처 표시 (D4) | 모든 문서가 출처(sources) 하나를 가리켜요. 답변에 출처 제목·링크·라이선스를 붙여요. |
| 환각 억제 (D5) | 유사도 기준값 아래면 "근거 없음"으로 처리하고, LLM에는 찾은 조각만 넘겨요. |
| 상인 노하우 (C3) | 상인 녹음 요약도 같은 documents 테이블에 `merchant_tip` 유형으로 넣어요. 따로 처리할 필요가 없어요. |
| 응답 캐시 (D6) | 캐시 키 = 엔터티 ID + 의도 + 날짜 |
| 다시 적재해도 안전 | 내용 해시로 중복을 막아서 스크립트를 여러 번 돌려도 같은 행이 쌓이지 않게 해요. |

---

## 2. 전체 흐름

```
[적재]
원천 자료 ─→ 정리(텍스트화) ─→ 조각 나누기 ─→ 엔터티 태깅 ─→ 임베딩 ─→ PostgreSQL upsert
 (공공문서·                      (항목 단위)    (라벨 사전 매칭)  (Gemini)
  상인 녹음 요약 등)

[검색]
질문/인식 품목 ─→ 엔터티 찾기 ─→ 캐시 확인 ─→ match_chunks(엔터티 필터 + 벡터) ─→ 기준값 검사 ─→ LLM 답변 + 출처
                 (entity_labels)  (hit면 바로 반환)
```

---

## 3. 테이블

### 3-1. 관계도

```
sources 1─N documents 1─N chunks N─M entities (chunk_entities)
                                          │
                     entity_labels N─1 ───┤
                  entity_relations (주어·목적어 모두 entities)
response_cache (entity_id 참조)
```

### 3-2. 온톨로지

**entities**: 온톨로지 노드 (품목, 분류, 산지, 제철, 레시피, 점포 카테고리 등)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | text PK | 사람이 읽는 ID. 예: `item:daepa`, `cat:vegetable`, `season:nov` |
| type | text | `item` · `category` · `region` · `season` · `recipe` · `store_category` · `criterion` |
| name_ko | text | 대표 이름 |
| kamis | jsonb | 품목일 때 KAMIS 코드 `{ctgry_cd, item_cd, vrty_cd, unit}` |
| attrs | jsonb | 그 밖의 속성 (환산 단위 등) |
| updated_at | timestamptz | |

**entity_labels**: 동의어·다국어 라벨 (질문 → 엔터티 변환용)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| entity_id | text FK | |
| label | text | 예: `대파`, `파`, `green onion`, `大葱` |
| lang | text | `ko` · `en` · `zh` · `ja` · `vi` |
| kind | text | `preferred`(대표) · `synonym`(동의어) · `colloquial`(구어) |
| PK | (entity_id, label, lang) | |

- `label`에 소문자·공백 제거 정규화 인덱스를 둬요.

**entity_relations**: 관계 (트리플)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | bigserial PK | |
| subject_id | text FK | |
| predicate | text | `isA` · `producedIn` · `hasCriterion` · `hasGrade` · `inSeason` · `usedIn` · `suitableFor` · `suitsWeather` · `soldAt` |
| object_id | text FK, null 허용 | 다른 엔터티를 가리킬 때 |
| object_value | jsonb, null 허용 | 값일 때 (예: 출하 월 범위) |
| source_id | FK sources | 이 관계의 근거 |

- 설계 자료의 `ingredientAt`(점포)은 뜻이 더 분명한 `soldAt`으로 바꾸는 걸 제안해요. **[제안]**
- 시세(`hasPrice`)는 매일 바뀌어서 관계로 두지 않고 가격 테이블(다음 문서)에서 다뤄요.

### 3-3. RAG

**sources**: 출처·라이선스 (`data/SOURCES.md`와 같은 내용)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | bigserial PK | |
| title | text | 예: "농산물 표준규격 (국립농산물품질관리원)" |
| publisher | text | |
| url | text | |
| license | text | 예: 공공누리 1유형, CC BY 4.0, 자체 작성 |
| kind | text | `public_doc` · `public_api` · `merchant_voice` · `team_written` |
| retrieved_at | date | |

**documents**: 적재 단위 문서

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | bigserial PK | |
| source_id | FK sources | |
| doc_type | text | `criterion`(확인 포인트) · `season`(출하 시기) · `storage`(저장 조건) · `recipe` · `merchant_tip` · `prep`(손질법) |
| title | text | |
| lang | text | 원문 언어 |
| body | text | 정리된 전체 텍스트 |
| store_id | text, null 허용 | `merchant_tip`일 때 점포 ID ("○○상회 사장님 노하우" 표시용) |
| content_hash | text UNIQUE | 중복 적재 방지 |
| created_at | timestamptz | |

**chunks**: 검색 단위 조각

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | bigserial PK | |
| document_id | FK documents (cascade) | |
| chunk_index | int | 문서 안 순서 |
| content | text | 조각 본문 |
| embedding | vector(768) | 임베딩 (차원은 4장 참고) |
| doc_type | text | documents에서 복사. 필터를 빠르게 하려고 둠 |
| lang | text | |
| content_hash | text UNIQUE | |

- 인덱스: `embedding`에 HNSW(cosine), `doc_type`·`lang`에 일반 인덱스

**chunk_entities**: 조각 ↔ 엔터티 연결 (온톨로지와 RAG를 잇는 핵심 테이블)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| chunk_id | FK chunks (cascade) | |
| entity_id | FK entities | |
| PK | (chunk_id, entity_id) | |

### 3-4. 응답 캐시

**response_cache**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| cache_key | text PK | `{entity_id}:{intent}:{yyyyMMdd}:{lang}` 예: `item:daepa:criterion:20261122:ko` |
| answer | jsonb | 답변 본문 + 사용한 chunk id + 출처 |
| model | text | 답변을 만든 모델 (Gemini/Gemma 전환 시연용) |
| created_at | timestamptz | |

- 언어도 키에 넣어요. 같은 품목이라도 언어마다 답이 다르기 때문이에요.
- 상인 노하우가 새로 들어오면 그 품목의 캐시를 지워서, 바로 반영되는 장면을 시연할 수 있게 해요.

---

## 4. 임베딩

- 모델: Gemini 임베딩 API **[확인 필요: 대회 당일 최신 모델명]**
- 차원: **768 [확정].** pgvector HNSW 인덱스는 `vector` 타입 기준 2,000차원까지만 지원해요. 768이면 저장과 검색이 빠르고, 짧은 확인 포인트 문서에는 충분해요.
- 문서용과 질문용 작업 유형(task type)을 구분해서 호출해요 (문서: retrieval document, 질문: retrieval query).
- 임베딩 호출도 `backend/app/llm/` 한 곳에서만 해요 (J1).

---

## 5. 조각 나누기 규칙

확인 포인트·저장 조건 문서는 짧고 항목별로 나뉘어 있어서, 글자 수가 아니라 **"품목 × 주제" 단위**로 나눠요.

| doc_type | 조각 단위 | 예시 |
|---|---|---|
| criterion | 품목 1개의 확인 포인트 묶음 | "대파: 잎 끝 마름·누런 잎 없음 / 흰 줄기가 단단하고 윤기 / 뿌리 쪽 수분 유지" |
| season, storage, prep | 품목 1개 × 주제 1개 | "대파 저장: 신문지에 싸서 세워 냉장…" |
| recipe | 레시피 1개 (재료 + 요약 조리법) | |
| merchant_tip | 녹음 1건 요약 | |
| 긴 공공 문서 | 제목 기준 섹션, 약 500자, 앞뒤 50자 겹침 | |

- 조각 맨 앞에 `[대파 · 확인 포인트]`처럼 품목과 주제를 붙여서 임베딩해요. 짧은 조각의 검색 정확도가 올라가요.

---

## 6. 엔터티 태깅

1. `entity_labels`의 모든 라벨로 사전을 만들어요.
2. 조각 본문에서 라벨을 찾고, 찾은 엔터티를 `chunk_entities`에 넣어요.
3. 문서를 만들 때 품목을 이미 알면(예: 품목별로 쓴 확인 포인트 문서) 그 품목을 바로 태그해요.
4. "파"처럼 짧은 라벨은 다른 단어(예: 양파) 안에서 잘못 잡힐 수 있어요. 짧은 라벨은 앞뒤가 공백이나 문장부호일 때만 인정해요.

---

## 7. 검색 함수 (SQL 함수)

**match_chunks(query_embedding, entity_ids, doc_types, lang, match_count, min_similarity)**

1. `entity_ids`가 있으면 `chunk_entities`로 그 엔터티가 붙은 조각만 남겨요.
2. `doc_types`·`lang`으로 걸러요.
3. 코사인 유사도 높은 순으로 `match_count`개를 돌려줘요.
4. `min_similarity`보다 낮은 조각은 빼요. 남은 조각이 없으면 백엔드는 "근거 없음"으로 응답해요 (D5).

돌려주는 값: `chunk_id, content, similarity, doc_type, document_title, store_id, source_title, source_url, license`

- 품목 인식(A2) 결과로 들어올 때는 엔터티를 이미 알기 때문에 1번 필터가 정확하게 걸려요.
- 자유 질문(H3)일 때는 먼저 라벨 사전으로 엔터티를 찾아요. 찾지 못하면 필터 없이 벡터 검색만 해요.
- 한국어는 Postgres 기본 전문 검색(full-text) 설정이 없어요. 키워드 보조 검색이 필요하면 `pg_trgm`을 써요. **[제안: P1]**

---

## 8. 보안

- 프론트는 DB에 직접 접근하지 않고 백엔드 API만 불러요. DB 포트는 외부에 열지 않아요.
- 백엔드는 `.env`의 `DATABASE_URL` 하나로 접속해요. 접속 정보는 Git·문서·화면 코드에 넣지 않아요.
- 운영 DB에서는 슈퍼유저 대신 앱 전용 계정(테이블 읽기·쓰기, 함수 실행만)을 써요. **[제안]**
- 점포·가격표처럼 프론트가 직접 읽어도 되는 테이블은 다음 문서에서 따로 정해요.

---

## 9. 적재 스크립트 구성

```
scripts/rag/
├─ 01_load_ontology    data/ontology/*.jsonld → entities, entity_labels, entity_relations
├─ 02_load_sources     data/SOURCES.md(또는 yaml) → sources
├─ 03_load_documents   data/rag_docs/** → documents → chunks (나누기·태깅)
└─ 04_embed            embedding이 빈 chunks만 골라 임베딩 후 update
```

- 순서대로 돌리고, 몇 번을 다시 돌려도 결과가 같게 만들어요 (content_hash로 upsert).
- 상인 노하우(C3)는 스크립트가 아니라 백엔드 API가 03·04와 같은 함수를 불러서 바로 적재해요.

---

## 10. 정해야 할 것

- [x] RAG DB 마이그레이션 작성: `backend/migrations/0001_rag_schema.sql` (8개 테이블·인덱스·SQL 함수 2개)
- [x] HNSW 필터 누락 해결: 조각 2,000개 중 대파 10개를 찾을 때 1개만 나왔어요. `0002` 마이그레이션으로 `match_chunks`에 `hnsw.iterative_scan = strict_order`를 걸어 10개 모두 나오는 것을 확인했어요 (pgvector 0.8.7, 2026-11-22).
- [x] 로컬 개발 DB: PostgreSQL 16 + pgvector 0.8.7, DB 이름 `marketon`, 마이그레이션 0001·0002 적용

- [ ] **[확인 필요]** 시연·배포용 DB를 어디서 돌릴지 (노트북 로컬, 서버, 관리형 서비스)
- [ ] `entities.kamis` 초기값은 Wayket `n8n_가격조회목록_v1.csv`에서 가져와요 (00 문서 참고). 채소·수산은 새로 찾아야 해요.
- [ ] **[확인 필요]** 사용할 Gemini 임베딩 모델명과 지원 차원
- [ ] **[제안]** 관계 이름 `ingredientAt` → `soldAt`
- [ ] **[제안]** 시연 품목 범위 (예: 대파 포함 10~15개 품목부터)
- [ ] 무료 요금제 한도 확인 (DB 500MB 기준이면 768차원 조각 수만 개도 충분해요)
