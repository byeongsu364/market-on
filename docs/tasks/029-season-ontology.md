# 작업 지시서 029 · 제철을 온톨로지로 (RAG season 문서 제거)

- 담당: Codex · 지시: Claude · 2026-11-26 · 승인: 병수 ("온톨로지에 시즌 탑재 및 RAG에서 시즌 제거")
- 이유: 제철·수확 시기·산지는 **달·기간·장소라는 정해진 값**이라 문서 검색(RAG)보다 온톨로지 관계가 맞음. 답이 정확하고(숫자를 AI가 다시 쓰지 않음), 홈 "이달의 제철"·장보기 구성·대화가 같은 값을 씀
- 기존: `data/rag_docs/<품목>/season.md` 5개(농사로 출처, 2026-11-25 초안), `entities.type`에 `season`·`region` 허용, `region:seoul`(`regions.yaml`), 품종 엔터티(`hasGrade`, 2-5), `knowledge/intents.py`(season ↔ 문서), `ask_service`(season 의도 → 검색 → LLM), `recommend_service.PURPOSE_DOC_TYPES`(선물·모임에 season)
- 범위: `data/` + `backend/` + `frontend/`(홈 한 섹션). 패키지 추가 금지. 끝나면 `ruff format`, `npm run format`

## 1. 온톨로지 데이터 (아래 값만 — 새 사실을 더하지 말 것)

### 1-1. 달 엔터티 `data/ontology/seasons.yaml`
`season:01` … `season:12`, type `season`, name_ko `1월`…`12월`, labels ko `[1월]`, en `[January]`…

### 1-2. 관계 (모두 `source` 필수 — 괄호 안 출처 키)
| 주체 | 관계 | 값 | 출처 |
|---|---|---|---|
| item:apple | `inSeason`(팀 설계 관계 이름) → season:09, season:10 | (이달의 식재료 소개 달) | src:nongsaro-month-food-list |
| item:pear | `inSeason`(팀 설계 관계 이름) → season:09, season:10 | | src:nongsaro-month-food-list |
| item:sweet_persimmon | `inSeason`(팀 설계 관계 이름) → season:11 | | src:nongsaro-month-food-persimmon |
| item:onion | `inSeason`(팀 설계 관계 이름) → season:06 | | src:nongsaro-month-food-list |
| item:green_onion | `inSeason`(팀 설계 관계 이름) → season:03 | | src:nongsaro-month-food-list |
| item:onion | `harvestPeriod` v `{label: '4~6월', from: '04', to: '06', note: '가을에 씨를 뿌려 이듬해 수확'}` | | src:nongsaro-month-food-onion |
| item:onion | `harvestPeriod` v `{label: '9월 상·중순', from: '09', to: '09', note: '고랭지 여름양파'}` | | src:nongsaro-month-food-onion-2 |
| item:green_onion | `harvestPeriod` v `{label: '가을~겨울', note: '일반적으로 늦가을이나 초봄에 씨를 뿌려 수확'}` | | src:nongsaro-month-food-green-onion |
| variety:apple-fuji | `harvestPeriod` v `{label: '10월 하순 이후', from: '10', note: '만생종'}` | | src:nongsaro-month-food-apple |
| variety:apple-hongro | `harvestPeriod` v `{label: '9월 상·중순', from: '09', to: '09', note: '중생종'}` | | src:nongsaro-month-food-apple |
| variety:sweet_persimmon-fuyu | `harvestPeriod` v `{label: '10월 하순~11월 상순', from: '10', to: '11', note: '남부 주산지는 대개 11월 상순'}` | | src:nongsaro-month-food-persimmon |
| item:green_onion | `producedIn` → region:busan-myeongji(부산 북구 명지), region:jeonnam-coast(전남 해안지방), region:chungnam-asan(충남 아산) | | src:nongsaro-month-food-green-onion |
- 위 세 지역 엔터티를 `regions.yaml`에 추가 (type region, labels ko)
- 시나노골드·신고는 출처에 수확 시기가 없어서 **넣지 않음** (화면에서 "수확 시기 정보 없음")
- `from`/`to`는 월(두 자리 문자열), 상·중·하순은 `label`로만 (지어낸 날짜 금지)

### 1-3. RAG 문서 정리
- `data/rag_docs/*/season.md` **5개 삭제**
- 제철·시기·산지가 **아닌** 설명은 `data/rag_docs/<품목>/varieties.md` (doc_type `story`, 제목 "○○ 품종과 특징")로 옮김. 옮길 문장 (season.md 원문 그대로, 시기·달 표현은 빼고):
  - 대파: 연백 재배 '대파'·'움파' 설명, 추위·더위에 강해 전역 재배, 한지형·난지형·중간형
  - 양파: 단일형 품종 설명(시기 빼고), 고랭지 여름양파 알 무게 200~300g, 황색·백색·적색 구분과 특징
  - 사과: 조생종·중생종·만생종 구분과 품종 이름(시기 괄호는 빼고), 후지 꿀·저장성, 홍로는 국내 첫 육성 품종, 후지·홍로·쓰가루 재배면적 90%
  - 배: 녹수 상온 저장력 10일, 추석 출하용 품종들, 37개 품종 육성(2017년까지)
  - 단감: 만생종 94%·부유 82.7%, 부유 220~230g·등황색·15~16°Bx, 국내 육성 품종 감풍·조완·로망·원미
- **단감 "0℃에서 1~3개월 냉장 저장"은 `sweet_persimmon/storage.md`로** (출처 `src:rda-persimmon-postharvest` — 공공누리 제2유형, 상업화 전 교체 대상으로 이미 표시됨. 문서 끝 `출처:` 줄에 추가)
- 각 새 문서 첫 줄 `> 초안 · 검수 전 (Claude 작성 2026-11-25, 출처 대조 필요)` 유지, frontmatter 형식은 `data/RAG_FORMATS.md`
- `data/RAG_REVIEW.md`의 문서 목록 표에서 `season.md` → `varieties.md`, "제철·품종·산지는 온톨로지(`data/ontology/items.yaml`, `seasons.yaml`)에서 검수" 한 줄

## 2. 백엔드
- `knowledge/season.py` (온톨로지 읽기, SQL은 `db/`): `season_facts(conn, item_id, month=None)` → `{featured_months: [11], harvest: [{variety_id|null, variety_name|null, label, note, source}], regions: [{id, name}], sources: [Citation]}`
- **`/ask` season 의도 = LLM·검색 없이 온톨로지로 답** (`ask_service`):
  - 문장 템플릿(해요체, 사실만): "농사로 '이달의 식재료'에서 단감을 11월 식재료로 소개해요." / "부유는 10월 하순~11월 상순에 수확해요(남부 주산지는 대개 11월 상순)." / "대파는 부산 북구 명지, 전남 해안지방, 충남 아산에서 많이 재배해요." / 수확 정보 없는 품종은 문장 없음
  - 질문에 품종 이름이 있으면 그 품종만, 없으면 품목 전체
  - 사실이 하나도 없으면 `no_evidence` ("이 품목의 제철 자료가 아직 없어요")
  - `kind: 'answer'`, `model: null`, citations = 쓴 관계의 출처, 캐시 불필요(빠름)
- 새 의도 **`story`**(특징·종류): 키워드 `특징·종류·맛이 어때·차이` → doc_type `story` 검색 → 기존 LLM 경로. `품종` 키워드는 season(수확 시기)과 story 둘 다 걸리면 **season 우선** (기존 동작 유지)
- `intents.py`: `season` 문서 매핑 제거(문서 없음), `story`는 이미 있음 확인
- `recommend_service`: `PURPOSE_DOC_TYPES`에서 `season` 제거, 대신 **선물 이유의 근거에 `season_facts` 문장을 추가 근거로** (번호 붙은 근거 목록 끝에, 출처 포함) — "11월 식재료로 소개해요" 같은 이유가 나올 수 있게
- `GET /items/in-season?month=` (기본: 서울 기준 이번 달) → `inSeason`(팀 설계 관계 이름)이 그 달인 품목 `[{item_id, name, label: "11월 식재료"}]`
- 계약·mock·계약 키 테스트

## 3. 화면
- 홈 "오늘 기준시세" 위에 **"11월 제철"** 칩 섹션 (`/items/in-season`), 칩 → 결과 화면. 없으면 섹션 숨김. 아래 작은 출처 "농사로 '이달의 식재료' 기준"
- 결과 화면 물어보기의 [제철] 칩은 그대로 (`/ask` season이 이제 온톨로지 답)

## 4. 테스트
- 적재: 달 12개·`inSeason`(팀 설계 관계 이름)·`harvestPeriod`(item·variety)·`producedIn`·지역 3개, 출처 모두 존재, season.md 없음, varieties.md 5개(doc_type story), 문서 수·엔터티 수 고정값 갱신
- season_facts: 단감(featured 11, 부유 수확), 사과(9·10월, 후지·홍로, 시나노골드 없음), 대파 산지, 없는 품목
- /ask season: LLM·임베딩 0회, 문장·출처, 품종 지정, no_evidence / story 의도 라우팅 / 기존 ask 테스트 유지
- recommend: season 문서 검색 안 함, 선물 근거에 제철 문장 포함
- in-season API, 홈 섹션 표시·숨김
- 기존 테스트 유지

## 하지 말 것
- 패키지 추가, `.env` 수정, 기존 마이그레이션 수정(새 마이그레이션 필요 없음 — entities·relations로 충분), 커밋, `marketon` DB 접근, **표에 없는 제철·산지 값 추가**, 판정 문구("지금이 제일 맛있어요" 등)

## 자체 검수
- [ ] 백엔드 `pytest`(DB 막히면 보고 — Claude가 실제 적재·질문 확인)·`ruff format`, 프론트 `build`·`lint`·`test`·`format:check`
- [ ] SQL은 `db/`, LLM은 `llm/`

## 보고 (한국어, 한 번)
변경 파일, 온톨로지 관계 목록, 옮긴 문장, /ask season 문장 예, 검수 결과, 남은 문제
