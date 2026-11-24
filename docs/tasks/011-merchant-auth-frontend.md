# 작업 지시서 011 · 상인 로그인·상인 페이지·마감세일 프론트

- 담당: Codex · 지시: Claude · 2026-11-24
- 명세: **`docs/design/05-merchant-auth.md`** (2장 상인이 쓰게 만드는 설계, 4장 API 계약, 5장 화면)
- 디자인: **`frontend/DESIGN.md`** (최우선), `docs/Design Tokens.Md`
- 기존 구조 유지: `frontend/src` (pages 조립만, hooks 상태, api 호출, utils 계산, fetch는 `api/client.ts`만, mock/live 모드)
- 범위: **`frontend/`만**. 백엔드는 다른 작업(010)이 동시에 진행 중
- 설치됨: `qrcode`, `@types/qrcode`. 다른 패키지 추가 금지. 코드 작성 후 **`npm run format`** 실행 (한 줄에 몰아 쓰지 않기)

## 할 일
1. **계약 타입** `types/contract.ts`에 05 문서 4장 추가: `User`, `AuthRequest`, `MerchantStore`, `ClosingSale`, `SaleRequest`, `PosterInfo`, `PendingMerchant`, 공개 `ActiveSale`, `StorePage`. 지도 점포에 `active_sale?`
2. **api**: `api/auth.ts`, `api/merchant.ts`(교체), `api/admin.ts`, `api/sales.ts`. `client.ts`에 `credentials: 'include'`와 상태 변경 요청에 `X-Requested-With: market-on` 헤더, 401 처리
3. **mock**: 로그인 상태를 메모리 + `sessionStorage`(try/catch)로 흉내. 계정 예시: 운영자 `admin` / `market-on-demo`, 승인된 상인 `demo_a05` / `market-on-demo` (점포 A-05), 대기 상인 1명. 비밀번호는 mock 파일에만 있고 화면에 표시 안 함 (README 개발 안내에만)
   - 오늘 추천 mock(`picks`) 삭제 → 마감세일 mock: A-05 대파 2,500원(정가 3,000원) 진행 중 1건
4. **세션 상태**: `store/auth.ts` (React context) + `hooks/useAuth.ts` (`me`, `login`, `logout`, `signup`)
5. **화면** (05 문서 5장)
   - `pages/merchant/MerchantStart.tsx` (`/merchant`: 비로그인 소개 / 대기 / 상인 홈 분기)
   - `pages/merchant/MerchantLogin.tsx`, `MerchantSignup.tsx` (시장 → 점포 → 아이디·비밀번호 → 대기 안내, 단계 표시는 "1/3"처럼 글자로)
   - `pages/merchant/MerchantHome.tsx` (숫자 2개, "마감세일 올리기", 진행 중(내리기), 지난 세일(다시 올리기), 링크들)
   - `pages/merchant/SaleNew.tsx` (30초 마감세일: 품목 칩 → 할인가 숫자 키패드 → 정가(선택, 접힘) → 끝나는 시각 칩 "1시간 뒤 · 2시간 뒤 · 영업 마감" → 올리기. 확인 문장 "18:00까지 대파 2,500원으로 올릴게요")
   - `pages/merchant/StoreEdit.tsx` (영업시간 시작·끝 `<select>` 30분 단위, 취급 품목 칩 다중 선택)
   - `pages/merchant/Poster.tsx` (`qrcode`로 SVG 생성, `@media print` 인쇄용: 흰 배경, 시장·점포 이름, 큰 QR, "찍으면 오늘 마감세일이 보여요", "인쇄하기" 버튼은 인쇄 시 숨김)
   - `pages/admin/AdminHome.tsx` (`/admin`: operator 로그인 → 대기 목록 → 승인·거절, 처리 후 목록에서 사라짐)
   - `pages/StorePage.tsx` (`/s/:storeId`: 소비자용 점포 공개 페이지)
   - 기존 `MerchantRegister.tsx`, `MerchantPick.tsx` 삭제 (새 화면으로 대체)
   - 라우트 가드: `/merchant/*`(sale/new, store, poster)는 승인 상인만, 아니면 `/merchant`로
6. **상인 화면 스타일**: 루트에 `data-mode="merchant"` → 본문 18px, 주요 버튼 64px, 한 화면 한 가지 일 (DESIGN.md 토큰 그대로, 새 색 금지)
7. **소비자 화면 변경**
   - 홈: "상인 오늘 추천" → **"지금 마감세일"** (진행 중만, "18:00까지 2,500원 (정가 3,000원)", 점포 이름 → `/s/:storeId`), 없으면 섹션 숨김
   - 결과 화면 "파는 점포 보기"로 가는 지도에서 세일 점포에 "마감세일" 배지, 바텀시트에 세일 정보
   - 세일 카드가 화면에 보이면 `POST /sales/{id}/view` (같은 세일은 기기당 하루 1회, localStorage try/catch)
   - 금지 문구: "특가", "강력 추천", "놓치지 마세요" 등 과장
8. **i18n**: 새 문구는 ko에 작성, 다른 언어는 키만

## 테스트 (vitest)
- mock 로그인 → 상인 홈 숫자 2개 표시 / 대기 상인은 대기 화면 / 비로그인으로 `/merchant/sale/new` → `/merchant`
- 마감세일 올리기: 품목·가격·시각 선택 → 확인 문장 → 올리면 진행 중 목록·소비자 홈에 나타남 → 내리기 후 사라짐
- 운영자 승인 → 대기 목록에서 사라짐
- 포스터 화면에 QR `svg` 렌더링, URL이 `/s/store:…`
- 과장 문구 grep 테스트
- 기존 14개 테스트 유지 (오늘 추천 관련은 마감세일로 수정)

## 하지 말 것
- `backend/` 수정, 패키지 추가, `.env` 수정, 커밋, 새 색·그라데이션·이모지

## 자체 검수
- [ ] `npm run build`, `npm run lint`, `npm run test`, `npm run format:check` 통과
- [ ] `grep -rn "fetch(" src` → `api/client.ts`만, HEX는 `constants/zones.ts`·`styles/tokens.css`만
- [ ] 140자 넘는 줄 없음

## 보고 (한국어, 끝난 뒤 한 번)
만든·지운 파일, 화면별 상태, 검수 결과, 05 문서·DESIGN.md와 다르게 한 점, 남은 문제
