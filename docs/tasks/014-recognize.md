# 작업 지시서 014 · [1-3] 품목 인식 `POST /recognize`

- 담당: Codex · 지시: Claude · 2026-11-24 · 승인: 병수 (1-3)
- 로드맵: `docs/design/06-feature-roadmap.md` 1단계 1-3 (A2)
- **계약(정답)**: `frontend/src/types/contract.ts`의 `RecognizeResponse` = `{vision_labels: string[], candidates: {item_id, name, confidence}[]}` / `frontend/src/api/scan.ts` → `POST /recognize`, multipart 필드 이름 **`photo`**. 프론트는 수정하지 않아요
- 사용: `llm/factory.get_llm()` (기본 Gemma `gemma4:e4b`, Ollama, 이미지 입력 가능 — `llm/ollama.py`의 `generate(prompt, images=[bytes], system=…)`)
- 범위: `backend/`만. 패키지 추가 금지. 가격표 읽기(1-4)는 넣지 않아요

## 1. 흐름
```
photo → 형식·크기 검사 → media 저장 → Gemma: 영어 일반명 라벨 1~3개(JSON)
     → 라벨을 온톨로지 라벨(vision·en·synonym)에 매칭 → 후보 품목 + 비슷한 품목 → 응답
```

## 2. 상세
- **입력 검사**: `photo` 필드, jpeg·png·webp만 (헤더 매직바이트로 확인, 확장자 믿지 않음), 최대 8MB → 아니면 `415 UNSUPPORTED_IMAGE` / `413 IMAGE_TOO_LARGE`. heic는 지원하지 않는다고 오류 메시지에 안내
- **저장**: `media` (kind `photo`) + `settings.MEDIA_DIR/photos/YYYYMMDD/<uuid>.<ext>`. 저장 실패해도 인식은 계속 (경고 로그)
- **프롬프트** `llm/prompts/recognize.txt`
  - "사진 속 주된 농수산물·식재료를 영어 일반명(소문자) 1~3개로, 가장 확실한 것부터. JSON만: `{\"labels\": [\"green onion\", \"leek\"]}`"
  - "상태·신선도·품질을 평가하지 말 것, 가격을 추정하지 말 것, 식재료가 없으면 빈 배열"
- **JSON 파싱** `llm/json_output.py`: 코드블록·앞뒤 문장 제거 → `json.loads` → 실패 시 "JSON만 다시" 1회 재요청 → 그래도 실패면 `labels: []`
- **매칭** (`knowledge/ontology.py`에 함수 추가, SQL은 `knowledge_repo`)
  - 라벨 정규화(소문자·공백 제거)로 `entity_labels`의 kind `vision`·en `preferred`·en `synonym` 완전 일치 → 점수 1.0, 라벨이 품목 라벨을 포함하거나 반대 → 0.7 (예: "fuji apple" ⊃ "apple")
  - 라벨 순서 가중치: 첫 라벨 ×1.0, 둘째 ×0.85, 셋째 ×0.7 → 품목별 최고값이 `confidence`
  - type `item`만
- **비슷한 품목 묶음**: 1순위 후보와 KAMIS `item_cd`가 같거나(대파/쪽파) `substituteFor` 관계인 품목을 confidence ×0.6으로 후보에 추가 (이미 있으면 그대로)
- **응답**: 후보 최대 3개 confidence 내림차순, `name`은 ko 이름, `vision_labels`는 Gemma 라벨 원문. 후보가 없어도 200 (`candidates: []`) — 프론트가 검색으로 넘어감
- **실패**: Ollama 연결 실패·타임아웃(60초) → `503 RECOGNIZE_UNAVAILABLE`

## 3. 계층
`routers/scan.py` (`POST /recognize`) → `services/scan_service.py` → `llm/` · `knowledge/ontology.py` · `db/repositories/media_repo.py`

## 테스트 (LLM은 monkeypatch, 네트워크 없이)
- 계약 키 테스트 (RecognizeResponse)
- 라벨 `["scallion"]` → 대파 1.0 / `["fuji apple"]` → 사과 0.7 / `["leek", "green onion"]` → 대파가 둘째 가중치 / 모르는 라벨 → `[]`
- JSON 파싱: 코드블록 감싼 응답, 앞뒤 설명 문장, 깨진 JSON → 재요청 1회
- 비슷한 품목 묶음: 같은 item_cd 품목 fixture
- 415·413·503, `photo` 필드 없음 422
- media 행·파일 생성 (임시 MEDIA_DIR)
- **실제 Ollama 테스트** (`RUN_OLLAMA_TESTS=1`일 때만): `RECOGNIZE_SAMPLE_DIR` 환경변수 폴더의 사진으로 호출해 후보가 나오는지만 확인 (사진은 저장소에 넣지 않음)

## 하지 말 것
- `frontend/`, `.env` 수정, 0001~0008 수정, 커밋, 패키지 추가, 가격표 읽기, 판정·신선도 문구

## 자체 검수
- [ ] `TEST_DATABASE_URL=postgresql://localhost:5432/marketon_test pytest` (DB·Ollama가 막히면 보고 — Claude가 실제 사진으로 검증)
- [ ] LLM 호출은 `llm/`에서만, SQL은 `db/`에만, `ruff format`

## 보고 (한국어, 한 번)
변경 파일, 계약과 다른 점, 검수 결과, 남은 문제
