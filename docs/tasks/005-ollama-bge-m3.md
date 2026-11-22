# 작업 지시서 005 · Ollama 공급자 + bge-m3(1024차원) 전환

- 담당: Codex · 지시: Claude · 2026-11-22
- 기준: `backend/app/llm/`, `backend/app/core/http.py`, `backend/migrations/0001~0003`, `docs/design/01-rag-db.md` 4장

## 결정 (확정)
- **임베딩: Ollama `bge-m3:latest`, 1024차원** (2026-11-22 실측: 1024차원, 단위 벡터로 반환)
- Gemma는 Ollama로 호출해요. 모델 `gemma4:e4b`, 기능: completion·vision·audio·tools·thinking (실측)
- 설정 (`.env`에 이미 있음, 값은 커밋 금지):
  `OLLAMA_BASE_URL`, `OLLAMA_CHAT_MODEL`, `OLLAMA_EMBEDDING_MODEL`
- Ollama API: 임베딩 `POST {base}/api/embed {"model", "input": [..]}` → `{"embeddings": [[..]]}`, 대화 `POST {base}/api/chat {"model", "messages", "stream": false, "think": false}` → `{"message": {"content"}}`. 이미지는 메시지의 `"images": [base64]`.

## 할 일

### 1. 마이그레이션 `backend/migrations/0004_embedding_1024.sql`
- 기존 임베딩은 차원이 달라 못 써요: `update chunks set embedding = null`
- HNSW 인덱스 삭제 → `alter column embedding type vector(1024)` → 인덱스 다시 생성 (같은 이름·`vector_cosine_ops`)
- `match_chunks`: 인자 타입이 바뀌므로 `drop function match_chunks(vector, text[], text[], text, int, float)` 후 `vector(1024)`로 다시 생성. 본문·반환 컬럼·`set search_path = public`·`set hnsw.iterative_scan = 'strict_order'`는 0001+0002와 똑같이
- `response_cache` 비우기 (임베딩 모델이 바뀌어 예전 답변 근거가 달라짐)
- 0001~0003은 수정하지 않아요

### 2. `core/http.py` 동기 함수 추가
- 적재 스크립트·임베딩은 동기 코드예요. `get_sync`, `post_sync` 추가 (`httpx.Client`)
- 비동기·동기 모두 `timeout` 인자를 받게 (기본 10초 유지)
- 재시도는 연결 오류·429·5xx만. 다른 4xx는 바로 실패 (지금은 4xx도 재시도함)
- 기존 비동기 함수 시그니처는 호환 유지

### 3. `llm/ollama.py` 신규: `OllamaProvider(LLMProvider)`
- `embed(texts, *, task)`: `/api/embed`, 32개 단위 배치, timeout 120초. bge-m3는 문서·질문 구분이 없어 `task`는 무시 (docstring에 이유). 반환 차원이 `settings.EMBEDDING_DIM`과 다르면 `AppError('EMBEDDING_DIM_MISMATCH', ...)`
- `generate(prompt, *, images=None, system=None)`: `/api/chat`, `think: false`, timeout 180초. `images`는 bytes 또는 base64 문자열 목록 → base64 문자열로 변환
- HTTP는 반드시 `core/http.py` 경유
- `OLLAMA_BASE_URL`이 비어 있으면 호출 시 `AppError('LLM_NOT_CONFIGURED', ..., 503)`
- `llm/gemma.py` 삭제. `factory.py`: `ollama`와 `gemma`(별칭) 모두 `OllamaProvider`

### 4. 설정
- `core/config.py`: `OLLAMA_BASE_URL: str | None = None`, `OLLAMA_CHAT_MODEL = 'gemma4:e4b'`, `OLLAMA_EMBEDDING_MODEL = 'bge-m3:latest'`
- 기본값 변경: `EMBEDDING_PROVIDER = 'ollama'`, `EMBEDDING_DIM = 1024`. `LLM_PROVIDER`는 `gemini` 유지
- `EMBEDDING_MODEL`은 Gemini 전용이므로 `GEMINI_EMBEDDING_MODEL`로 이름 변경 (gemini.py만 사용)
- `fake.py`: `settings.EMBEDDING_DIM` 차원으로 생성 (이미 그렇다면 그대로)
- `.env.example`: OLLAMA 3개 추가. `OLLAMA_BASE_URL=http://localhost:11434` (실제 서버 IP 금지), 모델명은 기본값, EMBEDDING 기본값 갱신

### 5. 테스트
- `tests/test_ollama.py`: `core.http.post_sync`를 monkeypatch해서 네트워크 없이 — 배치 분할, 차원 불일치 에러, 이미지 base64 변환, `think: false` 전송, BASE_URL 없음 에러
- `RUN_OLLAMA_TESTS=1`일 때만 실제 서버 테스트 1개 (임베딩 1024차원, 짧은 generate)
- 기존 테스트가 차원 768을 가정한 곳이 있으면 `settings.EMBEDDING_DIM` 사용으로 수정
- DB 통합 테스트는 0004까지 적용된 상태에서 통과

### 6. 문서
- `docs/design/01-rag-db.md` 4장: 모델 Ollama `bge-m3`, 1024차원 [확정], 문서·질문 구분 없음. `vector(768)` 표기를 1024로
- `docs/design/02-structure.md`: llm 트리 `gemini.py ollama.py fake.py`, 결정 사항에 Ollama 한 줄
- `README.md`: Ollama 설정 한 단락 (서버 주소는 `.env`에만)

## 하지 말 것
- `.env` 수정 (이미 있음), 서버 IP를 레포 파일에 쓰기, 커밋, 시스템 설치
- 0001~0003 수정, 라우터·서비스 기능 구현

## 자체 검수 항목
- [ ] `TEST_DATABASE_URL=postgresql://localhost:5432/marketon_test pytest` 전부 통과 (테스트 DB가 없으면 `createdb marketon_test`, 끝나면 `dropdb`)
- [ ] 빈 `marketon_test`에 0001~0004 적용 후 `\d chunks`에 `vector(1024)`, `\df match_chunks` 인자 타입, 함수 설정에 `hnsw.iterative_scan` 확인
- [ ] `EMBEDDING_PROVIDER=fake`로 `load_all --embed` 두 번 (두 번째 변경 0)
- [ ] Ollama 서버는 샌드박스에서 닿지 않을 수 있어요. 실제 서버 검증은 Claude가 해요
- [ ] `grep -rn "100\.77"` 결과가 `.env` 외에 없음, 키 값 없음, 층 규칙 위반 없음

## 보고 형식 (한국어)
변경 파일, 검수 결과(명령·출력 요약), 남은 문제
