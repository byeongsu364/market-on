# 프런트엔드 개발

React 19 + TypeScript + Vite, react-router 7, vitest. 패키지는 설치된 것만 사용합니다.

## 실행

```bash
cd frontend
npm install
npm run dev
```

- **API 모드의 기본은 live**입니다. `/api`(개발 서버 프록시 → `localhost:8000`)의 실제 백엔드를 부릅니다.
- 백엔드 없이 화면만 보려면 `frontend/.env`에 `VITE_API_MODE=mock`을 적습니다. 지도 키가 없으면 지도는 약도(미리보기 지도)로 그려집니다.
- mock이어도 네이버 지도 위에서 보려면 `VITE_PUBLIC_CONFIG=live`를 함께 적습니다. 그러면 `/config/public`만 실제 서버에 물어 지도 키를 받습니다. 지도 키는 서버 환경변수에만 두고 프런트 코드·환경변수에 넣지 않습니다.

## 화면과 주소 (지시서 030)

1024px 미만은 앱처럼 하단 탭(지도·찍기·장보기), 1024px 이상은 상단 머리말과 넓은 화면입니다.

| 주소 | 화면 |
| --- | --- |
| `/` | 지도 홈(시장 밖). `?market=` 시장 안(점포·마감세일·제철과 시세 탭), `&item=` 검색 결과 |
| `/search`, `/markets`, `/s/:storeId` | 품목 검색, 시장 고르기, 점포 상세(점포 QR 착지) |
| `/scan`, `/items/:itemId`, `/items/:itemId/varieties` | 찍기·확인·직접 입력, 결과, 품종 견줘 보기 |
| `/shop`, `/shop/route`, `/chat` | 장보기 구성, 장보기 동선, 물어보기 |
| `/me`, `/me/saved`, `/me/settings` | 내 정보, 단골 점포와 알림, 언어와 화면 |
| `/login`, `/signup`, `/signup/merchant` | 로그인, 회원가입, 상인 가입 |
| `/merchant`, `/merchant/sale/new`, `/merchant/store`, `/merchant/store/location`, `/merchant/poster` | 상인 화면 |
| `/join`, `/market-admin`, `/admin` | 시장 입점 신청, 시장 관리자, 운영자 |

옛 주소는 리다이렉트됩니다: `/map` → `/`, `/recommend` → `/shop`, `/merchant/login` → `/login`, `/merchant/signup` → `/signup/merchant`.
화면 사이의 시장·점포·품목·품종·단위는 주소 쿼리(`market`, `store`, `item`, `variety`, `unit`)로, 가격과 수량은 화면 이동 상태로 넘깁니다(`hooks/useShoppingContext.ts`).

## Mock 계정

- 운영자: `admin` / `market-on-demo`
- 승인 상인: `demo_a05` / `market-on-demo` (점포 A-05)
- 대기 상인: `pending_a08` / `market-on-demo` (점포 A-08)

mock 계정·세일·승인 데이터는 메모리에서 변경됩니다. 세션은 sessionStorage에 보관하며,
새로고침하면 기본 계정은 복원되지만 새 가입·수정 데이터는 초기화됩니다.
실제 30일 쿠키 세션은 live API가 관리합니다.

mock에만 있는 기능과 백엔드에 필요한 API는 [`docs/tasks/030-api-gaps.md`](../docs/tasks/030-api-gaps.md)에 있습니다.

## 검증

`npm run format`, `npm run build`, `npm run lint`, `npm run test`, `npm run format:check`

## 출처와 라이선스

- 글꼴: Pretendard Variable (SIL Open Font License 1.1), `public/fonts/PretendardVariable.woff2`
- 로고·품목 그림(`public/brand`, `public/items`)·아이콘: 2026-11-26 화면 시안에서 만든 것(생성형 AI 산출물, Claude)
