# Market-On

기능 로직 없이 실행 기반과 모듈 자리만 제공하는 스캐폴딩입니다. Python 3.11과 Node.js 22 이상을 사용합니다.

## 백엔드 실행

```sh
python3.11 -m venv .venv
source .venv/bin/activate
cd backend
pip install -r requirements.txt
pytest
uvicorn app.main:app --reload
# 별도 터미널: curl http://localhost:8000/health
# http://localhost:8000/docs
python -m scripts.load_ontology
```

키 없이 `/health`와 문서가 열립니다. DB는 처음 의존성을 호출할 때 DATABASE_URL을 확인하며, LLM과 적재 스크립트는 미구현입니다. 설정은 루트 `.env` 또는 환경변수로 읽습니다. `.env.example`은 필드 목록이며 이번 작업에서는 `.env`를 생성하지 않습니다. 기본값을 사용하려면 비어 있는 숫자·목록 설정을 환경변수로 지정하지 마세요. `CORS_ORIGINS` 설정 형식은 JSON 배열입니다.

## DB 준비

로컬 PostgreSQL 서버를 실행한 상태에서 다음 명령으로 준비합니다.

```sh
brew install pgvector
createdb marketon
export DATABASE_URL=postgresql://postgres@localhost:5432/marketon
cd backend
python -m scripts.migrate --dry-run
python -m scripts.migrate
```

미적용 SQL을 파일명 순서로 실행하며 파일마다 하나의 트랜잭션으로 처리합니다. `--dry-run`은 미적용 파일 목록만 출력합니다.

## 프론트 실행

```sh
cd frontend
npm install
npm run dev
npm run build
npm run lint
# 백엔드 실행 중 API 타입 생성
npm run gen:types
```

기본 API 주소는 `/api`이며 Vite 개발 서버가 `http://localhost:8000`으로 전달하면서 `/api`를 제거합니다. 다른 서버 또는 배포 환경에서는 `VITE_API_BASE_URL`로 백엔드 주소를 지정하세요. 운영 프록시는 별도 배포 설정이 필요합니다. 언어 헤더 기본값은 `ko`입니다.

## 폴더 구조

- `backend/app/`: core, routers, services, knowledge, clients, llm, db, schemas, utils
- `backend/scripts/`, `backend/tests/`: 적재 진입점과 상태 테스트
- `frontend/src/`: pages, components, hooks, api, types, utils, constants, store, i18n, styles
- `data/`: ontology, rag_docs, markets, kamis 및 출처 목록
- `backend/migrations/`: 테이블·인덱스·SQL 함수의 원본

[구조와 네 가지 규칙](docs/design/02-structure.md#2-지켜야-할-규칙): 호출은 router → service → knowledge → 외부 연결 방향으로 흐릅니다. HTTP·LLM·DB·fetch는 지정된 위치에 모읍니다. 에이전트는 기존 서비스를 도구로 감쌉니다. 프론트는 화면·상태/로직·호출·계산을 각각 분리합니다.

Vite 생성 명령은 작업 환경의 레지스트리 DNS 제한으로 실패하여 React TS 템플릿의 기본 설정을 직접 작성했습니다. 설치 및 실행 검증 결과는 작업 보고를 참고하세요.
