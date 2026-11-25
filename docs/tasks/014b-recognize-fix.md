# 작업 지시서 014b · [1-3 수정] 인식 정확도 — 단어 단위 매칭 + 후보 목록 제시

- 담당: Codex · 지시: Claude · 2026-11-24 · 근거: Claude 실제 사진 검수 (Wayket Pixabay 사진, gemma4:e4b)
- 범위: `backend/`만. 014 결과물(`llm/json_output.py`, `llm/prompts/recognize.txt`, `knowledge/ontology.py`, `services/scan_service.py`, `db/repositories/knowledge_repo.py`, 테스트) 수정. `routers/scan.py`는 Claude가 이미 `UploadFile`로 바꿨으니 **건드리지 않아요** (python-multipart 설치됨)

## 검수에서 나온 문제
| 사진 | Gemma 라벨 | 결과 | 원인 |
|---|---|---|---|
| 파인애플 | `pineapple` | 사과 0.7 | 부분 문자열 매칭: "pineapple" ⊃ "apple" |
| 배 | `apple` | 사과 1.0 | 자유 응답이라 모델이 비슷한 과일로 답함 |
| 단감 | `peach` | 후보 없음 | 같음 |

## 수정 1 · 단어 단위 매칭 (`knowledge/ontology.match_vision_labels`)
- 부분 문자열(`in`) 비교 삭제
- 라벨과 대상 모두 **단어 토큰**으로 나눔 (소문자, 영문·숫자 외 문자로 분리)
- 점수: 정규화 완전 일치 1.0 / 한쪽 토큰 목록이 다른 쪽의 **연속된 토큰 부분**이면 0.7 (예: `fuji apple` ⊃ `apple` → 0.7, `pineapple` vs `apple` → 0, `onion` vs `green onion` → 0.7)
- 라벨 순서 가중치(1.0·0.85·0.7), 비슷한 품목 묶음은 그대로

## 수정 2 · 후보 목록을 주고 고르게 (프롬프트 + 서비스)
- `scan_service.recognize`: LLM 호출 **전에** 온톨로지에서 품목 영어 이름 목록을 가져옴 — 품목마다 대표 이름 1개(en preferred, 없으면 첫 vision 라벨), 중복 제거, 이름순
  - repo 함수 `item_vocabulary(conn) -> list[{item_id, name_en}]` (SQL은 repo에)
- `recognize_labels(image, vocabulary: list[str])`로 목록 전달
- `prompts/recognize.txt`를 템플릿으로 (`{vocabulary}` 자리):
  - "사진 속 주된 식재료를 아래 목록에서 가장 비슷한 순서로 최대 3개 고르세요. 목록 이름을 **그대로** 쓰세요."
  - "목록에 없는 식재료면 그 식재료의 영어 일반명을 `\"other:<name>\"` 형식으로 1개만"
  - "비슷하게 생긴 품목(사과/배, 단감/복숭아, 대파/쪽파)이면 둘 다 넣어 사용자가 고를 수 있게"
  - 기존 금지 문장 유지 (상태·신선도·품질 평가 금지, 가격 추정 금지), JSON만 `{"labels": [...]}`
- 응답 처리: `other:` 라벨은 `vision_labels`에는 그대로 두되 매칭에서 제외 (후보 없음 → 프론트 검색으로)
- 목록이 비어 있으면(온톨로지 없음) 기존 자유 응답 프롬프트로

## 테스트 (LLM monkeypatch)
- `pineapple` → 사과 아님 / `fuji apple` → 사과 0.7 / `onion` → 양파 1.0, 대파 0.7 이하
- 프롬프트에 온톨로지 품목 이름이 들어가는지 (`{vocabulary}` 치환)
- `["pear", "apple"]` → 배 1.0, 사과 0.85 순서
- `["other:banana"]` → 후보 없음, vision_labels에 원문
- 기존 014 테스트 유지 (매칭 기대값이 바뀐 것은 이유를 주석으로)

## 하지 말 것
- `routers/scan.py`, `frontend/`, `.env`, 마이그레이션 수정, 커밋, 패키지 추가

## 자체 검수
- [ ] `TEST_DATABASE_URL=postgresql://localhost:5432/marketon_test pytest` (DB가 막히면 보고)
- [ ] `ruff format`

## 보고 (한국어, 한 번)
변경 파일, 검수 결과, 남은 문제
