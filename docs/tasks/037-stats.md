# 작업 지시서 037 · 상인·시장 관리자·운영자 통계

- 담당: Codex · 지시: Claude · 2026-11-27 · 승인: 병수 ("037 진행하자")
- 근거: `docs/tasks/030-api-gaps.md`의 "조회 수·단골 수", "상인 주별·요일별 조회 수·길 안내 연 횟수", "운영자용 시장 목록". 화면: WebMerchant·Merchant(상인 홈 막대그래프), WebMarketAdmin(숫자 카드·상인 최근 활동), WebAdmin(요청만 있는 시장·이용 중인 시장)
- 기존: `store_views(store_id, sale_id, day, count)`와 `view_repo.increment`(점포 페이지·세일 조회 때 +1), `/merchant/*`, `/market-admin/*`, `/admin/*` 라우터, 시장 수요 `market_demand`, 입점 신청 `market_applications`
- 제외: 단골 수(038 전이라 `null`), 오늘 품절
- 범위: `backend/` + `frontend/`(mock 대신 live 연결) + `030-api-gaps.md`. 패키지 추가 금지

## 1. 길 안내 연 횟수 기록
- 마이그레이션 `0019_store_directions.sql`: `store_directions(store_id → stores on delete cascade, day date, count int ≥ 0, primary key(store_id, day))` (주의: 040이 `0019`를 쓸 수 있으니 이 작업은 **`0020_store_directions.sql`** 로)
- `POST /stores/{store_id}/directions` (로그인 불필요, CSRF 헤더, 같은 기기(`X-Device-Id`)는 점포당 10분에 1번만 셈 — 메모리 또는 테이블, 개인 정보 저장 없음) → 204
- 화면: 길 안내 버튼(네이버·카카오 열기)을 누를 때 이 API 호출(실패해도 길 안내는 그대로)

## 2. 상인 통계 `GET /merchant/stats?days=7` (상인, days 1~28)
- `{today: {views, directions}, days: [{day, views, directions}] (오래된 날부터, 빈 날 0), favorites: null}`
- views는 점포 페이지 조회(세일 조회 포함 합계) — **사람 수가 아니라 조회 수**. 화면 문구도 "본 사람" 대신 "**조회**"로 (예: "오늘 38번 조회")
- 서울 날짜 기준

## 3. 시장 관리자 대시보드 `GET /market-admin/stats` (시장 관리자)
- `{stores: 활성 점포 수, merchants_approved, merchants_pending, views_week: 최근 7일 시장 전체 조회 합, recent: [{user_id, login_id, store_id, store_name, last_sale_at|null, sales_week}]}` (승인 상인만, 최근 세일 순)

## 4. 운영자 시장 목록 `GET /admin/markets?status=listed|active` (운영자)
- listed: `[{market_id, name, requests_week, requests_total, application: {status, created_at}|null}]` — 요청 많은 순. 화면 "신청은 없고 요청만 있는 시장"은 `application`이 null인 것
- active: `[{market_id, name, stores, merchants_approved, views_week}]`

## 5. 계약·화면
- `types/contract.ts`에 새 응답 타입, mock 갱신, WebMerchant·Merchant 막대그래프·숫자, WebMarketAdmin 카드·최근 활동, WebAdmin 두 목록을 live로 연결 (값 없으면 지금처럼 숨김)
- `030-api-gaps.md` 해당 줄 완료 표시

## 6. 테스트
- directions: 기록·같은 기기 10분 중복 무시·없는 점포 404·CSRF
- 상인 stats: 날짜 채우기(빈 날 0), days 범위, 서울 날짜 경계, 다른 상인 점포 안 섞임, 권한
- 시장 관리자 stats: 자기 시장만, 숫자 정확
- 운영자 목록: listed/active 구분, 정렬, 신청 유무, 권한(운영자만)
- 화면: 그래프·숫자 표시, 길 안내 클릭 시 기록 호출
- 백엔드 DB 테스트(`TEST_DATABASE_URL=postgresql:///marketon_test`), 프런트 전체 3번 연속 통과

## 하지 말 것
- 패키지 추가, `.env` 수정, 기존 마이그레이션 수정, 커밋, `marketon` DB 접근, 개인 식별 정보 저장(기기 ID 원문 저장 금지 — 해시나 메모리만), 단골 기능
