# 작업 지시서 019 · [P-5] 입점 요청 흐름 — 시장이 찾아오게

- 담당: Codex · 지시: Claude · 2026-11-24 · 승인: 병수 (P-5)
- 설계: **`docs/design/07-pull-growth.md` 3-2·3-3·4장** ("Market-On은 시장에 부탁하지 않습니다. 소비자의 요청과 숫자가 쌓이면, 시장과 상인이 먼저 찾아옵니다.")
- 기존: `markets`(0006, `source`에 `std_market_data` 이미 있음), `/markets/nearby`(거리), 시장 관리자(P-4, 0011), 운영자 화면, 익명 기기 `device_hash`(1-4)
- 디자인: `frontend/DESIGN.md` 최우선 (판정·과장 문구 금지, 새 색 금지)
- 범위: `backend/` + `frontend/`. 패키지 추가 금지. 끝나면 `npm run format`, `ruff format`

## 0. 발표 장면 (완료 기준)
지원 안 되는 시장 근처에서 앱을 엶 → "이 시장은 아직 없어요 · 이 시장도 쓰고 싶어요" → 요청 수 +1 → `/join`에서 그 시장을 고르면 **"이번 주 이 시장 근처에서 Market-On을 연 사람 N명 · 요청한 사람 N명"** → 시장이 입점 신청 → 운영자가 [승인] → 시장 활성 + 시장 관리자 계정 열림 → (P-4) 상인 가입 승인

## 1. 전국 전통시장 목록 넣기
- `scripts/load_markets.py`: 공공데이터포털 **전국전통시장표준데이터** (`DATA_GO_KR_KEY`, 외부 호출은 `core/http.py`로) → `markets`에 `status='listed'`, `source='std_market_data'`로 upsert (시장명·주소·위도·경도·점포수). 옵션 `--sido 서울` (시도 필터), `--csv 경로` (API가 막히면 포털에서 받은 CSV로 같은 처리)
  - id: `market:std-<표준데이터 시장코드 또는 이름+주소 해시>` (다시 실행해도 같은 id)
  - **이미 `active`인 시장은 상태를 바꾸지 않음**. 좌표 없는 행은 건너뛰고 개수 로그
  - 경동시장처럼 시연 시장과 같은 시장이 목록에 있으면 그대로 두고 보고에 적기 (합치기는 D-2 데이터 작업에서)
- 테스트는 응답 고정 데이터로 (샌드박스 네트워크 없음). 실제 호출은 Claude가 함

## 2. DB · 마이그레이션 `0012_market_requests.sql` (0001~0011 수정 금지)
- `markets.status text not null default 'active' check (status in ('listed','active'))`, `markets.store_count int null`
- `market_demand(market_id → markets cascade, day date (서울), device_hash text, kind text check (kind in ('nearby','request')), primary key (market_id, day, device_hash, kind))` — **하루·기기·종류당 1행** (숫자만 셈, 개인정보 없음)
- `market_applications(id bigserial, market_id → markets restrict, manager_org text check (in ('상인회','관리사무소','기타')), contact text (시장 공식 연락처, 80자 이하), store_count int null, note text null (200자 이하), admin_user_id → users on delete set null, status text check (pending/approved/rejected) default pending, created_at, reviewed_by → users on delete set null, reviewed_at)`
  - 같은 시장에 `pending` 신청은 1건만 (partial unique)

## 3. API
| 메서드 | 경로 | 내용 |
|---|---|---|
| GET | `/markets/nearby?lat=&lng=` | 응답 각 시장에 **`status`** 추가 (`listed`·`active` 모두, 거리순). `X-Device-Id`가 있으면 **1km 안의 `listed` 시장마다 `nearby` 수요 1건 기록**(하루 1번). 기록 실패해도 응답은 정상 |
| POST | `/markets/{id}/requests` | "이 시장도 쓰고 싶어요". `X-Device-Id` 필수, CSRF 헤더 필수, `listed` 시장만(`active`면 409 `MARKET_ACTIVE`). 응답 `{requested: true, requests_7d}` (같은 날 다시 눌러도 201, 숫자 안 늘어남) |
| GET | `/markets/{id}/demand` | `{market_id, name, status, nearby_7d, requests_7d}` — **최근 7일 서로 다른 기기 수**. **5 미만이면 숫자 대신 `null` + `low: true`** (화면: "5명 미만") |
| GET | `/markets/search?q=` | 시장 이름 검색 (listed·active 모두, 최대 20, `/join`용) |
| POST | `/join` | 입점 신청 `{market_id, manager_org, contact, store_count?, note?, login_id, password}` → **시장 관리자 계정을 `pending`으로 만들고**(P-4 규칙: market_admin + market_id) 신청 저장. CSRF 필수, 로그인 불필요. `active` 시장이면 409, 이미 pending 신청 있으면 409 `APPLICATION_PENDING`. 비밀번호·아이디 규칙은 기존 가입과 같음 |
| GET | `/admin/applications?status=pending` | 운영자: 신청 목록 + 각 시장 수요 숫자(`/demand`와 같은 값) |
| POST | `/admin/applications/{id}/approve` | 운영자: **한 트랜잭션**에서 시장 `active`, 신청 `approved`, 시장 관리자 계정 `approved` |
| POST | `/admin/applications/{id}/reject` | 운영자: 신청 `rejected`, 계정 `rejected` |
- 시장 관리자 계정이 `pending`이면 로그인은 되지만 `/market-admin`은 403 → 화면에 "운영팀이 확인하면 열려요"
- 계약(`contract.ts`·mock·계약 키 테스트): `Market += { status: 'listed' | 'active' }`, `MarketDemand`, `MarketApplication`

## 4. 화면
- **시장 자동 선택(1-5) 수정**: 자동 선택은 **`active` 시장만**. 가장 가까운 시장이 1km 안의 `listed`면 **"이 시장은 아직 Market-On에 없어요"** 카드: 시장 이름 · [이 시장도 쓰고 싶어요] · 누른 뒤 "요청했어요 · 이번 주 N명이 요청했어요"(5 미만이면 "5명 미만") · 가까운 지원 시장 바로가기(있으면)
- **시장 목록 화면**: `active` 위, `listed`는 "준비 중" 표시 + [쓰고 싶어요] 버튼
- **`/join` 입점 신청 페이지** (소비자 탭에 안 보이고, 시장 관리자 로그인 화면·포스터·발표 QR에서 링크): 
  1. 시장 이름 검색 → 고르면 **수요 숫자 카드**: "이번 주 이 시장 근처에서 Market-On을 연 사람 N명 · 이 시장을 요청한 사람 N명"
  2. 신청 폼: 관리 주체(칩 3개) · **시장 공식 연락처**(안내: "개인 휴대폰 말고 시장 사무실·상인회 대표 번호") · 점포 수(선택) · 아이디·비밀번호(시장 관리자 계정)
  3. 완료: "운영팀이 확인하면 시장 관리자 화면이 열려요. 그다음 상인 가입은 시장 관리자가 승인해요"
- **운영자 화면**: "입점 신청" 목록 (시장 이름·관리 주체·연락처·신청 시각·**수요 숫자**) + [승인]·[거절](한 번 더 묻기)
- 덤 (P-4 검수):
  - 시장 관리자 화면: 상인 아이디가 입력 칸처럼 보임 → 일반 글자로, 숫자 카드 3개 한 줄(좁으면 3칸 그대로 줄여서), 로그아웃은 맨 아래 따로
  - 시장 입구 포스터: 제목 "사진 한 장으로 / 어디서 파는지 바로" 처럼 줄바꿈을 단어 단위로(`word-break: keep-all`), 시장 이름 한 번만

## 5. 테스트
- 백엔드: 로더(고정 응답 → listed upsert, active 유지, 좌표 없음 건너뜀, 재실행 같은 id), nearby `status`·nearby 수요 하루 1회·기기 없으면 기록 안 함, requests(listed만, 하루 중복 안 셈, 기기 헤더 없음 422/403, CSRF 403), demand 5 미만 null·low, join(계정 pending 생성, active 시장 409, 중복 pending 409, 규칙 위반 422), 승인 트랜잭션(시장 active + 계정 approved → `/market-admin` 200), 거절, 계약 키
- 프론트: listed 근처 카드·요청 버튼·5명 미만 문구, 자동 선택은 active만, 시장 목록 준비 중, `/join` 검색→수요 카드→신청→완료, 운영자 신청 승인·거절, P-4 덤 항목
- 기존 테스트 유지

## 하지 말 것
- 패키지 추가, `.env` 수정, 0001~0011 수정, 커밋, `marketon` DB 접근, 실제 외부 API 호출(테스트는 고정 데이터), 개인 연락처 수집 유도 문구, 판정·과장 문구, 새 색

## 자체 검수
- [ ] 프론트 `build`·`lint`·`test`·`format:check`, 백엔드 `pytest`(DB 막히면 보고 — Claude가 검증)·`ruff format`
- [ ] SQL은 `db/`, HTTP는 `core/http.py`, `fetch(`는 `api/client.ts`만, HEX는 토큰 파일만, 140자 넘는 줄 없음

## 보고 (한국어, 한 번)
변경 파일, 표준데이터 API 엔드포인트·필드 매핑(확실하지 않은 필드명은 표시), 계약 변경, 검수 결과, 남은 문제
