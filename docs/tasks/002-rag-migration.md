# 작업 지시서 002 · RAG DB 마이그레이션 SQL

- 담당: Codex · 지시: Claude · 2026-11-22
- 기준 문서: `docs/design/01-rag-db.md` (테이블·검색 함수·보안), `docs/design/02-structure.md`

## 목표
01 문서 3·4·7·8장을 Supabase(Postgres 15+, pgvector)에서 그대로 실행되는 SQL 마이그레이션으로 만들어요.

## 만들 것
`supabase/migrations/20261122000001_rag_schema.sql` 하나

1. 확장: `create extension if not exists vector with schema extensions;` (Supabase 관례). 타입은 `extensions.vector(768)`로 참조.
2. 테이블 (01 문서 3장 컬럼·타입 그대로)
   - 온톨로지: `entities`, `entity_labels`, `entity_relations`
   - RAG: `sources`, `documents`, `chunks`, `chunk_entities`
   - 캐시: `response_cache`
   - `type`, `kind`, `doc_type`, `lang`, `predicate`는 `check` 제약으로 01 문서에 적힌 값만 허용
   - `entity_relations`: `object_id`와 `object_value` 중 정확히 하나만 값이 있도록 check
   - `entity_labels`에 정규화 라벨 컬럼 `label_norm` (generated: 소문자 + 공백 제거) + 인덱스
   - `documents.store_id`는 text, FK 없음 (점포 테이블은 다음 작업)
   - `chunks.doc_type`, `chunks.lang`은 documents 값 복사용 일반 컬럼
   - 시간 컬럼 기본값 `now()`
   - 임베딩 차원 768 **[확정]** (config `EMBEDDING_DIM` 기본값과 같음)
3. 인덱스: `chunks.embedding` HNSW `vector_cosine_ops`, `chunks(doc_type)`, `chunks(lang)`, `chunk_entities(entity_id)`, `entity_relations(subject_id, predicate)`, `entity_relations(object_id)`, `response_cache(created_at)`
4. RPC `match_chunks(query_embedding vector(768), entity_ids text[] default null, doc_types text[] default null, lang text default null, match_count int default 5, min_similarity float default 0.0)`
   - 01 문서 7장의 순서·반환 컬럼 그대로: `chunk_id, content, similarity, doc_type, document_title, store_id, source_title, source_url, license`
   - similarity = `1 - (embedding <=> query_embedding)`
   - entity_ids가 null이거나 빈 배열이면 엔터티 필터 생략. 엔터티 필터 시 중복 조각이 나오지 않게(`exists` 사용)
   - `embedding is null`인 조각 제외
   - `language sql stable`, `set search_path = public, extensions`
5. RPC `invalidate_cache_for_entity(p_entity_id text)`: `response_cache`에서 `cache_key like p_entity_id || ':%'` 삭제, 삭제 건수 반환 (상인 노하우 반영 시연용)
6. RLS: 8개 테이블 모두 `enable row level security`, 정책은 만들지 않음 (service_role만 접근). 두 함수는 `revoke execute ... from public, anon, authenticated` 후 `grant execute ... to service_role`
7. 파일 맨 위 주석: 기준 문서, 적용 방법(Supabase SQL Editor에 붙여 넣기 또는 `supabase db push`)

## 문서 반영
- `docs/design/01-rag-db.md` 4장 차원 768을 **[확정]**으로, 10장 체크리스트에서 마이그레이션 작성 항목 반영
- 01 문서와 SQL이 다르게 된 곳이 있으면 01 문서를 고치지 말고 보고에 적기

## 하지 말 것
- 가격표·점포·재고 테이블
- 백엔드 Python 코드 수정
- `.env` 생성·수정, 커밋

## 자체 검수 항목
- [ ] 01 문서 3장의 모든 테이블·컬럼이 SQL에 있음 (표로 대조)
- [ ] 로컬 Postgres 16(`/opt/homebrew/bin/postgres`)이 있지만 pgvector는 설치돼 있지 않아요. 가능하면 임시 DB에서 `vector` 관련 줄을 빼고(또는 임시로 `vector`를 `real[]`로 바꾼 사본으로) 문법·제약·FK를 실행 검증해요. 원본 파일은 바꾸지 않아요. 검증이 불가능하면 그렇다고 보고.
- [ ] 같은 마이그레이션을 두 번 실행할 필요는 없지만, 함수는 `create or replace`
- [ ] anon/authenticated가 테이블·함수에 접근할 수 없는 구성인지 확인
- [ ] 키 값이 파일에 없음

## 보고 형식 (한국어)
만든 파일, 01 문서 대조표, 검수 결과(명령·출력 요약), 01 문서와 다른 점, 남은 문제
