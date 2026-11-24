# 작업 지시서 018 · [P-4] 시장 관리자 역할 (`market_admin`)

- 담당: Codex · 지시: Claude · 2026-11-24 · 승인: 병수 (P-4)
- 설계: **`docs/design/07-pull-growth.md` 3-1** (운영자는 시장 승인만, 상인 승인은 시장 관리자), `docs/design/05-merchant-auth.md` (기존 인증·세션·CSRF 규칙 그대로)
- 디자인: `frontend/DESIGN.md` 최우선 (시장 관리자 화면도 상인 화면처럼 큰 글자·쉬운 말, 새 색 금지)
- 범위: `backend/` + `frontend/`. 패키지 추가 금지. 끝나면 `npm run format`, `ruff format`
- 목적: **시장이 늘어나도 우리(운영자) 일은 시장 1곳 승인으로 끝나게.** 상인 가입 승인은 그 시장 관리자(상인회·관리사무소)가 해요

## 1. DB · 마이그레이션 `0011_market_admin.sql` (0001~0010 수정 금지)
- `users.role` 체크에 `market_admin` 추가
- `users.market_id text references markets(id) on delete restrict` (null 허용)
- 역할별 제약 교체: `merchant` → store_id 있음·market_id 없음 / `operator` → 둘 다 없음 / `market_admin` → **market_id 있음**·store_id 없음
- 한 시장에 시장 관리자 여러 명 가능 (상인회 + 관리사무소)
- `users.approved_by`는 그대로 (승인한 사람이 시장 관리자일 수 있음)

## 2. 계정 만들기
- `scripts/create_market_admin.py --login-id ... --market market:demo` (비밀번호는 `create_operator.py`처럼 getpass로만). 서비스 함수는 `auth_service`에
- 시장 관리자는 만들 때 `approved` (운영자가 만든 계정). 입점 신청으로 만드는 흐름은 P-5
- 운영자 API: `GET /admin/market-admins`, `POST /admin/market-admins/{id}/disable` (목록·정지만, 생성은 스크립트·P-5)

## 3. 시장 관리자 API `/market-admin` (승인된 market_admin만, 아니면 403 · 상태 변경은 CSRF 헤더 필수)
| 메서드 | 경로 | 내용 |
|---|---|---|
| GET | `/market-admin/market` | 내 시장 `{market_id, name, stores_total, merchants_approved, merchants_pending, views_7d}` (`views_7d` = 내 시장 점포 조회 수 7일 합, `store_views`) |
| GET | `/market-admin/merchants?status=pending|approved|rejected|disabled` | **내 시장 점포의 상인만** `{id, login_id, status, created_at, store: {store_id, name}}` |
| POST | `/market-admin/merchants/{id}/approve` · `reject` · `disable` | 내 시장 상인만 (다른 시장 상인 → 404, 존재를 알리지 않음). 기존 규칙 유지: 점포당 승인 상인 1명(`STORE_TAKEN`), 정지 시 세션 삭제 |
| GET | `/market-admin/poster` | 시장 입구 QR 포스터용 `{market_name, url}` — url은 `/?market=<market_id>` (앱 첫 화면 + 그 시장 선택) |
- 서비스는 기존 `admin_service.set_status`의 승인 로직을 **공유**(복사 금지). 차이는 "어느 상인을 다룰 수 있나"(운영자 = 전부, 시장 관리자 = 내 시장)만
- 운영자 `/admin/merchants/*`는 그대로 둠 (예외 처리용)
- `/auth/me`·로그인 응답 `user`에 `market: {market_id, name} | null` 추가 (market_admin일 때)

## 4. 화면
- **로그인 후 이동**: merchant → `/merchant`, market_admin → `/market-admin`, operator → `/admin` (기존 상인 로그인 화면 하나로)
- **`/market-admin` 홈**: 시장 이름 · 숫자 카드 3개(점포 수·가입 상인·이번 주 점포 조회 수) · **승인 대기 상인 목록** (점포 이름·아이디·가입 시각, [승인]·[거절] 큰 버튼, 거절은 한 번 더 묻기) · 승인된 상인 목록([정지]) · "시장 입구 QR 포스터" 링크
- **`/market-admin/poster`**: 기존 상인 포스터 화면 구성 재사용 — "○○시장 · 사진 한 장으로 이 품목 어디서 파는지" + QR (`/?market=`)
- **앱이 `?market=` 로 열리면** 그 시장을 선택 (자동 선택보다 우선, 1-5의 "사용자가 바꾼 시장" 규칙과 같게 그날 유지)
- **상인 가입 완료·대기 화면 문구**: "운영팀 승인" → **"시장 관리자가 확인하면 열려요"**
- 덤 (P-3 검수): 상인 홈 가격 카드에서 "· 상인 확인" 줄과 "상인 확인 · 시각 · 가격" 줄이 겹침 → 상인 확인 줄 하나만

## 5. 개발용 시드
- `scripts/seed_demo_market.py`에 넣지 말고, 보고에 "시연용 시장 관리자 만들기 명령"을 적기 (비밀번호는 getpass라 Claude가 직접 만듦)

## 6. 테스트
- 백엔드: 역할 제약(마이그레이션 체크), 시장 관리자 로그인·me에 market, 내 시장 상인만 목록, 다른 시장 상인 승인 404, 점포당 1명 STORE_TAKEN, 정지 시 세션 삭제, 상인·운영자 토큰으로 `/market-admin` 403, CSRF 없음 403, 포스터 url, 운영자 market-admins 목록·정지, 계약 키
- 프론트: 역할별 로그인 이동, 대기 목록 승인·거절(거절 확인), `?market=` 선택 우선, 가입 대기 문구, 상인 가격 카드 줄 하나
- 기존 테스트 유지

## 하지 말 것
- 패키지 추가, `.env` 수정, 0001~0010 수정, 커밋, 입점 신청·요청 수(P-5), 시장 정보 편집, 판정·과장 문구, 새 색, `marketon` DB 접근

## 자체 검수
- [ ] 프론트 `build`·`lint`·`test`·`format:check`, 백엔드 `pytest`(DB 막히면 보고 — Claude가 검증)·`ruff format`
- [ ] SQL은 `db/`, `fetch(`는 `api/client.ts`만, HEX는 토큰 파일만, 140자 넘는 줄 없음

## 보고 (한국어, 한 번)
변경 파일, 승인 로직 공유 방식, 계약 변경, 시연용 시장 관리자 만들기 명령, 검수 결과, 남은 문제
