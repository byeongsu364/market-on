# 작업 지시서 034 · 새 화면(030 통합) 위에 리뷰·손님 가입·시장 평균 다시 얹기

- 담당: Codex · 지시: Claude · 2026-11-27 · 승인: 병수 ("새 화면 위에 제 변경을 다시 얹어. 나머지는 그대로")
- 상황: main에 팀원의 새 프런트(지시서 `030-frontend-integration.md`)가 들어옴. popcorn에서 main을 머지하는 중이고(**아직 머지 커밋 전**), 충돌난 화면 파일은 main 쪽으로 받았음. 백엔드(030b 시장 평균, 032 손님, 033 리뷰)는 그대로 살아 있음
- **원칙: 새 화면의 구조·디자인 토큰·컴포넌트(`components/common/*`, `*.module.css`, `pages/map|scan|shop|account|me|merchant`)를 따름. 팀원 화면(점포 정보, 가게 위치, QR 포스터, 장보기 동선 등)은 지우거나 숨기지 않음**
- 이전 구현 참고(내 쪽): `git show HEAD:frontend/src/types/contract.ts`, `HEAD:frontend/src/components/domain/StoreReviews.tsx`, `HEAD:frontend/src/components/domain/StorePriceDisplay.tsx`, `HEAD:frontend/src/test/customerReviews.test.tsx`, `HEAD:frontend/src/pages/Signup.tsx`. 지시서 `030b-store-price-market-avg.md`, `032-customer-signup.md`, `033-store-reviews.md`
- 범위: `frontend/` + `docs/tasks/030-api-gaps.md`. 백엔드 수정 금지(필요하면 보고). 패키지 추가 금지

## 1. 계약 (`types/contract.ts`)
- `StorePrice.source`에 `'market_avg'`, `observed_on?: string | null`
- 리뷰 타입 `StoreReview`, `StoreReviews`, `ReviewWrite` (백엔드 `GET/PUT/DELETE /stores/{id}/reviews[/me]` 응답 그대로)
- 사용자 role에 `'customer'`, 가입 요청에 `role: 'merchant' | 'customer'`
- mock(`api/mock/*`)도 맞춤. 남아 있는 `api/reviews.ts`, `api/mock/reviews.ts`, `components/domain/StoreReviews.tsx`, `StorePriceDisplay.tsx`는 새 구조에 맞게 고치거나, 새 화면 컴포넌트로 옮기고 안 쓰는 파일은 지움

## 2. 시장 평균 표시
- 새 화면에서 점포 가격이 나오는 모든 곳(점포 목록·검색 결과·점포 상세·결과 화면 판매 점포 등)에서 `source==='market_avg'`면 "시장 평균 · aT M월 D일 조사"로 표시(점포 실제 가격과 구분), stale 흐림 표시 안 함
- **가격 비교·눈금·"더 낮은 가격을 확인한 점포" 같은 점포 간 비교에서는 market_avg를 실제 확인 가격으로 쓰지 않음**(제외)
- 상인 확인 / 손님 N명 확인 표시는 새 화면 방식 유지

## 3. 점포 리뷰
- 점포 상세(`pages/map/Store.tsx`, 그리고 지도에서 점포를 열었을 때 보이는 시트가 있으면 거기도): "★ 4.3 · 손님 12명 평가", 최근 3개, "리뷰 더 보기", 내 리뷰 표시
- "리뷰 쓰기": 비로그인 → `/login?next=<지금 주소>` (Login이 next를 따르게), 손님 → 별점 1~5(접근성 라벨) + 글 200자(남은 글자) → 저장, 내 리뷰 고치기·지우기. 상인·관리자 → "리뷰는 손님 계정으로 쓸 수 있어요"
- 오류(REVIEW_BLOCKED, REVIEW_RATE_LIMIT) 표시. 새 디자인 컴포넌트 사용

## 4. 손님 가입
- `pages/account/Signup.tsx`의 손님 가입을 live에서도 켬(지금은 "백엔드에 없어서 숨김") — 새 `Captcha` 컴포넌트·`useCaptcha` 그대로 사용, 요청 `role:'customer'`
- 손님 로그인 후 이동은 `homeFor`에 customer → 홈(또는 next)
- `docs/tasks/030-api-gaps.md`의 "손님 계정" 줄을 완료로 표시(2026-11-27, 0015), 리뷰 API 줄 추가(완료)

## 5. 테스트
- 리뷰 표시·비로그인 쓰기→로그인 next·쓰기·고치기·지우기·차단 오류, 손님 가입(live/mock), 시장 평균 문구와 비교 제외
- 기존(팀원) 테스트 모두 유지

## 하지 말 것
- 커밋(머지 진행 중 — Claude가 커밋), 백엔드·`.env`·마이그레이션 수정, `marketon` DB 접근, 팀원 화면 삭제·숨김, 패키지 추가

## 자체 검수
- [ ] `npm run build`·`lint`·`npx vitest run`·`format`·`format:check` (frontend)
- [ ] 백엔드 `TEST_DATABASE_URL=postgresql:///marketon_test ../.venv/bin/pytest -q` (backend/) 그대로 통과

## 보고 (한국어, 한 번)
변경 파일, 리뷰·가입·시장 평균이 들어간 화면 위치, 지운 파일, 검수 결과, 남은 문제
