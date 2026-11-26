# 작업 지시서 040 · 구글 비전 품목 인식 + 젬마 헤드 에이전트 역할 나누기

- 담당: **신태빈** · 지시: 김병수(Claude 정리) · 2026-11-27 · 상태: **[확정]** 설계 / 구현 전
- 브랜치: `popcorn` 최신(`81561aa` 이후)에서 새 브랜치로 시작해 주세요. 끝나면 PR 또는 병수에게 알려 주세요.
- 배경: 대회 신청서에는 "Google Cloud Vision으로 품목 인식"이라고 적었는데, 지금은 젬마가 사진을 보고 품목과 가격표를 한 번에 읽어요(`services/scan_service.py` → `llm/json_output.recognize_labels`). 이걸 신청서와 팀 설계에 맞게 바꿔요.

## 0. 결정한 것 [확정]

| 항목 | 결정 |
|---|---|
| 품목 인식 | **구글 비전만** 써요. 젬마·제미나이·GPT는 사진을 보지 않아요 |
| 가격표 읽기 | **구글 비전 글자 인식(OCR)** 결과를 코드로 풀어요 (가격·단위·수량은 정규식, 품종 글자는 온톨로지 라벨). AI 모델을 부르지 않아요 |
| 젬마 | **헤드 에이전트.** 요청을 받아 역할을 나눠 주고, 마지막 **한국어 답변**을 써요 (한국어 답변 품질이 좋아서) |
| 제미나이 → GPT | 젬마가 맡기는 일: ① 대화에서 도구 고르기·계획 ② 근거가 길거나 여럿일 때 필요한 사실만 뽑기 ③ 젬마가 실패하거나 사실 확인을 통과하지 못하면 대신 답하기 ④ 장보기 이유 문장 |
| 속도 | 입구에서 매번 젬마를 부르면 느려요(아래 표). **일 나누기는 규칙(키워드)으로 먼저** 하고, 규칙으로 안 될 때만 젬마가 판단해요 |

지금까지 기록된 호출 시간 (`llm_calls`, 2026-11-27 기준 중앙값):

| 작업 | 젬마 | GPT |
|---|---|---|
| 물어보기 답변 | 5.6초 | 2.9초 |
| 장보기 이유 | 6.3초 | — |
| 대화(도구 호출) | — | 5.3초 (느릴 때 13.9초) |

## 1. 구글 비전 품목 인식

### 1-1. 호출 (`backend/app/clients/vision.py`, 지금은 빈 자리)
- `POST https://vision.googleapis.com/v1/images:annotate`, 키는 `settings.GOOGLE_VISION_API_KEY` (헤더 `x-goog-api-key`, 코드·로그에 키 남기지 않기)
- features: `LABEL_DETECTION`(maxResults 10) + `TEXT_DETECTION` **한 번에** (사진 한 장 = 2건으로 계산)
- 공통 호출은 `core/http.py` 사용 (타임아웃·재시도), 연결 5초 제한(`llm/limits.http_timeout`과 같게)
- 하루 호출 한도 `VISION_DAILY_LIMIT`(기본 300) — `llm/quota.py`처럼. 월 1,000건 무료라 넘지 않게
- 키가 없거나 실패하면 → `unknown`으로 돌려주고 화면은 **직접 입력·검색**으로 (AI 모델로 대신 인식하지 않음)

### 1-2. 라벨 → 품목 (`knowledge/ontology.match_vision_labels`, 이미 있음)
- 온톨로지 품목에 비전이 실제로 돌려주는 영어 라벨을 `vision` 라벨로 추가해요 (`data/ontology/items.yaml`의 `vision:` 목록, 예: 사과 `Apple`, 단감 `Persimmon`, 대파 `Welsh onion`/`Scallion`).
- **실제 사진으로 확인한 라벨만** 넣어 주세요. 5품목 × 사진 3장 이상으로 비전 결과를 보고, 테스트 픽스처(`backend/tests/fixtures/vision/*.json`)에 응답을 저장해 두면 테스트가 키 없이 돌아요.
- 비전은 세부 품목에 약해요("Fruit", "Food"만 나올 때). 이럴 땐 후보 칩을 여러 개 보여 주고 사용자가 고르게 해요 (지금 화면 흐름 그대로).

### 1-3. 가격표 글자 → 가격·단위·품종 (`services/price_tag.py` 새로)
- 입력: 비전 `TEXT_DETECTION`의 전체 글자
- 가격: `3,000원`, `3000`, `3천원`, `1만원` 등 → 정수. 여러 개면 "원"이 붙은 것 우선, 그래도 여럿이면 `null` (사용자가 고침)
- 수량·단위: `3개`, `1kg`, `1단`, `1봉`, `1박스` → 지금 쓰는 `match_unit` 재사용
- 품종: 글자 전체를 `match_variety`에 넣어요 ("부사" → `variety:apple-fuji`, 온톨로지 라벨 기준)
- 응답 모양은 **지금 `price_tag`와 같게** (`price`, `unit_text`, `quantity`, `unit`, `variety_id`) — 화면 수정이 없도록
- 못 읽으면 `price_tag: null` (지금과 같음)

### 1-4. `scan_service.recognize`
- `recognize_labels`(LLM) 대신 비전 → 라벨 매칭 → 가격표 풀기
- 응답 `model`은 `"google-vision"`
- 사진 메타데이터 지우기·위치 동의 처리(`clean_photo`, `coarse_location`)는 **그대로** 비전 호출 전에
- `LLM_ROUTES`의 `recognize` 줄은 지워요

## 2. 젬마 헤드 에이전트

### 2-1. 역할 이름과 경로 (`core/config.py`)
`LLM_ROUTES`를 작업 이름 대신 **역할**로 정리해요.

| 역할 | 하는 일 | 순서 |
|---|---|---|
| `route` | 규칙으로 못 나눈 요청 나누기 (질문 의도 분류) | gemma |
| `plan` | 대화에서 도구 고르기·여러 번 호출 | gemini → openai |
| `extract` | 근거가 길거나(조각 4개 이상 또는 2,000자 이상) 여럿일 때 답에 필요한 사실만 뽑기 | gemini → openai |
| `write` | 최종 한국어 답변 | gemma → gemini → openai |
| `reason` | 장보기 이유 문장 | gemini → openai → gemma |

- 젬마 서버가 꺼져 있으면 `write`는 제미나이 → GPT로 자동 전환 (지금 라우터의 `accept` 방식 그대로)
- `llm_calls`에 `role` 열 추가 (마이그레이션 `0019_llm_call_role.sql`) — 발표 때 "젬마가 몇 %를 답했나"를 보여 줄 수 있게

### 2-2. 요청별 흐름
| 요청 | 흐름 |
|---|---|
| 사진 `/recognize` | 비전 → 온톨로지 → 코드 (AI 모델 호출 없음) |
| 물어보기 `/ask` | 의도: 키워드 규칙 → 안 되면 `route`(젬마) → 제철·시세·판매 점포는 지금처럼 AI 없이 → 근거 검색 → 근거가 길면 `extract` → `write`(젬마) → 사실 확인 → 실패하면 `write` 다음 모델 |
| 장보기 `/recommend` | 품목·수량·금액은 지금처럼 코드 → `reason`(제미나이 → GPT) → 사실 확인 |
| 대화 `/chat` | `plan`(제미나이 → GPT)이 도구 호출(최대 4번) → 도구 결과로 `write`(젬마)가 한국어 답 → 도구 결과와 대조(지금 검사 그대로) → 실패하면 `write` 다음 모델 |

### 2-3. 기다리는 동안 보여 주기
- 사실 확인 전에는 답을 보여 줄 수 없어서 **글자 스트리밍은 하지 않아요.** 대신 단계 표시를 보내요: "근거 찾는 중 → 정리 중 → 답 쓰는 중".
- 방법은 둘 중 편한 것: 응답에 `steps`를 담아 화면이 순서대로 보여 주기, 또는 `/ask`·`/chat`에 SSE로 단계 이벤트만 보내기 (최종 답은 마지막에 한 번)

## 3. 화면 (프론트)
- 인식 결과 화면은 응답 모양이 같아서 바뀌는 것 없음. "AI가 본 결과" 같은 문구가 있으면 "사진 인식 결과"로
- 물어보기·대화에 단계 표시
- 답 아래 "답한 모델"은 `write`를 맡은 모델 이름 (젬마/제미나이/GPT)

## 4. 완료 기준
- 사진 5품목 × 3장: 품목이 후보 1순위 또는 후보 칩 안에 있음 (결과를 표로 보고)
- 가격표 사진 5장: 가격·단위·품종 글자 읽은 결과를 표로 보고 (못 읽은 건 `null`이면 통과, 틀린 값이면 실패)
- 속도(중앙값): 인식 **2초 이하**, 물어보기 **7초 이하**, 대화 **12초 이하** — `llm_calls`·비전 호출 시간으로 측정해 보고
- 젬마 서버를 끈 상태에서도 물어보기·대화가 제미나이 → GPT로 답함
- 비전 키가 없을 때 인식이 `unknown`으로 끝나고 화면이 직접 입력으로 넘어감

## 5. 테스트
- 비전 응답 픽스처로: 라벨 매칭, 가격표 풀기(가격 형식 여러 개, 여러 가격, 단위, "부사" → 후지), 키 없음·실패·하루 한도
- 라우터: 역할별 순서, `write` 실패 시 다음 모델, `route`는 규칙으로 될 때 호출 0회, `llm_calls.role`
- 대화: `plan`이 도구를 부르고 `write`가 답하는 순서, 도구 결과 대조 그대로
- 기존 테스트 유지 (`TEST_DATABASE_URL=postgresql:///marketon_test`로 DB 테스트까지)
- 프론트 전체 테스트를 3번 연속 돌려 모두 통과

## 6. 하지 말 것
- API 키를 코드·문서·로그·커밋에 넣기 (`.env`에만)
- 사진을 젬마·제미나이·GPT에 보내기 (품목 인식은 비전만)
- 신선도·품질 판정 문구 ("신선해요", "A등급" 등) — 서비스 원칙
- 지어낸 비전 라벨 (실제 응답에서 확인한 것만)
- 기존 마이그레이션 수정 (새 번호로 추가. 참고: 0017이 두 개라 다음은 0019)

## 7. 참고 파일
- 인식: `backend/app/services/scan_service.py`, `backend/app/llm/json_output.py`, `backend/app/knowledge/ontology.py`(`match_vision_labels`, `match_variety`, `match_unit`)
- 라우터: `backend/app/llm/router.py`, `limits.py`, `quota.py`, `backend/app/core/config.py`
- 물어보기·대화·장보기: `services/ask_service.py`, `llm/ask.py`, `llm/chat.py`, `llm/recommend.py`, `knowledge/fact_check.py`
- 흐름도: `docs/design/08-flow.md` (끝나면 3장 그림을 새 흐름으로 고쳐 주세요)
