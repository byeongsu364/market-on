# 작업 지시서 036 · 품종 설명·수확 시기·동의어, 최근 4주 시세, 마감세일·점포 품종

- 담당: Codex · 지시: Claude · 2026-11-27 · 승인: 병수 ("남은기능 개발하자")
- 근거: `docs/tasks/030-api-gaps.md`. 프런트 타입 `VarietyExtra`(`description`, `description_source`, `harvest`), `VarietyHarvest`, `PriceHistory`, `StoreExtra.varieties` — **이름·모양 그대로**
- 범위: `data/ontology/items.yaml`(품종 attrs만), `backend/`, `frontend/`(live 연결), `030-api-gaps.md`. 패키지 추가 금지

## 1. 품종 설명 (온톨로지)
- 품종 엔터티 `attrs`에 `description`(한 문장, 해요체), `description_source`(출처 키) 추가. **아래 문장만** (원문: `data/rag_docs/*/varieties.md`, 새 사실 금지):
  - `variety:apple-fuji`: "완전히 익으면 과육 속에 꿀이 생기고 저장성이 좋아요." — `src:nongsaro-month-food-apple`
  - `variety:apple-hongro`: "국내에서 처음 육성한 품종이에요." — `src:nongsaro-month-food-apple`
  - `variety:sweet_persimmon-fuyu`: "한 개 220~230g 정도, 껍질은 등황색, 당도는 15~16°Bx 정도예요." — varieties.md의 해당 출처 키
  - 나머지 품종(시나노골드·신고·대파·양파)은 넣지 않음 → `null`
- 출처 키는 각 varieties.md frontmatter `source`와 같게. 적재 테스트 갱신

## 2. 품종 API
- `/prices` 응답 `varieties[]`와 품종 목록에 `description`, `description_source`(출처 제목), `harvest`(온톨로지 `harvestPeriod`의 `{label, from, to}`, 없으면 null — `knowledge/season.py` 재사용), `synonyms`(엔터티 ko 라벨 중 이름 외: 후지 → ["부사"])
- 품목 검색(`/items/search` 등 기존 검색)이 품종 동의어로도 품목을 찾음("부사" → 사과, 결과에 `variety_id`)

## 3. 최근 4주 시세
- `GET /prices/history?item_id=&variety_id=&market_id=&weeks=4`(weeks 1~8) → `{item_id, variety_id, unit, points:[{week_start(월요일, 서울), price|null}], source}`
- 값: `price_service.get_price`와 **같은 기준**(같은 지역·전통시장 평균, 같은 단위 환산)을 주별 평균. 데이터 없는 주는 `price: null`
- SQL은 `db/`

## 4. 마감세일·점포 품종
- 마이그레이션 `0018_variety_links.sql`: `closing_sales.variety_id`(nullable, 그 품목의 품종만), `store_item_varieties(store_id, item_id, variety_id, primary key 3개)`
- `POST /merchant/sales`에 `variety_id`(선택, 품목의 품종이 아니면 422), 공개 세일 응답에 `variety_id`·`variety_name`
- `PATCH /merchant/store`에 `varieties: {item_id: [variety_id]}`(판매 품목의 품종만) → 지도 응답 점포 `varieties`(variety id 목록)
- 화면: SaleNew 품종 칩, StoreEdit 품목별 품종, Variety·Result의 설명·수확 시기·4주 그래프를 live 값으로(없으면 숨김 유지)

## 5. 테스트
- 적재(description 3개·출처 존재), varieties 응답 필드, 동의어 검색, history(주 경계·null 주·단위·지역 기준이 get_price와 같음·weeks 범위), 세일 품종 검증, 점포 품종 저장·지도 반영, 마이그레이션 제약
- 화면: 설명·수확 시기·그래프 표시, 세일 품종 선택, 점포 품종 저장
- 전체 프런트 테스트를 **3번 연속** 돌려 모두 통과(불안정하면 원인 수정, 시간 제한 늘리기 금지)

## 하지 말 것
- 패키지 추가, `.env` 수정, 기존 마이그레이션 수정, 커밋, `marketon` DB 접근(시세 과거 데이터 적재는 Claude가 `update_prices.py --days`로), 표에 없는 품종 설명, 가격 띠(band) 만들기
