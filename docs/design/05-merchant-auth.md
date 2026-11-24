# 05. 상인 로그인 · 상인 페이지 · 마감세일

> 상태: **[확정]** 2026-11-24 (병수 결정) · 일부 **[제안]** 표시
> 결정: ① 로그인은 **상인만** (소비자는 가입 없이 사용) ② 상인 가입은 **운영자(팀) 승인** 후 편집 가능 ③ 상인 기능은 **점포 정보·취급 품목**, **마감세일** 두 가지 ④ **상인이 실제로 쓰게 만드는 설계**를 함께 넣기
> 바뀌는 것: 상인 "오늘 추천"(M2, `today_picks`)은 **마감세일**로 대체해요. 홈의 "상인 오늘 추천" → "지금 마감세일"

---

## 1. 역할과 권한

| 역할 | 로그인 | 할 수 있는 일 |
|---|---|---|
| 소비자 | 없음 | 지금과 같음 (찍기·판단·지도·마감세일 보기) |
| 상인 `merchant` | 아이디 + 비밀번호 | 승인 전: 승인 대기 화면만 / 승인 후: **자기 점포 1곳**의 정보·취급 품목·마감세일 |
| 운영자 `operator` | 아이디 + 비밀번호 (CLI로 생성) | 상인 가입 승인·거절, 승인 취소 |

- 상인은 점포 1곳에만 연결돼요. 한 점포에 승인된 상인은 1명.
- **개인정보를 받지 않아요**: 아이디, 비밀번호, 점포 선택만. 이름·전화번호·이메일 없음 (팀 원칙 유지). 비밀번호를 잊으면 운영자가 초기화 코드를 발급 [제안]

## 2. 상인이 쓰게 만드는 설계

상인이 앱을 여는 이유는 "손님이 더 온다"는 것 하나예요. 그래서 **올리는 수고는 최소로, 효과는 바로 보이게** 만들어요.

| 장치 | 내용 |
|---|---|
| **30초 마감세일** | 한 화면: 품목 칩(내 취급 품목만) → 할인가(정가는 선택) → 끝나는 시각 칩(지금부터 1시간 · 2시간 · 영업 마감) → 올리기. 글 입력 없음 |
| **다시 올리기** | 지난 세일 목록에서 버튼 하나로 같은 내용 다시 올리기 (매일 비슷한 시간에 같은 품목을 파는 현실 반영) |
| **바로 보이는 효과** | 소비자가 그 품목을 찍으면 "파는 점포 보기"와 지도에서 **마감세일 중인 점포가 맨 위·배지**로 표시. 홈 "지금 마감세일"에 노출 |
| **내 세일을 본 사람 수** | 상인 홈에 "오늘 내 점포를 본 사람 N명", "이 세일을 본 사람 N명" 숫자 2개만 (대시보드 아님). 소비자 개인 정보 없이 조회 횟수만 셈 |
| **가게 QR 포스터** | 상인 페이지에서 A4/A5 인쇄용 QR 포스터 (`/s/{store_id}` 점포 페이지로 연결). 손님이 가판대에서 찍으면 그 점포 마감세일·취급 품목이 바로 보임 → 소비자 유입 + 상인이 앱을 알리는 동기 |
| **큰 글자·쉬운 말** | 상인 화면은 본문 18px, 버튼 64px 높이, 한 화면 한 가지 일. 전문 용어 없음 ("등록" 대신 "올리기") |
| **오래 유지되는 로그인** | 자기 휴대폰에서 30일 로그인 유지 (매번 비밀번호 입력하지 않게) |
| **빠른 승인** | 운영자 화면에 대기 목록 + 승인 버튼 하나. 승인되면 상인 화면이 다음 접속 때 바로 열림 |

## 3. DB (마이그레이션 0007)

### users
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| login_id | text UNIQUE not null | 4~20자 영문 소문자·숫자·`_`, 소문자로 저장 |
| password_hash | text not null | **argon2id** (argon2-cffi 기본값) |
| role | text check (`merchant`,`operator`) | |
| status | text check (`pending`,`approved`,`rejected`,`disabled`) | operator는 생성 시 approved |
| store_id | text FK stores, null 허용 | merchant만. **승인된 merchant는 점포당 1명** (partial unique index `where status='approved'`) |
| created_at, approved_at | timestamptz | |
| approved_by | uuid FK users, null 허용 | |
| failed_logins | int default 0 | |
| locked_until | timestamptz null | 5번 연속 실패 시 10분 잠금 |

### sessions
| id text PK (**토큰의 sha256 해시**, 토큰 자체는 저장 안 함) · user_id FK cascade · created_at · expires_at (30일) · last_seen_at |

### closing_sales (마감세일, `today_picks` 대체)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | bigserial PK | |
| store_id | FK stores cascade | |
| item_id | FK entities restrict | 상인 취급 품목 중 하나 |
| sale_price | int not null check > 0 | |
| regular_price | int null check > sale_price | 선택 |
| unit_id | FK entities null | 선택 (`unit:bunch` 등) |
| note | text null, 40자 이하 | 선택 (기본 화면에서는 입력 안 받음) |
| starts_at | timestamptz default now() | |
| ends_at | timestamptz not null | starts_at보다 뒤, 최대 당일 자정(서울) |
| status | text check (`active`,`ended`) default active | 상인이 "내리기" 누르면 ended |
| created_at | timestamptz | |
- "지금 진행 중" = `status='active' and now() between starts_at and ends_at`
- `today_picks` 테이블은 삭제 (데이터 없음)

### store_views (조회 수)
| store_id FK cascade · sale_id FK null cascade · day date (서울) · count int · PK (store_id, coalesce(sale_id,0), day) — 소비자 식별 정보 없이 하루 단위 횟수만 |

## 4. API

규칙: 상태를 바꾸는 요청은 로그인 쿠키 + `X-Requested-With: market-on` 헤더 필요 (CSRF 방지). 에러는 `{"error": {"code","message"}}`.

### 인증 `/auth`
| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| POST | `/auth/signup` | `{login_id, password, store_id}` | `201 {user}` (status pending, 자동 로그인) |
| POST | `/auth/login` | `{login_id, password}` | `{user}` + `Set-Cookie: mo_session=…; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000` (+ 운영 환경 `Secure`) |
| POST | `/auth/logout` | — | `204`, 세션 삭제 |
| GET | `/auth/me` | — | `{user}` 또는 `401` |
- `user` = `{id, login_id, role, status, store: {store_id, name, market_id} | null}`
- 비밀번호 8자 이상. 이미 승인된 상인이 있는 점포로는 가입 불가 (`STORE_TAKEN`)
- 로그인 실패 메시지는 아이디·비밀번호 중 어느 쪽이 틀렸는지 알려 주지 않음 (`INVALID_CREDENTIALS`), 잠금 시 `ACCOUNT_LOCKED`

### 상인 `/merchant` (승인된 merchant만, 아니면 `403 NOT_APPROVED`)
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/merchant/store` | 내 점포 정보 + 취급 품목 + 오늘 조회 수 |
| PATCH | `/merchant/store` | `{hours?: {open, close}, item_ids?: [...]}` |
| GET | `/merchant/sales?status=active|ended` | 내 마감세일 목록 (최근 30일) |
| POST | `/merchant/sales` | `{item_id, sale_price, regular_price?, unit_id?, ends_at}` |
| POST | `/merchant/sales/{id}/repost` | 같은 내용으로 다시 올리기 (`ends_at`만 받음) |
| POST | `/merchant/sales/{id}/end` | 내리기 |
| GET | `/merchant/poster` | QR 포스터용 `{store_name, market_name, url}` (QR 그림은 프론트에서 생성) |

### 운영자 `/admin` (operator만)
| GET `/admin/merchants?status=pending` · POST `/admin/merchants/{id}/approve` · POST `/admin/merchants/{id}/reject` · POST `/admin/merchants/{id}/disable` |

### 공개 (소비자)
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/sales/active?market_id=&item_id=` | 진행 중 마감세일 (홈·결과·지도) |
| GET | `/stores/{store_id}` | 점포 공개 페이지 (QR 연결 대상): 정보·취급 품목·진행 중 세일. 조회 수 +1 |
| POST | `/sales/{id}/view` | 세일 카드가 화면에 보였을 때 +1 (같은 기기 중복은 프론트에서 하루 1회로 제한) |
- 기존 `GET /markets/{id}/map` 응답의 점포에 `active_sale: {sale_price, regular_price, ends_at} | null` 추가

### 운영자 계정 만들기
`python -m scripts.create_operator --login-id admin` → 비밀번호를 터미널에서 입력받음 (명령줄 인자로 받지 않음)

## 5. 화면

| 화면 | 경로 | 내용 |
|---|---|---|
| 상인 시작 | `/merchant` | 로그인 안 됨 → "상인이신가요?" 소개 (효과 2줄) + 로그인 / 가입 버튼 · 대기 중 → 승인 대기 안내 · 승인됨 → 상인 홈 |
| 로그인 | `/merchant/login` | 아이디, 비밀번호, 로그인 (비밀번호 보기 토글) |
| 가입 | `/merchant/signup` | ① 시장 고르기 ② 지도·목록에서 내 점포 고르기 ③ 아이디·비밀번호 ④ "운영자가 확인하면 바로 쓸 수 있어요" |
| 상인 홈 | `/merchant` | 숫자 2개(오늘 내 점포 본 사람, 진행 중 세일 본 사람) · 큰 버튼 "마감세일 올리기" · 진행 중 세일(내리기) · 지난 세일(다시 올리기) · 링크: 점포 정보, QR 포스터, 로그아웃 |
| 마감세일 올리기 | `/merchant/sale/new` | 2장 "30초 마감세일" 한 화면 |
| 점포 정보 | `/merchant/store` | 영업시간(시작·끝 선택), 취급 품목 칩 다중 선택, 저장 |
| QR 포스터 | `/merchant/poster` | 인쇄용 화면 (`@media print`): 시장·점포 이름, 큰 QR, "찍으면 오늘 마감세일이 보여요" |
| 운영자 | `/admin` | 로그인(operator) → 승인 대기 목록 (아이디, 고른 점포, 가입 시각) + 승인·거절 |
| 점포 공개 페이지 | `/s/:storeId` | 소비자용. QR로 들어옴. 점포 정보·취급 품목·진행 중 마감세일 |
- 하단 탭 "상인"은 그대로 `/merchant`
- 소비자 화면: 홈 "지금 마감세일" (진행 중, 끝나는 시각 표시) · 결과 화면 "파는 점포 보기"에서 세일 점포 먼저 · 지도 점포에 "마감세일" 배지 (`accent` 면, 팀 토큰 규칙: 피치 강조 한 화면 2곳 이하)
- 마감세일 표시 문구는 사실만: "18:00까지 3,000원 (정가 4,000원)". "특가!", "강력 추천" 같은 표현 금지

## 6. 보안 체크리스트
- 비밀번호 argon2id, 세션 토큰 32바이트 `secrets.token_urlsafe`, DB에는 해시만
- 쿠키 HttpOnly + SameSite=Lax, 운영 환경 Secure (`settings.COOKIE_SECURE`)
- 상태 변경 요청에 `X-Requested-With` 헤더 확인
- 상인은 **자기 점포 데이터만** — 모든 `/merchant` 쿼리에 `store_id = 현재 사용자 store_id` 조건 (요청 본문의 store_id를 믿지 않음)
- 로그인 5회 실패 10분 잠금, 로그에 비밀번호·토큰 기록 금지
- 운영자 계정은 CLI로만 생성
