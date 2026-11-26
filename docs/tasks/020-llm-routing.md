# 작업 지시서 020 · [2-0b] 모델 라우팅 — 기본은 Gemma, 성능이 필요할 때 GPT

- 담당: Codex · 지시: Claude · 2026-11-25 · 승인: 병수 (2단계, "성능을 올려야 하는 부분에서는 GPT 모델을 쓰게 유기적으로")
- 기존: `llm/factory.py`(공급자 선택), `llm/ollama.py`·`gemini.py`·`fake.py`, `llm/json_output.py`(사진 인식 + JSON 재요청), `services/scan_service.py`
- 범위: `backend/`만 (프론트는 계약 타입에 `model`만 추가). 패키지 추가 금지 — OpenAI는 **`core/http.py`(httpx)로 REST 호출**. 끝나면 `ruff format`

## 1. 원칙
- **기본은 Gemma(자체 서빙, 비용 0)**. 결과가 부족할 때만 GPT로 **다시 시도**(escalation), 또는 작업 자체가 어려운 곳은 GPT를 먼저
- 어떤 모델이 답했는지 응답·기록에 남겨서 발표에서 보여 줄 수 있게 ("Gemma가 못 알아본 사진 → GPT가 다시 봤어요")
- GPT 키·모델이 없으면 GPT 단계는 **조용히 건너뜀** (지금과 똑같이 동작)

## 2. 설정 (`core/config.py`, `.env.example`에 적을 값은 보고에만 — `.env` 수정 금지)
- `OPENAI_API_KEY` (없으면 GPT 비활성), `OPENAI_CHAT_MODEL` (**기본값 없음** — 병수가 정함, 비어 있으면 비활성), `OPENAI_BASE_URL` 기본 `https://api.openai.com/v1`
- `LLM_ROUTES` (JSON 문자열) 기본값:
  ```json
  {"recognize": ["gemma", "openai"], "ask": ["gemma", "openai"], "recommend": ["gemma", "openai"], "chat": ["openai", "gemma"]}
  ```
  목록 순서 = 시도 순서. 키는 작업 이름, 값은 `_provider()` 이름

## 3. 구현
- `llm/openai.py` `OpenAIProvider(LLMProvider)`: Chat Completions `POST {base}/chat/completions`, 이미지는 `data:` URL `image_url`, `generate()`만 (도구 호출은 2-4에서). 키는 로그·예외에 안 나오게 (기존 `_MaskServiceKey` 방식 참고, `Authorization` 헤더)
- `llm/router.py`:
  ```python
  def run(task: str, call: Callable[[LLMProvider], T], accept: Callable[[T], str | None] = lambda _: None) -> Routed[T]
  # Routed = {value, provider, model, escalated: bool, reason: str | None}
  ```
  - `LLM_ROUTES[task]` 순서대로 공급자를 만들고 `call(provider)` 실행
  - 예외(시간 초과·HTTP·AppError) → 다음 공급자, 이유 `error`
  - `accept(value)`가 문자열(이유)을 돌려주면 → 다음 공급자 (마지막 공급자면 그 값을 그대로 사용)
  - 설정이 없는 공급자(키·모델 없음)는 건너뜀, 모두 실패하면 마지막 예외를 그대로
  - 공급자별 시간 제한: Gemma 45초, GPT 30초 (설정 상수 한 곳)
- `json_output.recognize_labels`를 라우터로: `task='recognize'`, `accept`는 **서비스가 넘김** — `scan_service`에서
  - 라벨 없음 → `no_labels`
  - 온톨로지 후보가 없거나 1순위가 `other:*` → `unknown_item`
  - 1순위 신뢰도 < 0.6 → `low_confidence`
  - (가격표는 판단 기준에 넣지 않음 — 가격표 없는 사진이 정상이므로)
- 기록: 마이그레이션 **`0013_llm_calls.sql`** `llm_calls(id, task, provider, model, ms int, escalated bool, reason text null, ok bool, created_at)` — **프롬프트·사진·답변 내용은 저장하지 않음**. 저장 실패해도 요청은 정상. SQL은 `db/repositories`
- `RecognizeResponse += { model: string }` (예: `"gemma4:e4b"`, `"openai:<모델>"`) — 백엔드 스키마 + `frontend/src/types/contract.ts` + mock

## 4. 테스트 (네트워크 없음 — 공급자는 가짜로)
- 라우터: 1순위 성공 → escalated false / 1순위 예외 → 2순위, reason `error` / accept 거절 → 2순위 + reason / 마지막도 거절이면 마지막 값 / 키 없는 openai 건너뜀 / 모두 실패 → 예외
- OpenAI 요청 모양: URL·Authorization·model·이미지 data URL (httpx 모킹), 키가 로그에 안 나옴
- 사진 인식: Gemma가 `other:pineapple` → GPT 결과 사용 + `model` openai / Gemma 정상 → GPT 호출 안 함 / GPT 키 없음 → Gemma 결과 그대로 (지금 동작과 동일)
- `llm_calls` 기록(DB 테스트), 계약 키
- 기존 테스트 유지

## 하지 말 것
- 패키지 추가(openai SDK 금지), `.env` 수정, 0001~0012 수정, 커밋, 실제 외부 호출, 프롬프트·사진·답변 저장, `marketon` DB 접근

## 자체 검수
- [ ] 백엔드 `pytest`(DB 막히면 보고 — Claude가 검증)·`ruff format`, 프론트 `build`·`test`
- [ ] LLM 호출은 `llm/`, HTTP는 `core/http.py`, SQL은 `db/`

## 보고 (한국어, 한 번)
변경 파일, 라우팅 흐름, `.env.example`에 추가할 변수, 검수 결과, 남은 문제
