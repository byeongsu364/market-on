# 작업 지시서 001 · 프로젝트 뼈대 만들기

- 담당: Codex · 지시: Claude · 2026-11-22
- 기준 문서: `docs/design/02-structure.md` (구조·규칙), `CLAUDE.md`

## 목표
`docs/design/02-structure.md` 1장의 폴더 구조대로 백엔드·프론트 뼈대를 만들어요. 기능 로직은 만들지 않고, 각 파일의 역할이 드러나는 최소 코드와 실행 가능한 초기 상태까지만 만들어요.

## 기술 결정 (확정)
- 백엔드: Python 3.11, FastAPI, pydantic-settings, supabase-py, httpx, google-genai(Gemini SDK)
- 프론트: React + Vite + TypeScript (npm)
- DB: Supabase. ORM 없음. 테이블 정의는 `supabase/migrations/` SQL에만 (이번 작업에서는 SQL을 쓰지 않음)

## 만들 것

### 백엔드 (`backend/`)
1. 02 문서 구조대로 모든 폴더·파일 생성. 각 파일 맨 위에 한두 줄 docstring으로 역할과 "어느 층을 불러도 되는지"를 적어요. 패키지마다 `__init__.py`.
2. 실제로 동작해야 하는 최소 코드
   - `core/config.py`: pydantic-settings `Settings`. 필드: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GOOGLE_VISION_API_KEY`, `KAMIS_SERVICE_KEY`, `KAKAO_REST_API_KEY`, `KMA_SERVICE_KEY`, `LLM_PROVIDER`(기본 `gemini`), `EMBEDDING_DIM`(기본 768), `CORS_ORIGINS`. 키 값은 모두 선택(없어도 앱이 뜸). 레포 루트의 `.env`를 읽음.
   - `core/errors.py`: `AppError` 기본 예외 + FastAPI 예외 핸들러. 응답 형식 `{"error": {"code": str, "message": str}}`
   - `core/http.py`: httpx 기반 공통 GET/POST 함수 (타임아웃, 재시도 2회, 로깅). 외부 HTTP는 여기서만.
   - `core/cache.py`: 메모리 TTL 캐시 데코레이터
   - `core/logging.py`: 기본 로깅 설정
   - `llm/base.py`: `LLMProvider` 추상 클래스 (`generate(prompt, *, images=None, system=None) -> str`, `embed(texts, *, task) -> list[list[float]]`)
   - `llm/gemini.py`, `llm/gemma.py`: 클래스와 메서드 시그니처만, 본문은 `NotImplementedError`
   - `llm/factory.py`: `get_llm()`이 `settings.LLM_PROVIDER`로 구현체 선택
   - `db/client.py`: `get_supabase()` (service_role 키로 클라이언트 생성, 지연 생성·재사용). 키가 없으면 호출 시 `AppError`.
   - `deps.py`: FastAPI `Depends`용 `get_db`, `get_llm_dep`
   - `main.py`: 앱 생성, CORS, 예외 핸들러, 라우터 등록, `GET /health` → `{"status": "ok"}`
   - `routers/*.py`: 각각 `APIRouter(prefix=..., tags=[...])`만 (엔드포인트 없음). prefix: `/scan`, `/price`, `/merchant`, `/stores`, `/recipe`, `/card`, `/agent`
   - 나머지 파일(services, knowledge, clients, repositories, schemas, utils, scripts)은 docstring과 필요한 함수 이름만(본문 `NotImplementedError` 또는 `pass`). 함수 이름은 02 문서 설명에서 자연스럽게 정해요. 예: `price_service.get_price`, `ontology.resolve_entity`, `retriever.search`.
   - `llm/prompts/`: `.gitkeep`
3. `requirements.txt` (버전 하한 고정 `>=`), `tests/test_health.py` (TestClient로 `/health` 확인), `backend/pyproject.toml` 또는 `pytest.ini`로 `pythonpath = .` 설정
4. `scripts/`는 `python -m scripts.load_ontology`처럼 backend/에서 실행되도록 `__init__.py` 포함, 각 파일 `if __name__ == "__main__":` 진입점

### 프론트 (`frontend/`)
1. Vite React TS 템플릿으로 생성 후 02 문서의 `src/` 폴더 구조대로 정리
2. `pages/` 8개(Home, Scan, Result, Map, Recipe, Card, Agent, Merchant)는 제목만 보이는 빈 컴포넌트, react-router-dom으로 라우팅
3. `api/client.ts`: fetch 래퍼 (`VITE_API_BASE_URL`, JSON, 에러를 `{code, message}`로 통일, `Accept-Language` 헤더). fetch는 이 파일에서만.
4. `api/*.ts`, `hooks/*`, `components/**`, `utils/`, `constants/`, `store/`, `i18n/`, `types/`, `styles/`: 빈 모듈 또는 최소 export. `constants/`에 점포 카테고리 색상 자리(값은 임시), 지원 언어 `ko, en, zh, ja, vi`.
   - 주의: 신선도 "등급" 관련 상수·컴포넌트는 만들지 않아요.
5. `i18n/locales/{ko,en,zh,ja,vi}.json`: 빈 객체 또는 앱 이름 키 하나
6. `package.json` 스크립트에 `gen:types` 추가: `openapi-typescript http://localhost:8000/openapi.json -o src/types/api.ts` (devDependency 추가)
7. Vite dev 서버에서 `/api` 프록시 또는 `VITE_API_BASE_URL` 사용 중 하나로 백엔드 연결 (README에 적기)

### 루트
- `data/{ontology,rag_docs,markets,kamis}/.gitkeep`, `data/SOURCES.md` (표 머리글: 이름, 제공처, URL, 라이선스, 받은 날짜, 사용처)
- `data/kamis/`에 Wayket 파일 복사: `/Applications/학교자료/4학년자료/논문/재래시장추천/n8n/n8n_가격조회목록_v1.csv`, `.../데이터/과일가격_가용성_v1.csv`, `.../데이터/KAMIS_조사지역_v1.csv`. SOURCES.md에 출처 기록 (원본: KAMIS 공공데이터, Wayket에서 정리)
- `supabase/migrations/.gitkeep`
- `.env.example`: config.py 필드 이름과 `VITE_API_BASE_URL`, 값은 비움
- `README.md`: 실행 방법(백엔드·프론트), 폴더 구조 요약, 02 문서의 4가지 규칙 요약 링크
- `.gitignore`: 기존 내용 유지 + `frontend/node_modules`, `dist/`, `.pytest_cache/` 등 필요한 것 추가

## 하지 말 것
- 기능 로직, SQL 마이그레이션, 실제 API 호출 구현
- `.env` 파일 생성·수정, 키 값 기입
- Wayket의 `.env`, 모델(.pt), 웹서버 코드 복사
- git commit

## 완료 기준 / 자체 검수 항목
- [ ] 02 문서 1장의 모든 폴더·파일이 존재 (차이가 있으면 이유와 함께 보고)
- [ ] `cd backend && pip install -r requirements.txt && pytest` 통과
- [ ] `cd backend && uvicorn app.main:app` 실행 후 `/health` 200, `/docs`에 7개 라우터 태그 표시
- [ ] `.env` 없이도 앱이 뜸
- [ ] `python -m scripts.load_ontology` 가 import 에러 없이 실행됨 (NotImplemented 메시지는 OK)
- [ ] `cd frontend && npm install && npm run build` 성공, `npm run lint` 통과(템플릿에 있으면)
- [ ] 호출 방향 위반 import 없음 (예: knowledge → services, clients → services). `grep`으로 확인
- [ ] fetch 사용이 `api/client.ts`에만 있음, `httpx` 사용이 `core/http.py`(와 필요 시 supabase 내부)에만 있음
- [ ] 레포에 키 값이 없음

## 보고 형식
만든 파일 트리(요약), 검수 항목별 결과(명령과 출력 요약), 02 문서와 달라진 점, 남은 문제
