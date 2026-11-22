# 작업 지시서 003 · Supabase → PostgreSQL 전환

- 담당: Codex · 지시: Claude · 2026-11-22
- 기준 문서: `docs/design/01-rag-db.md`, `docs/design/02-structure.md` (둘 다 PostgreSQL 기준으로 이미 수정됨)

## 목표
DB를 Supabase에서 직접 운영하는 PostgreSQL(+pgvector)로 바꿔요. 기능 로직은 만들지 않고, 연결 방식·설정·마이그레이션만 바꿔요.

## 결정 (확정)
- 드라이버: `psycopg[binary]>=3.2`, `psycopg-pool`, `pgvector`(python). ORM 없음.
- 마이그레이션 위치: `backend/migrations/NNNN_name.sql`, 적용: `cd backend && python -m scripts.migrate`
- 설정: `DATABASE_URL` 하나 (예: `postgresql://user:pass@localhost:5432/marketon`)

## 할 일

### 1. 마이그레이션 이동·수정
- `git mv supabase/migrations/20261122000001_rag_schema.sql backend/migrations/0001_rag_schema.sql`, `supabase/` 폴더 삭제
- SQL 수정
  - `create extension if not exists vector;` (schema 지정 없음)
  - `extensions.vector(768)` → `vector(768)`, `extensions.vector_cosine_ops` → `vector_cosine_ops`, 함수 시그니처의 `extensions.vector` → `vector`
  - 두 함수의 `set search_path = public, extensions` → `set search_path = public`
  - RLS 8줄, `revoke`/`grant` 4줄 삭제 (Supabase 전용 역할 anon·authenticated·service_role이 일반 Postgres엔 없음)
  - 맨 위 주석의 적용 방법을 `python -m scripts.migrate`로
  - 그 밖의 테이블·제약·인덱스·함수 본문은 **바꾸지 않아요** (이미 검수 완료)

### 2. 마이그레이션 실행기 `backend/scripts/migrate.py`
- `schema_migrations(version text primary key, applied_at timestamptz not null default now())` 테이블을 없으면 만들어요
- `backend/migrations/*.sql`을 파일명 순으로, 아직 적용 안 된 것만 파일 하나당 트랜잭션 하나로 실행하고 기록
- `--dry-run`: 적용할 파일 목록만 출력
- DB 연결은 `app/db/pool.py`의 함수를 재사용 (DB 접근은 db/ 에서만 규칙)

### 3. 백엔드 코드
- `app/db/client.py` 삭제 → `app/db/pool.py`
  - `get_pool()`: `settings.DATABASE_URL`로 `psycopg_pool.ConnectionPool` 지연 생성·재사용. 연결 생성 시 `pgvector.psycopg.register_vector` 등록(확장이 아직 없으면 등록 실패를 무시하고 경고 로그 — 첫 migrate 전에도 앱이 떠야 함)
  - `DATABASE_URL`이 없으면 호출 시 `AppError('DB_NOT_CONFIGURED', ..., 503)`
  - `close_pool()`: main.py lifespan 종료 시 호출
  - `connection()` 컨텍스트 매니저 (풀에서 연결 빌려 쓰기)
- `app/core/config.py`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 삭제, `DATABASE_URL: str | None = None` 추가
- `app/deps.py`: `get_db`가 `pool.connection()`을 yield
- `app/main.py`: lifespan에서 종료 시 `close_pool()`. 시작 시 DB 연결을 강제하지 않음(.env 없이도 떠야 함)
- `requirements.txt`: `supabase` 제거, 위 패키지 추가
- 각 파일 docstring의 Supabase 언급 정리 (repositories 등)
- `tests/`: 기존 health 테스트 유지 + `DATABASE_URL` 없을 때 `get_pool()`이 `AppError`를 내는 테스트

### 4. 설정·문서
- `.env.example`: `SUPABASE_*` 2줄 → `DATABASE_URL=postgresql://postgres@localhost:5432/marketon` (로컬 개발 기본값, 비밀번호 없음)
- `README.md`: Supabase 언급 제거, "DB 준비" 절 추가 — `brew install pgvector`, `createdb marketon`, `cd backend && python -m scripts.migrate`
- `docs/tasks/`의 이전 지시서는 기록이므로 수정하지 않아요

## 하지 말 것
- 테이블 구조·함수 본문 변경, 기능 로직 구현, `.env` 생성·수정, 커밋
- `brew install` 등 시스템 설치 (필요하면 보고만)

## 자체 검수 항목
- [ ] `grep -rniI supabase` 결과가 `docs/tasks/`, `docs/CONTEXT.md`, `docs/design/`의 변경 기록 문구 외에 없음 (node_modules·.venv·.git 제외)
- [ ] `cd backend && pytest` 통과 (네트워크 문제로 설치가 안 되면 그렇다고 보고)
- [ ] `.env` 없이 `uvicorn app.main:app` 기동, `/health` 200
- [ ] `python -m scripts.migrate --dry-run`이 `DATABASE_URL` 없을 때 이해되는 에러 메시지로 끝남
- [ ] SQL에서 바뀐 곳이 위 1번 목록뿐인지 `git diff -M` 로 확인해 보고
- [ ] 호출 방향 규칙 위반 없음, 키 값 없음

## 보고 형식 (한국어)
변경 파일 목록, 검수 결과(명령·출력 요약), 남은 문제
