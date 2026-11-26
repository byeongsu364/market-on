# 작업 지시서 039 · 레시피로 장보기 (재료 → 같은 시장 점포)

- 담당: Codex · 지시: Claude · 2026-11-27 · 승인: 병수 ("039 레시피도 이어서 진행하자")
- 근거: 기획서 v1 "레시피 RAG" — 레시피의 역할은 요리 알려 주기가 아니라 **재료를 같은 시장 안 점포로 이어 주는 장보기 목록**. AI는 레시피를 새로 짓지 않고, 만드는 법은 **원문 그대로 + 출처**
- 기존: `data/rag_docs/recipes/foodsafety-*.md` 11개(식약처 조리식품 레시피 DB COOKRCP01, `src:foodsafety-cookrcp01`, 이용허락범위 제한 없음), `backend/scripts/import_recipes.py`(API 응답 → md, 우리 품목이 재료에 든 것만), 새 화면 Shop의 "레시피로 장보기"(mock), `entities.type`에 `recipe` 허용, 관계 `usedIn`·`suitsWeather` 허용
- 범위: `backend/`, `frontend/`, `data/ontology/`, `data/rag_docs/recipes/`(재생성만). 패키지 추가 금지

## 1. 온톨로지
- `scripts/import_recipes.py`가 md와 함께 **`data/ontology/recipes.yaml`**도 만들게:
  - 엔터티 `recipe:foodsafety-<RCP_SEQ>`, type `recipe`, name_ko 메뉴명, `source: src:foodsafety-cookrcp01`, attrs `{dish_type, cook_method, kcal, doc_key}` (원본 필드 그대로)
  - 재료 줄을 파싱해 **우리 품목과 맞는 재료**는 관계 `usedIn`(품목 → 레시피), props `{role: 주재료|부재료, amount_text: 원문 양}`. 주재료 = 메뉴명에 품목 이름이 있거나 재료 첫 줄의 품목, 나머지 부재료
- `load_ontology`가 파일 맨 위 `relations:` 목록(주어를 직접 적는 `{s, p, o, props, source}`)을 읽을 수 있게 — 품목 엔터티는 `items.yaml`에 그대로 두고 레시피 쪽에서 관계를 적기 위해
- 우리 품목이 아닌 재료(두부·소고기·부추 등): **`data/ontology/ingredient_categories.yaml`** (팀 작성 규칙표, `source: src:team-draft`) — 재료 이름 키워드 → `store_category`(정육·수산·반찬·채소·과일·건어물·떡). 규칙표에 없으면 **"시장 밖 재료"**
- 계절: 주재료 품목들의 `inSeason` 달(교집합, 주재료가 하나면 그 품목 달). 없으면 빈 값 — 계산만 하고 저장하지 않아도 됨
- 날씨: `data/ontology/weather_rules.yaml` (팀 작성 규칙표, "팀 작성" 표시): `cold`(5℃ 이하) → 국&찌개·끓이기, `hot` → 후식·찌지 않는 것, `rain` → 부침·굽기, `snow` → 국&찌개, `clear` → 가중치 없음. 날씨 API는 이번에 붙이지 않음(요청 값으로만)
- 레시피 다시 수집: Claude가 `FOODSAFETY_KEY`로 `import_recipes.py --from-api` 실행해 **6품목(대파·양파·사과·배·단감·귤)이 주재료인 레시피**를 품목당 최대 5개로 늘림 — Codex는 픽스처로만 테스트

## 1-1. RAG 적재 (레시피는 RAG 문서이기도 함 — 온톨로지는 "무엇과 이어지나", RAG는 "무엇이라고 보여 주나")
- 지금도 `data/rag_docs/recipes/*.md`는 `doc_type: recipe`로 적재·임베딩돼 있음(문서 12개·청크 33개). 이 경로는 그대로 쓰고 아래만 바꿈
- **청크 규칙**: 레시피 1개 = 청크 2개 — ① 개요·재료(메뉴명·요리 종류·조리 방법·열량·재료 줄) ② 만드는 법. 기획서의 "한 품목 한 주제" 예외(레시피는 여러 품목에 걸침). `ingest.chunk_document`에 recipe 규칙 추가
- **청크 메타데이터**: 기존 `chunk_entities`(재료 품목 전부) + `rag_chunk` 뷰로 보이는 값에 `main_item_id`·`dish_type`·`cook_method`·`season_months`·`weather_tags`를 더함 — 문서 frontmatter에 `main_item`, `dish_type`, `cook_method`를 `import_recipes.py`가 써 주고, `season_months`·`weather_tags`는 적재 때 온톨로지(제철·날씨 규칙표)에서 계산해 청크 열(예: `chunks.props jsonb`, 새 마이그레이션 0024)에 저장
- 문서에서 "팁" 단락은 건강 효능 주장이 섞여 있어 **적재하지 않음**(import 단계에서 빼고, 기존 11개도 재생성)
- `quote_only: true`로 다뤄 AI가 레시피 본문을 바꿔 쓰지 않게

## 2. API
- `GET /recipes?item_id=&market_id=&month=&weather=&q=&limit=3`
  - 1) **구조 필터**(SQL, 온톨로지·청크 메타데이터): 그 품목이 주재료 → 이번 달(서울)이 `season_months`에 있는 것 → 날씨 규칙 가중치 → 재료가 이 시장에서 많이 구해지는 것
  - 2) **벡터 재정렬**(RAG): 자유 요청 `q`("아이랑 먹을 간단한 것")가 있을 때만, 1)에서 거른 후보의 레시피 청크를 pgvector로 검색해 상위 3개로 다시 정렬. `q`가 없으면 임베딩 호출 없음. 임베딩 서버가 없으면 1) 순서 그대로
  - 항목: `{recipe_id, name, dish_type, cook_method, kcal, main_item_id, reason, coverage: {total, in_market, stores}, ingredients: [{text, item_id|null, store_category|null, role, where: 'item'|'category'|'outside', stores: n}], source}`
  - `coverage`: "재료 5개 중 4개를 경동시장 점포 3곳에서" — 판매 점포는 지금 지도 데이터(`store_items`, 점포 카테고리)로 계산, **점포 수는 서로 다른 점포 기준 최소 조합**(재료마다 파는 점포 중 겹치는 점포를 우선 골라 센 수)
  - `reason`: **템플릿 한 줄**(AI 안 씀): "11월 제철 사과로 만드는 반찬" / 계절 없으면 "사과로 만드는 반찬" / 날씨 규칙이 맞으면 "추운 날 끓이는 국&찌개" — 판정·건강 효능 문구 금지
- `GET /recipes/{recipe_id}` → 위 항목 + `steps`(원문 그대로), 재료 원문 줄, 출처. 원문의 "팁"은 건강 효능 주장이 섞여 있어 **보여 주지 않음**
- `/ask` 의도 `recipe`("뭐 해 먹지", "요리", "레시피")는 질문 문장을 `q`로 넘겨 위 목록 상위 3개를 문장 없이 돌려줌(kind `recipes`, citations = 레시피 출처) — 화면이 카드로 그림
- 대화(`/chat`)에 도구 `find_recipes(item_id, q)` 추가 — 결과는 위 목록, 답 문장은 지금 규칙대로(040 `write`) 도구 결과와 대조

## 3. 화면
- 결과 화면(`pages/scan/Result.tsx`): "이 재료로 만드는 요리" 섹션 — 카드 3개(이름·종류·이유·"재료 5개 중 4개를 이 시장 3곳에서")
- 레시피 상세(바텀시트 또는 `/recipes/:id`): 재료 목록 — 우리 품목은 "이 시장 N곳" 칩(누르면 지도에 그 품목 점포), 카테고리 재료는 "정육 점포 N곳"(지도에서 그 구역), 시장 밖 재료는 "시장 밖 재료" 표시 / 만드는 법 원문 / 출처 "식품의약품안전처 조리식품 레시피 DB"
- Shop "레시피로 장보기": mock 대신 live (`/recipes?market_id=`)
- 새 디자인 컴포넌트·토큰 사용, 문구는 ko.json

## 4. 테스트
- 재료 파싱: 품목 매칭(대파·다진 대파·양파 1/2개), 역할, 카테고리 규칙, 시장 밖
- recipes.yaml 생성·적재(top-level relations), usedIn 수
- 정렬(주재료·달·날씨), coverage 최소 점포 수, reason 템플릿(판정어 없음), 상세에 팁 없음
- RAG: 레시피 청크 2개 규칙, 청크 메타데이터(main_item·dish_type·season_months·weather_tags), `q` 있을 때만 임베딩 1회·벡터 재정렬, 임베딩 실패 시 구조 순서 유지, 044 평가 질문에 레시피 문항 5개 추가(기획서 "시연 질문에 레시피 문항 5개")
- /ask recipe 의도, 화면 섹션·상세·Shop live, 픽스처로 import 테스트(네트워크 없음)
- 백엔드 `TEST_DATABASE_URL=postgresql:///marketon_test` 전체, 프런트 전체 3번 연속

## 하지 말 것
- 레시피 지어내기·분량 바꾸기·요약을 AI로 만들기, 건강 효능 문구, 패키지 추가, `.env` 수정, 기존 마이그레이션 수정(필요하면 새 번호 — 0024부터), 커밋, `marketon` DB 접근, 실제 API 호출
