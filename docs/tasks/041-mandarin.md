# 작업 지시서 041 · 품목 추가: 귤

- 담당: Codex · 지시: Claude · 2026-11-27 · 승인: 병수 ("귤과 딸기만 추가" → "딸기 빼 그냥" → "그렇게 진행하자")
- 딸기는 넣지 않음: 「이달의 식재료」 API에 없고, 고르는 법의 공공누리 1유형 출처를 찾지 못함
- 출처: 공공데이터포털 「농식품 이달의 식재료」 API(15168024, 이용허락범위 제한 없음) `foodCont` `srchFdmtSn=144`(귤), 12월 목록. **아래 문장만** 쓰고 새 사실을 더하지 않음
- 범위: `data/`(온톨로지·출처·근거 문서), `backend/`(테스트 고정값), `frontend/`(아이콘·이미지 연결·mock). 패키지 추가 금지

## 1. 출처 (`data/sources.yaml`)
```yaml
# fdmtSn 144
src:nics-month-food-mandarin:
  title: 농식품 이달의 식재료 - 귤
  publisher: 농촌진흥청 국립식량과학원 (공공데이터포털)
  url: https://www.data.go.kr/data/15168024/openapi.do
  license: 공공데이터포털 이용허락범위 제한 없음
  kind: public_api
  retrieved_at: 2026-11-27
```

## 2. 온톨로지 (`data/ontology/items.yaml`, 기존 사과·단감 형식 그대로)
- `item:mandarin` · name_ko `귤` · labels ko `[귤, 감귤, 밀감]`, en `[mandarin, tangerine]` · vision 없음(040에서 실제 사진으로 채움)
- kamis `{ctgry_cd: "400", item_cd: "415", vrty_cd: "01", grd_cd: "04", unit: 개, unit_sz: "10"}` (aT 소매 품목코드표: 감귤·노지·10개)
- 확인 포인트 4개 (source 모두 `src:nics-month-food-mandarin`)
  - `skin`: 껍질이 얇고 껍질과 과육 사이에 빈 공간 없이 붙어 있어요
  - `shape`: 꼭지 부분이 튀어나오지 않고 좌우로 둥글고 납작해요
  - `stem`: 색이 짙은 주황색이고 꼭지는 녹색으로 단단히 붙어 있어요
  - `gloss`: 껍질에 지나치게 윤이 나지 않아요
- 관계
  - `hasGrade` → `variety:mandarin-open`(기본), `variety:mandarin-greenhouse`
  - `isA` → `cat:fruit`
  - `soldBy` → `unit:piece` `{count: 1, default: true}`
  - `inSeason` → `season:12` (source `src:nics-month-food-list`)
- 품종 엔터티 (설명·수확 시기 없음 — 출처 없음)
  - `variety:mandarin-open` · `노지` · labels ko `[노지, 노지감귤]` · kamis vrty_cd `01`
  - `variety:mandarin-greenhouse` · `시설` · labels ko `[시설, 하우스감귤]` · kamis vrty_cd `02`
  - 두 품종 kamis 나머지 값은 품목과 같게 (`unit: 개`, `unit_sz: "10"`)

## 3. 근거 문서 (`data/rag_docs/mandarin/`, 형식은 `data/RAG_FORMATS.md`·사과 문서 그대로, 첫 줄 `> 초안 · 검수 전 (Claude 작성 2026-11-27, 출처 대조 필요)`)
- `criterion.md` (doc_type `criterion`, "귤 고를 때 확인할 점"): 위 확인 포인트 4개를 해요체 문장으로, 마지막 문장 "껍질에 지나치게 윤이 나는 것은 인공적으로 숙성시킨 뒤 코팅한 것이라 피하는 것이 좋다고 안내해요."
- `storage.md` (doc_type `storage`, "귤 집에서 보관하는 법"):
  - 물기를 없앤 귤은 상자에 신문지와 귤을 번갈아 쌓아 바람이 잘 드는 서늘한 곳에 두어요.
  - 귤끼리 서로 맞닿지 않게 하나씩 떨어뜨려 두면 상하지 않고 오래 보관할 수 있어요.
- `prep.md` (doc_type `prep`, "귤 씻고 손질하는 법"):
  - 물 1L에 소금 2큰술을 풀어 3~5분 씻은 뒤 물기를 없애요.
  - 이렇게 씻으면 농약을 없애고 신선도를 유지하는 데 도움이 된다고 안내해요.
- `varieties.md` (doc_type `story`, "귤 품종과 특징"):
  - 우리나라에서 '감귤', '귤'이라 부르는 것은 감귤류 가운데 만다린 계통의 온주밀감으로, 밀감류의 대표 품종이에요.
  - 감귤은 국내 소비량 1위인 우리나라 겨울철 대표 과일이에요.
- 문서 끝 `출처: 농식품 이달의 식재료 - 귤 (농촌진흥청 국립식량과학원, 공공데이터포털)`
- `data/RAG_REVIEW.md` 문서 목록 표에 귤 4개 추가

## 4. 화면
- `frontend/public/items/mandarin.svg`: 기존 `persimmon.svg`·`apple.svg`와 같은 크기·선 굵기·색 규칙의 귤 아이콘 (기존 파일을 열어 스타일을 맞춤, 출처는 자체 제작으로 `data/SOURCES.md` 등 이미지 출처 기록 위치에 한 줄)
- `utils/itemImage.ts`에 `item:mandarin`, `variety:mandarin-open`, `variety:mandarin-greenhouse` → `mandarin`
- mock(`api/mock/*`)에 귤 품목·품종·시세 예시를 다른 품목과 같은 방식으로 (예시 값 주석)

## 5. 테스트
- 품목·품종·확인 포인트·근거 문서·출처 수가 고정된 테스트 갱신 (품목 6, 품종 9, 근거 문서 +4, 제철 관계 +1 등 — 실제 값으로)
- 귤: 적재, 확인 포인트 4개 출처 존재, `inSeason` 12월, 기본 품종 노지, `/items/in-season?month=12`에 귤
- 시세 수집 대상(`update_prices`)에 귤 품종 2개가 잡히는지 (네트워크 없이, 대상 목록만)
- 백엔드 `TEST_DATABASE_URL=postgresql:///marketon_test` 전체, 프런트 전체 3번 연속 통과

## 하지 말 것
- 패키지 추가, `.env` 수정, 마이그레이션(필요 없음), 커밋, `marketon` DB 접근(적재·시세 수집은 Claude), 위 목록에 없는 문장·품종 설명·수확 시기·산지, 딸기
