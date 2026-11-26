# 작업 지시서 023 · [2-3] `POST /recommend` 용도·예산별 장보기 구성 (H1·H2)

- 담당: Codex · 지시: Claude · 2026-11-26 · 승인: 병수 (2-3)
- 기존: 추천 화면 `pages/Recommend.tsx`(용도·관계·예산·인원 칩, 지금은 mock), 계약 `RecommendRequest/RecommendResponse`(`contract.ts`), 온톨로지 분류(`cat:vegetable`·`cat:fruit`, `isA`), 판매 단위(`soldBy`), `price_service`(기준시세·단위 환산), `market_service`(판매 점포), 근거 문서 `season`·`criterion`, `llm/router.py`(작업 `recommend`: Gemma → GPT), `knowledge/fact_check.py`, `knowledge/citation.py`
- 원칙: **품목·수량·금액은 코드가 정함, LLM은 이유 문장만** (숫자를 지어내지 않게). 판정·구매 권유 금지 — `fact_check`의 금지어(“추천” 포함)를 그대로 적용, 화면 제목도 "장보기 구성"
- 범위: `backend/` + `frontend/`. 패키지 추가 금지. 끝나면 `ruff format`, `npm run format`

## 1. 계약 (기존 모양 확장)
```ts
type RecommendRequest = {
  purpose: '집밥' | '선물' | '모임'; relation?: '가족' | '친구' | '나'; event?: string;
  budget: number; headcount: number; market_id: string;
};
type RecommendItem = {
  item_id: string; name: string;
  quantity: number; unit: string; unit_label: string;   // 예: 2, 'unit:bunch', '단'
  unit_price: number | null; subtotal: number | null;    // 기준시세(이 시장 지역 전통시장 평균) 기준 예상가
  reason: string;                                        // 1~2문장, 근거 문서에 있는 내용만
  stores: { store_id: string; name: string }[];          // 이 시장 판매 점포
  sources: Citation[];                                   // reason에 쓴 근거 출처 (2-1 Citation, draft 포함)
};
type RecommendResponse = {
  items: RecommendItem[]; total: number; budget: number; left: number;
  note: string;            // "기준시세로 계산한 예상 금액이에요. 실제 가격은 가게마다 달라요"
  model: string | null;    // 이유 문장을 쓴 모델 (전부 기본 문장이면 null)
};
```
- 검증: budget 5,000~500,000원, headcount 1~20, market_id 존재, 질문 횟수 제한은 `/ask`와 같은 기기 기준 시간당 60회 공유

## 2. 구성 규칙 (`services/recommend_service.py`, 순수 함수로 분리해 테스트)
1. **후보**: 이 시장에서 파는 품목(`store_items`) ∩ 기준시세가 있는 품목. 없으면 빈 구성 + note "이 시장에서 파는 품목의 시세가 아직 없어요"
2. **용도별 분류 비율** (상수 한 곳):
   - 집밥: 채소 먼저, 과일 1개 품목까지
   - 선물: **과일만**
   - 모임: 과일 우선, 채소 1개 품목까지
   - `relation`·`event`는 이유 문장 맥락으로만 씀 (구성 규칙에 쓰지 않음)
3. **수량** (판매 기본 단위 기준, 상수 한 곳): 과일 `piece` 1인당 1개(선물은 1인당 2개, 최소 3개) · 채소 `bunch`/`kg` 2~4인당 1단위(올림) · 품목 최대 4개
4. **예산 맞추기**: 단가 × 수량 합이 예산을 넘으면 → 수량을 1씩 줄이고(최소 1) → 그래도 넘으면 가장 비싼 품목부터 뺌. 합이 예산의 60% 미만이면 같은 분류 품목을 하나 더하거나 수량 +1 (예산 안에서). 결정적(같은 입력 같은 결과, 정렬 기준 명시)
5. **판매 점포**: 품목별 이 시장 판매 점포 이름 (최대 3, 마감세일 있는 점포 먼저)

## 3. 이유 문장 (LLM)
- 품목마다 근거: 그 품목 `season`·`criterion` 문서 조각(검색, `min_similarity` 없이 문서 종류 필터) + 코드가 만든 사실(용도·관계·인원·수량)
- **한 번의 호출로 전 품목** 이유를 JSON으로: `{"reasons": {"item:apple": {"text": "...", "used": [1]}}}` (프롬프트 `llm/prompts/recommend.txt`, 2-1 프롬프트처럼 "근거에 있는 내용만, 1~2문장, 해요체, 판정·구매 권유 금지", 숫자는 근거에 있는 것만)
- 각 이유에 `fact_check.check` 적용, 남은 문장 0개면 **기본 문장**: "{용도}에 맞춰 {수량}{단위} 넣었어요" (model 표시 대상 아님)
- 라우터 작업 `recommend` (Gemma → GPT). `used`의 문자열 숫자("1") 허용 (2-2에서 생긴 문제)
- 근거 문서 본문 정리는 `citation.clean_evidence` 재사용, 출처는 `attach_citations` 재사용
- 캐시: `response_cache`에 키 `recommend:{market}:{purpose}:{relation}:{headcount}:{budget}:{서울 날짜}:{문서 버전들}` (시세는 하루 단위라 날짜 포함)

## 4. 화면 (`pages/Recommend.tsx`)
- 제목 "장보기 구성", 칩 그대로 (용도·관계·예산·인원) + 시장은 현재 선택된 시장
- 결과: 품목 카드(이름 · **수량 단위** · 예상가 · 이유 · 판매 점포 칩 → 지도 · 출처(검수 전 표시)) + 하단 합계 "예상 합계 ○○원 / 예산 ○○원 (○○원 남음)" + note 문구 + 모델 표시(2-2 `AskAnswer`의 모델 표시 재사용)
- 로딩 "구성을 만들고 있어요"(5~15초), 503·429 문구는 2-2와 같게, 빈 구성 note 표시
- 판정 문구 금지, 새 색 금지, DESIGN.md 따름

## 5. 테스트
- 규칙(순수 함수): 용도별 분류, 수량(인원별), 예산 초과 시 줄이기·빼기, 60% 미만 채우기, 결정성, 후보 없음
- 이유: 가짜 LLM — 정상 / 숫자 지어냄 → 문장 제거 → 기본 문장 / "추천" 금지어 제거 / JSON 깨짐 → GPT 재시도 / 문자열 used 허용
- API: 검증(422), CSRF 403, 캐시 적중 시 LLM 0회, 계약 키
- 프론트: 요청 모양, 카드·합계·note·모델 표시, 로딩·오류
- 기존 테스트 유지

## 하지 말 것
- 패키지 추가, `.env` 수정, 마이그레이션, 커밋, `marketon` DB 접근, 실제 외부 호출, LLM이 수량·가격 결정, 판정·구매 권유 문구, 새 색

## 자체 검수
- [ ] 백엔드 `pytest`(DB 막히면 보고 — Claude가 검증)·`ruff format`, 프론트 `build`·`lint`·`test`·`format:check`
- [ ] LLM은 `llm/`, SQL은 `db/`, `fetch(`는 `api/client.ts`만

## 보고 (한국어, 한 번)
변경 파일, 구성 규칙 상수 위치, 계약 변경, 검수 결과, 남은 문제
