# RAG 파일 형식

작업 경로는 `backend/`, Python은 저장소의 `.venv/bin/python`을 사용합니다.
적재 전 `DATABASE_URL`을 대상 DB로 명시하고 `python -m scripts.migrate`를 실행합니다.
검증용 대상은 `postgresql://localhost:5432/marketon_test`입니다.

- `sources.yaml`: `source_key`를 키로 하는 매핑. 값에는 `title`, `publisher`, `url`, `license`, `kind`, `retrieved_at`을 둡니다. 날짜는 YAML 날짜(`YYYY-MM-DD`)로 씁니다.
- `ontology/*.yaml`: 각 파일의 `entities` 목록을 합칩니다. `labels`는 언어별 목록이며 첫 라벨이 preferred입니다. `relations`는 `p`와 `o`(엔터티 ID) 또는 `v`(JSON 호환 값) 중 하나를 가집니다. 선택적인 `source`는 출처 키입니다. 파일 간 엔터티 ID 중복과 존재하지 않는 관계 목적어는 오류입니다.
- `rag_docs/**/*.md`: YAML frontmatter에 `source`, `doc_type`, `lang`, `title`, `entities`, `store_id`를 두고 뒤에 본문을 씁니다. 파일의 상대 경로가 `doc_key`입니다. 상인 API용 문서 키는 `merchant_tip:<uuid>`입니다.

샘플에는 분류 2개, 품목 5개, 확인 포인트 5개, 저장 조건 2개, 긴 레시피 1개가 있습니다. 모든 본문 첫 줄에 검수 전 표시를 넣었습니다. 시연용 사실 자료로 사용하지 않습니다.
과일 KAMIS 코드는 제공 CSV에서 이름별 우선순위 1의 첫 행을 선택했습니다. CSV에 단위 열이 없어 샘플 `unit`은 `개`로 명시했습니다. 실제 가격 API의 거래 단위는 검수해야 합니다.

```sh
# 반드시 테스트 DB를 명시합니다. 운영 marketon에는 실행하지 않습니다.
export DATABASE_URL=postgresql://localhost:5432/marketon_test
export EMBEDDING_PROVIDER=fake
python -m scripts.load_all --embed
python -m scripts.load_all --no-embed
python -m scripts.load_documents --prune
python -m scripts.search "파 고르는 법" --lang ko --k 5
```

`--prune`은 사라진 파일 문서를 삭제하며 `merchant_tip:` 키는 보존합니다. 기본 적재는 삭제하지 않습니다.
같은 문서 해시면 건너뜁니다. 해시 필드는 작업 지시서대로 출처·유형·언어·제목·점포·본문이며, `entities`만 수정하거나 온톨로지 라벨만 바꿔도 기존 문서를 다시 태깅하지 않습니다.
`fake`는 해시 특징으로 만든 결정적 단위 벡터이며 연결·검색 흐름 검증용입니다. 실제 의미 검색 품질은 Gemini로 별도 평가해야 합니다.
