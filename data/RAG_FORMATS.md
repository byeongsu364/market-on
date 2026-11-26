# RAG 파일 형식

작업 경로는 `backend/`, Python은 저장소의 `.venv/bin/python`을 사용합니다.
적재 전 `DATABASE_URL`을 대상 DB로 명시하고 `python -m scripts.migrate`를 실행합니다.
검증용 대상은 `postgresql://localhost:5432/marketon_test`입니다.

- `sources.yaml`: `source_key`를 키로 하는 매핑. 값에는 `title`, `publisher`, `url`, `license`, `kind`, `retrieved_at`, 선택적인 `quote_only`(기본 false)를 둡니다. 키는 `src:<영어-kebab>` 형식입니다. 날짜는 YAML 날짜(`YYYY-MM-DD`)로 씁니다.
- `ontology/*.yaml`: 각 파일의 `entities` 목록을 합칩니다. `labels`는 언어별 목록이며 첫 라벨이 preferred입니다. `relations`는 `p`와 `o`(엔터티 ID) 또는 `v`(JSON 호환 값) 중 하나를 가집니다. 선택적인 `source`는 출처 키입니다. 파일 간 엔터티 ID 중복과 존재하지 않는 관계 목적어는 오류입니다.
- `rag_docs/**/*.md`: YAML frontmatter에 `source`, `doc_type`, `lang`, `title`, `entities`, `store_id`, 선택적인 `review_status`(`draft` 기본값, `reviewed`, `rejected`), `varieties`(해당 품목의 품종 ID 목록), `market_id`, `published`(YYYY-MM-DD)를 두고 뒤에 본문을 씁니다. 파일의 상대 경로가 `doc_key`입니다. 상인 API용 문서 키는 `merchant_tip:<uuid>`입니다.

샘플에는 분류 2개, 품목 5개, 확인 포인트 5개, 저장 조건 2개, 긴 레시피 1개가 있습니다. 모든 본문 첫 줄에 검수 전 표시를 넣었습니다. 시연용 사실 자료로 사용하지 않습니다.
과일 KAMIS 코드는 제공 CSV에서 이름별 우선순위 1의 첫 행을 선택했습니다. 조사 단위는 aT 소매 코드표의 대표 조사 단위로 채웠습니다.

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
같은 문서 해시면 건너뜁니다. 해시 필드는 작업 지시서대로 출처·유형·언어·제목·점포·본문·시장·발행일이며, 검수 상태·품종 목록도 해시에 포함합니다. `entities`만 수정하거나 온톨로지 라벨만 바꿔도 기존 문서를 다시 태깅하지 않습니다.
`fake`는 해시 특징으로 만든 결정적 단위 벡터이며 연결·검색 흐름 검증용입니다. 실제 의미 검색 품질은 Gemini로 별도 평가해야 합니다.


품목 ID는 `item:green_onion`, `item:onion`, `item:apple`, `item:pear`, `item:sweet_persimmon`처럼 영어 snake_case로 쓰며 문서 폴더도 품목 이름에 맞춥니다. 출처 예시는 `src:team-draft`입니다.
엔터티의 선택적인 `source`는 근거 출처이고, `vision: [green onion, scallion]`은 영어 vision 라벨입니다. 같은 영어 라벨이 labels에도 있으면 vision이 우선합니다.
관계의 선택적인 `props`는 JSON 속성입니다. 예: `{p: soldBy, o: 'unit:bunch', props: {factor_kg: 0.8, default: true}}`.
품목의 `criteria`는 `key`, `text`, 선택적인 `source`, `labels`를 가진 목록입니다. `crit:<품목>-<key>` 엔터티와 `hasCriterion` 관계를 자동 생성합니다. 출처는 criterion의 source가 우선이고 없으면 품목 source를 사용합니다. 파일에서 빠진 자동 생성 criterion은 삭제하며 직접 작성한 criterion은 보존합니다.

허용 doc_type: `criterion`, `grade`, `storage`, `prep`, `story`, `season`, `origin`, `safety`, `context`, `specialty`, `guide`, `recipe`, `merchant_tip`.
검색 intent 대응표는 `knowledge/intents.py`에서 관리합니다. intent와 doc_types를 같이 주면 교집합으로 검색하며 알 수 없는 intent는 오류입니다.

`entities.kamis`는 문자열 필드 `{ctgry_cd, item_cd, vrty_cd, grd_cd, unit, unit_sz}`입니다. 선행 0을 보존합니다. 등급은 상품 `04`, 단위는 원본 단위명과 수량을 분리합니다(사과: `개`, `10`). 사과 기본 품종은 후지(05)입니다. 품종은 `variety:<품목>-<품종>` 엔터티와 품목의 `hasGrade` 관계로 연결하며 기본 관계는 `props: {default: true}`입니다. `sync_kamis_codes`는 비어 있는 품목의 이름 후보만 출력합니다.
`update_prices --days 7 --date 2026-11-24 --item item:green_onion`으로 기간 수집합니다. 실제 API 응답 단위를 관측값에 저장합니다. `PriceView.compare`는 판매 단위당 전통시장 평균(없으면 전체) 대비 백분율이며 음수는 저렴함입니다. 개수 단위는 무게로 환산하지 않습니다.
온톨로지 prune은 조각 태그만 참조하는 엔터티를 삭제하고 영향 문서 해시를 고유한 `retag:<document id>`로 바꿉니다. 다음 문서 적재에서 다시 태깅합니다. 운영 데이터와 다른 엔터티의 목적어 참조는 삭제를 막습니다.

품종별 수집은 `python -m scripts.update_prices --days 7 --item item:apple`로 실행합니다. `hasGrade`의 모든 품종을 수집하고 관측값에 부모 `item_id`와 `variety_id`를 저장합니다. 기존 행은 온톨로지 적재 후 `python -m scripts.update_prices --backfill-varieties`로 품목·품종 코드를 대조해 한 번 채웁니다 (`--item`으로 범위 제한 가능, 이미 채운 행은 보존, API 호출 없음). 이 명령들은 이번 구현 검증에서 실제 DB에 실행하지 않았습니다.

검수 완료 시 frontmatter에 `review_status: reviewed`를 적습니다. `rejected`도 적재하지만 검색에서는 제외합니다. 본문 첫 줄의 초안 표시는 보조 표시이므로 검수 후 지웁니다.
청크 `numbers`는 숫자·단위의 원래 표기(예: `0℃`, `90~95%`, `한두 달`)를 보존합니다. `varieties`가 하나면 그 품종을, 여러 개면 청크의 한국어 라벨로 하나만 확인될 때 그 품종을 기록합니다. 목록이 없으면 문서 품목의 한국어 품종 라벨이 하나만 나타날 때 추론합니다. 모호하면 `variety_id`는 NULL입니다.

그래프는 `0021_onto_views.sql`의 일반 SQL 뷰로 제공하며 원본 표를 그대로 조회합니다.

| 뷰 | 열 |
|---|---|
| `onto_node` | `id`, `type`, `name`, `props`, `source_key` |
| `onto_edge` | `subj`, `pred`, `obj`, `obj_value`, `props`, `source_key` |
| `rag_chunk` | `chunk_id`, `document_id`, `item_ids`, `node_type`, `intent`, `variety_id`, `numbers`, `review_status`, `source_key`, `license`, `quote_only`, `chunk_hash`, `lang` |

`rag_chunk.intent`는 `knowledge/intents.py`와 같고, 온톨로지로 처리하는 `season`은 NULL입니다.
공개 읽기 API `GET /ontology/items/{item_id}/graph?depth=1`은 `{nodes, edges}`를 반환합니다. 깊이는 1~2, 노드·관계는 각각 최대 200개이며 가격 관측·제보는 최근 7일만 포함합니다. 기기 해시·사용자 ID는 뷰에도 넣지 않으며 `confirmedBy` 목적어는 `merchant`입니다.
