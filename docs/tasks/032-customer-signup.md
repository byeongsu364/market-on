# 작업 지시서 032 · 손님 회원가입

- 담당: Codex · 지시: Claude · 2026-11-26 · 승인: 병수 ("작업하자", 리뷰는 "손님 회원가입 후")
- 이유: 점포 리뷰(033)는 가입한 손님만 쓸 수 있음. **나머지 손님 기능은 지금처럼 로그인 없이** 씀
- 기존: `users.role` = merchant·operator·market_admin (`0011_market_admin.sql`의 `users_role_check`·`users_check`), `POST /auth/signup`(상인: `store_id` 필수, 캡차 `require_captcha`), `/auth/login`·`/logout`·`/me`, `deps.require_merchant` 등
- 범위: `backend/` + `frontend/`. 패키지 추가 금지. 끝나면 `ruff format`, `npm run format`

## 1. 백엔드
- 마이그레이션 `0015_customer_role.sql`: role에 `customer` 추가, `customer`는 `store_id`·`market_id` 모두 null. 기존 제약 이름 유지해서 drop/add
- `POST /auth/signup` 요청에 `role: 'merchant' | 'customer'` (기본 `merchant` — 기존 클라이언트 호환). `customer`는 `store_id` 받지 않음(오면 422), 바로 `approved`, 세션 발급. 캡차는 상인과 똑같이 `require_captcha`
- `customer`는 상인·시장 관리자·운영자 API에서 기존 가드로 막히는지 확인(403)
- `public_user`에 role 그대로 노출
- 계약·mock 갱신

## 2. 화면
- `/signup` (새 라우트): "손님 / 상인" 선택. 손님 → 아이디·비밀번호·비밀번호 확인 → 가입 → 이전 화면(또는 홈)으로. 상인 → 기존 `/merchant/signup`으로 이동
- 로그인 화면에 "회원가입" 링크와 "로그인 없이 둘러보기"(홈) 링크
- 캡차 입력 UI는 **만들지 않음** (신태빈 담당). 캡차 필드는 기존 상인 가입과 같은 방식으로 요청에 넘길 수 있게만
- 손님이 로그인하면 상인 홈으로 보내지 않음(홈으로)

## 3. 테스트
- 손님 가입·로그인·me, store_id 주면 422, 캡차 켜짐/꺼짐, 손님이 상인/관리자/운영자 API 403, 기존 상인 가입 그대로
- DB 테스트(`TEST_DATABASE_URL`)에서 마이그레이션 제약 확인
- 화면: 손님 가입 흐름, 로그인 후 이동

## 하지 말 것
- 패키지 추가, `.env` 수정, 기존 마이그레이션 수정, 커밋, `marketon` DB 접근, 캡차 UI
