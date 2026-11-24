# 프런트엔드 개발

패키지는 설치된 것만 사용합니다. 기본 API 모드는 mock이며 live 모드는 기존 Vite 설정을 따릅니다.

## Mock 계정

- 운영자: `admin` / `market-on-demo`
- 승인 상인: `demo_a05` / `market-on-demo` (점포 A-05)
- 대기 상인: `pending_a08` / `market-on-demo` (점포 A-08)

mock 계정·세일·승인 데이터는 메모리에서 변경됩니다. 세션은 sessionStorage에 보관하며,
새로고침하면 기본 계정은 복원되지만 새 가입·수정 데이터는 초기화됩니다.
실제 30일 쿠키 세션은 live API가 관리합니다.

## 검증

`npm run format`, `npm run build`, `npm run lint`, `npm run test`, `npm run format:check`
