# 작업 지시서 043 · 손님 제보 3명 확인·aT 범위 보류 + 보관 사실을 온톨로지로

- 담당: Codex · 지시: Claude · 2026-11-27 · 승인: 병수 ("3명 확인도 적용하자")
- 근거: 기획서 v1 — "Report → 확인 3명 이상이면 PriceObservation(origin=제보)", "aT 시세의 0.3~3배 밖이면 보류", 클래스 `Storage`(온도·기간, `storedAs`)
- 기존: `services/store_price_service.aggregate()` (7일, 기기별 최신 1개, 3개 이상이면 중앙값 ±30% 밖 제외, 상인 확인 우선), 표시 순서 상인 확인 → 손님 제보 → 시장 평균(030b)
- 범위: `backend/` + `frontend/`(문구) + `data/ontology/items.yaml`(보관 관계). 패키지 추가 금지

## 1. 제보 신뢰 규칙
- **3명 확인**: 7일 안에 서로 다른 기기 **3개 이상**의 제보가 있어야 손님 가격(`source='customers'`)으로 표시. 1~2명이면 손님 가격은 없음 → 시장 평균(또는 없음)으로 표시하고, 응답에 `pending_reporters: n`(1~2) 추가 → 화면 작은 글씨 "손님 n명 확인 중 · 3명이 되면 보여요"
- **aT 범위 보류**: 제보를 받을 때 그 품목·단위의 기준시세(`price_service.get_price`, 이 시장 기준)와 비교해 **0.3배 미만 또는 3배 초과**면 `price_reports.status='held'`로 저장(마이그레이션 `0022_report_status.sql`: `status text not null default 'ok' check (in ('ok','held'))`). 응답은 지금처럼 성공하고 `held: true`, 화면 문구 "기준시세와 차이가 커서 확인 후 반영돼요". 기준시세가 없으면 `ok`
- 집계는 `status='ok'`만. 중앙값 ±30% 제외 규칙은 그대로
- 상인 확인 우선(7일)과 시장 평균 채우기는 그대로
- `onto_node` 뷰(042)에서 report props에 status, 3명 이상 모인 점포·품목은 `price` 노드(`origin: '제보'`)로 — 042가 먼저 머지된 뒤면 뷰에 추가, 아니면 보고만

## 2. 보관 사실 (`storedAs`)
- `items.yaml`에 `storedAs` 관계, `v: {temp_c: [min, max], humidity_pct: [min, max]|null, label, note}`, **근거 문서에 있는 숫자만** (출처는 그 문서 source):
  - 사과: 0℃, 상대습도 90~95% (`src:nics-month-food-apple`) — label "0℃ · 습도 90~95%"
  - 배: 0℃, 상대습도 90~95% (`src:nics-month-food-pear`)
  - 단감: 0~2℃ (`data/rag_docs/sweet_persimmon/storage.md`의 해당 문장 출처)
  - 귤·대파·양파: 문서에 온도 숫자가 없으면 넣지 않음
  - 기간("한두 달", "1~3개월")은 문서 문장 그대로 `period_label`로, 해당 출처가 2유형이면 그 출처 키 그대로(상업화 전 교체 표시는 이미 있음)
- `entity_relations_predicate_check`에는 `storedAs`가 이미 있음 — 마이그레이션 불필요
- `/ask`: 질문에 "몇 도·온도·며칠·얼마나·기간·보관 기간"이 있고 그 품목에 `storedAs`가 있으면 **LLM 없이** 템플릿 답("사과는 0℃, 상대습도 90~95%에서 보관하는 게 알맞다고 안내해요.") + 출처. 없으면 지금 RAG 경로
- `knowledge/season.py`처럼 `knowledge/storage.py` (SQL은 `db/`)

## 3. 테스트
- 3명 규칙: 2명 → customers 없음·pending 2·시장 평균 표시, 3명 → customers, 같은 기기 여러 번은 1명, 7일 지난 제보 제외
- 보류: 0.29배·3.01배 held, 경계값 0.3·3배 ok, 기준시세 없음 ok, held는 집계 제외, 응답 held 플래그
- 보관: 적재(관계 수·출처 존재), /ask 온도 질문 LLM·임베딩 0회, 값 없는 품목은 RAG
- 화면: "손님 n명 확인 중" 문구, 제보 held 안내
- 백엔드 DB 테스트, 프런트 전체 3번 연속

## 하지 말 것
- 문서에 없는 보관 숫자, 판정 문구, 패키지 추가, `.env` 수정, 기존 마이그레이션 수정, 커밋, `marketon` DB 접근
