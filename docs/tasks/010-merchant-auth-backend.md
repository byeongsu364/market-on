# 작업 지시서 010 · 상인 로그인·마감세일 백엔드

- 담당: Codex · 지시: Claude · 2026-11-24
- 명세: **`docs/design/05-merchant-auth.md`** (3장 DB, 4장 API, 6장 보안) — 그대로 구현
- 참고: `docs/design/04-operational-db.md`, `docs/design/02-structure.md` (층 규칙: router → service → repo, SQL은 `db/`에만)
- 범위: **`backend/`만**. 프론트는 다른 작업(011)이 동시에 진행 중이라 건드리지 않아요
- 설치됨: `argon2-cffi` (venv). 다른 패키지 추가 금지

## 할 일
1. **마이그레이션 `0007_merchant_auth.sql`**: `users`, `sessions`, `closing_sales`, `store_views` + `today_picks` 삭제. 05 문서 3장 그대로 (partial unique index, check 제약, FK 동작)
2. **`core/security.py`**: argon2id 해시·검증, 세션 토큰 생성(`secrets.token_urlsafe(32)`)·sha256, 로그인 아이디 정규화·검증
3. **`db/repositories/`**: `user_repo.py`, `session_repo.py`, `sale_repo.py`, `view_repo.py` (기존 `merchant_repo.py`의 today_picks 함수는 삭제하거나 sale_repo로 대체)
4. **`services/`**: `auth_service.py` (가입·로그인·잠금·로그아웃·현재 사용자), `merchant_service.py` (점포 정보·품목·세일·다시 올리기·내리기·포스터 정보·조회 수), `admin_service.py` (승인·거절·비활성), `sale_service.py` (공개: 진행 중 세일, 점포 공개 페이지, 조회 수 기록)
   - **상인 쿼리는 항상 세션 사용자의 store_id로** (요청 본문의 store_id 무시)
   - 세일 `item_id`는 그 점포 취급 품목(`store_items`)에 있어야 함 (`ITEM_NOT_SOLD`), `ends_at`은 지금 이후 ~ 오늘 자정(서울) (`INVALID_ENDS_AT`)
5. **`deps.py`**: `current_user`(쿠키 `mo_session` → 세션 조회·만료 확인·`last_seen_at` 갱신), `require_merchant`(승인된 merchant), `require_operator`, `require_csrf`(POST·PATCH·DELETE에 `X-Requested-With: market-on`)
6. **라우터**: `routers/auth.py`, `routers/merchant.py`(기존 파일 교체), `routers/admin.py`, `routers/sales.py`(공개: `/sales/active`, `/sales/{id}/view`, `/stores/{store_id}`) — `main.py`에 등록
7. **설정**: `COOKIE_SECURE: bool = False`, `SESSION_DAYS: int = 30` (`.env`·`.env.example`은 수정하지 말고 보고에 적기)
8. **`scripts/create_operator.py`**: `--login-id` 인자, 비밀번호는 `getpass`로 두 번 입력. 이미 있으면 에러
9. **`scripts/seed_demo_market.py`** [시연용]: "시연 시장" 1곳(`market:demo`), 구역 6개(`store_category:*` 엔터티 없으면 생성), 점포 24곳(`store:demo-A01`…, 이름 `점포 A-01`…), 채소 구역 A-05~A-07이 대파·양파 취급 — 프론트 mock과 같은 구성. 다시 돌려도 같은 결과
10. 지도 응답 확장(05 문서 4장 마지막 줄)은 `GET /markets/{id}/map` 라우터가 아직 없으면 **만들지 말고** 보고에 적기

## 테스트 (`tests/test_auth_*.py`, `test_merchant_*.py`)
- 가입 → pending → `/merchant/*` 403 → 운영자 승인 → 200
- 같은 점포 두 번째 가입자 승인 시 `STORE_TAKEN`
- 로그인 실패 5회 → 잠금, 성공 시 카운터 초기화, 실패 메시지가 아이디 존재 여부를 드러내지 않음
- 세션 쿠키 HttpOnly·SameSite=Lax, DB에 토큰 원문 없음, 로그아웃 후 401, 만료 세션 401
- CSRF 헤더 없는 POST → 403
- 상인 A가 상인 B 점포의 세일을 내리기 시도 → 404 (존재도 드러내지 않음)
- 세일: 취급 안 하는 품목 거부, ends_at 범위, 다시 올리기, 내리기 후 `/sales/active`에서 사라짐, `regular_price <= sale_price` 거부
- 조회 수: `/stores/{id}` 호출마다 +1, 하루 단위
- seed 두 번 실행해도 같은 행 수

## 하지 말 것
- `frontend/` 수정, `.env`·`.env.example` 수정, 0001~0006 수정, 커밋, 패키지 추가

## 자체 검수
- [ ] `TEST_DATABASE_URL=postgresql://localhost:5432/marketon_test pytest` 전부 통과 (DB가 샌드박스에서 막히면 보고 — Claude가 검증)
- [ ] `grep`: SQL은 `db/`에만, 로그·응답에 password·토큰 원문 없음, 층 규칙
- [ ] `/docs`에 auth·merchant·admin·sales 태그

## 보고 (한국어, 끝난 뒤 한 번)
변경 파일, `.env.example`에 추가할 변수, 검수 결과, 05 문서와 다르게 한 점, 남은 문제
