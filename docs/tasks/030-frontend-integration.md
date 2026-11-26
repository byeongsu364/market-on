# 작업 지시서 030 · 프런트 통합 1차: 지도 우선 화면 구조와 새 디자인 (mock 모드)

- 담당: (코딩 에이전트) · 지시: 강현 · 2026-11-26 · 승인: [확인 필요]
- 이유: 기능은 조각으로 다 있지만 화면에서 화면으로 넘어가는 길이 끊겨 있음. 기획서가 정한 한 흐름(지도에서 찾기 → 가기 → 찍기 → 판단)으로 프런트를 먼저 잇고, 백엔드는 그 뒤에 맞춤.
- 기존: `frontend/`(React 19 + TS + Vite, react-router 7, vitest). 화면은 `src/pages/*`, 데이터는 `src/api/*`가 `isMock`으로 `src/api/mock/*`와 실제 API를 가름(`VITE_API_MODE=mock`일 때만 mock, 기본은 live). 타입은 `src/types/contract.ts`. 첫 화면이 찍기 홈이고 지도는 `/map`.
- 범위: `frontend/`, 문서, 루트 `.env.example`의 프론트 구역. `backend/`, `data/`는 고치지 않음. 패키지 추가 금지.
- 끝나면: `cd frontend && npm run format && npm run build && npm run lint && npm run test && npm run format:check`

## 0. 먼저 읽기

1. 레포 문서: `CLAUDE.md`, `docs/CONTEXT.md`, `frontend/README.md`, `frontend/DESIGN.md`
2. 화면 시안 52개와 디자인 규칙: 레포의 `docs/design/handoff-2026-11-26/` 폴더
   - zip(`market-on-design-handoff-2026-11-26.zip`)으로 받았으면 `docs/design/` 아래에 풀어 이 경로가 되게 함.
   - `README.md`와 `screens.md`부터 읽음. 값(여백, 글자 크기, 색)은 `html/<화면>.html`의 인라인 스타일에서 그대로 가져옴. `screens/<화면>.png`는 눈으로 견줄 캡처, `design-system/README.md`는 규칙 전문, `tokens.css`는 토큰.
   - 폴더가 없으면 같은 내용의 링크를 봄: 화면 시안 https://claude.ai/artifact/NVrbbsZdGNSqeD3Sg1fhD2 (화면마다 `<화면>.dc.html`), 디자인 시스템 https://claude.ai/artifact/L1V5Jh6ykC828Qkox5KdTx
   - 폴더도 없고 링크도 열 수 없으면 화면을 짐작해서 만들지 말고, 멈춰서 그 사실을 알림.
3. 기획서: https://claude.ai/artifact/9ojjeWqstvNQzEXqA3JNFk ("화면 통합안", "살까 말까", "시안에서 더한 것"). 열 수 없으면 이 지시서만으로 진행함.
4. 관련 지시서(`docs/tasks/`): 009(프런트 P0), 016(live 전환), 025(품종별 기준시세), 026(경동시장 점포 데이터), 027(지도 흐름), 028(판단 카드), 029(제철 온톨로지)

서로 다르면 이 지시서, 화면 시안, 기획서, `frontend/DESIGN.md` 순서로 따름. `CLAUDE.md`의 서비스 원칙과 보안 규칙은 언제나 먼저임.

## 1. 끝난 상태

- `frontend/.env`에 `VITE_API_MODE=mock`을 적고 `cd frontend && npm install && npm run dev`로 띄우면 3장의 모든 주소가 열리고 화면끼리 이어짐. 백엔드와 지도 키가 없어도 됨.
- 첫 화면 `/`가 지도임. mock에서 지도 키가 없어도 지도 화면(핀, 시장 경계, 점포 목록 시트)이 약도로 보임(6장).
- 폭 1024px 미만은 앱처럼(하단 탭), 1024px 이상은 일반 웹(상단 머리말, 지도 화면은 왼쪽 패널과 오른쪽 지도).
- 결과 화면에서 품종을 바꾸면 결론 문구, 가격 눈금, 기준시세, 차이가 함께 바뀜.
- 검증 명령 다섯 개가 모두 통과함. 기존 테스트는 지우지 않고 새 화면 구조에 맞게 고침. 지워야 하면 이유를 보고에 적음.
- live 모드(`VITE_API_MODE`를 적지 않음)는 지금 되는 기능이 그대로 됨. 백엔드에 아직 없는 기능은 live에서 숨기고 화면이 깨지지 않음.
- 루트 `.env.example`의 프론트 구역에 `# VITE_API_MODE=mock`, `# VITE_PUBLIC_CONFIG=live` 예시 줄을 더하고, `frontend/README.md`의 실행 방법을 실제와 맞춤(지금은 "기본 API 모드는 mock"이라고 적혀 있지만 실제 기본은 live임).

## 2. 하지 않는 것

- `backend/`, `data/` 수정. 필요한 API는 5장 표로 정리만 함.
- 패키지 추가. 쓰지 않게 된 글꼴 패키지(`wanted-sans`, `@sun-typeface/suit`, `@fontsource-variable/geist`)는 지우지 말고 보고에 적음.
- 지도 SDK 교체. 네이버 지도 JS와 `src/utils/naverMap.ts`의 키 로딩, 인증 실패 처리를 그대로 씀. 지도 키를 프런트 코드, 프런트 환경변수, 문서에 넣지 않음. 키는 지금처럼 서버의 `/config/public`으로만 받음.
- 디자인 자료 폴더(`docs/design/handoff-2026-11-26/`)를 커밋하는 것. 카카오 지도 캡처가 들어 있는 참고 자료임. 앱에 쓰는 글꼴, 로고, 아이콘, 품목 그림만 `frontend/` 아래로 복사해서 커밋함. 폴더의 `assets/placeholder/map-*.jpg`(시안용 지도 그림)와 `assets/scene`(찍기 화면의 사진 자리 그림)은 앱에 넣지 않음.
- 신선도 판정, 등급, 별점, "사지 마세요" 문구.
- 사진의 생김새로 품종을 추측하는 것(지시서 025). 품종은 가격표에서 읽었거나 손님이 고른 것만 씀.
- 새 사실 만들기.
  - 화면의 숫자와 이름은 시안에서 베끼지 않고 데이터(mock, live)에서 가져옴. 시안의 경동시장, 점포 108곳, 점포 이름, 가격은 화면을 보여 주려는 예시임(후지 1,690원과 홍로 2,590원은 `docs/2026-11-26.md`에 적힌 조회값).
  - 기존 mock의 시장(시연 시장), 점포 24곳, 가격(사과 후지 3,200원, 홍로 3,500원, 시나노골드 없음)은 바꾸지 않고 새 필드만 더함.
  - 품종 수확 시기는 온톨로지 값만 씀(후지 "10월 하순 이후", 홍로 "9월 상·중순", 시나노골드와 신고는 "정보가 아직 없어요").
  - 품종 설명 문장은 시안에서 베끼지 않고 `data/rag_docs/<품목>/varieties.md`에 있는 문장만 씀. 문장이 없는 품종(시나노골드 등)은 설명을 비움.
- 다크 화면 다듬기와 번역. 토큰의 다크 값과 i18n 구조는 유지하고, 새 문구는 `src/i18n/locales/ko.json`에만 키로 추가함(다른 언어는 지금처럼 한국어로 대신 보임).
- main에 직접 커밋하거나 푸시하는 것. 새 브랜치 `feat/030-frontend-integration`에서 작업하고, 푸시와 PR은 지시가 있을 때만 함.

## 3. 화면과 주소

화면 이름은 `screens.md`의 파일 이름임. 기존 주소는 리다이렉트로 살림: `/map` → `/`(쿼리 유지), `/recommend` → `/shop`, `/merchant/login` → `/login`, `/merchant/signup` → `/signup/merchant`.

| 주소 | 화면 (모바일 · PC) | 기존 재료 | 비고 |
| --- | --- | --- | --- |
| `/` | Main · WebMain, 첫 방문 Onboard, 지도 실패 Error | `MarketMap.tsx`의 시장 밖, `NearbyMap`, `MarketCard`, `useNearbyMarkets` | 위치를 거부하면 `/markets`로 안내 |
| `/?market=:id` | MarketInside, MarketSheet, Sales, MarketInfo · WebMarket | `MarketMap.tsx`의 시장 안, `StoreSheet`, `Home.tsx`의 마감세일·제철·시세 | 시트 기본은 전체 점포 목록. `tab=stores\|sales\|info`. 준비 중 시장이면 Request |
| `/?market=:id&item=:id` | SearchResult · WebHome | `MarketMap.tsx`의 `?item=`, `useMapFlow` | `variety`, `store` 쿼리 추가. 파는 점포만 핀, 나머지는 점 |
| `/search?market=:id` | Search, SearchEmpty | `ManualInput`, `useItemCatalog` | PC는 머리말 검색창 |
| `/markets` | Markets | `MarketSelect.tsx` | |
| `/s/:storeId` | Store · WebStore | `StorePage.tsx` | 점포 QR 착지. 주요 버튼은 길 안내 |
| 시트 | Route | `Directions.tsx`, `utils/directions.ts` | 목적지를 점포로. 목적지만 넘기고 손님 위치는 넘기지 않음 |
| `/scan` | Scan, ScanConfirm · WebScan | `Scan.tsx`, `useCamera`, `useRecognize` | 확인은 같은 주소의 다음 단계. `mode=manual`이면 ScanManual |
| `/items/:itemId` | Result, ResultHigh, ResultNoPrice · WebResult | `Result.tsx`, `PriceCompare`, `Checklist`, `AskPanel` | `variety`, `unit`, `store`, `market`은 쿼리, 가격과 수량은 이동 상태 |
| `/items/:itemId/varieties` | Variety · WebVariety | 신규 | |
| 시트 | Card | `DecisionCardSheet`, `utils/decisionCard.ts` | 가격 눈금과 구간 문구 한 줄 추가 |
| `/shop` | Shop · WebShop | `Recommend.tsx` | |
| `/shop/route` | ShopRoute | 신규 | 여러 품목을 가까운 순서로, 산 것 체크 |
| `/chat` | Chat | `Chat.tsx` | |
| `/me`, `/me/saved`, `/me/settings` | My, Saved, Settings | `Header`의 언어·테마 선택 | 신규. 상인 화면은 여기서 들어감(PC는 머리말의 "상인·시장") |
| `/login`, `/signup` | Login, Signup · WebLogin, WebSignup | `AuthForm`, `MerchantLogin` | 캡차는 서버 그림 그대로. live에서는 손님 가입을 숨기고, 로그인은 지금 계정(상인, 시장 관리자, 운영자)으로 동작 |
| `/signup/merchant` | SignupMerchant, Pending | `MerchantSignup`, `MerchantStart` | 3단계 |
| `/merchant` | Merchant · WebMerchant | `MerchantStart`, `MerchantHome` | |
| `/merchant/sale/new`, `/merchant/store`, `/merchant/store/location`, `/merchant/poster` | SaleNew, StoreEdit, StorePin, Poster | 기존 3개와 신규 1개 | 지금의 접근 제한(`MerchantGuard`) 유지 |
| `/join` | Join · WebJoin | `Join.tsx` | |
| `/market-admin`, `/market-admin/poster`, `/admin` | WebMarketAdmin, WebAdmin | `MarketAdmin.tsx`, `admin/AdminHome.tsx` | 기능과 접근 제한은 그대로, 디자인만 새로 |

`Home.tsx`(찍기 홈)는 없어짐. 그 안의 찍기는 `/scan`, 직접 입력은 `/search`, 제철·시세·마감세일은 시장 시트의 탭으로 옮김.

## 4. 화면 사이에 들고 다니는 값

- 시장, 점포, 품목, 품종, 단위는 주소 쿼리(`market`, `store`, `item`, `variety`, `unit`)로 넘김. 새로고침, 공유 링크, 점포 QR, 대화의 "지도 보기"가 같은 상태로 열려야 함.
- 가격과 수량만 화면 이동 상태에 둠.
- 읽고 쓰는 곳은 훅 하나(`useShoppingContext`)로 모음. `store/session.ts`의 시장 자동 선택은 유지하고, 주소에 값이 있으면 주소가 이김.

## 5. 데이터: mock 먼저

- 기존 방식 유지: `src/api/<영역>.ts`에서 `isMock`으로 가르고, 타입은 `src/types/contract.ts`에 둠.
- 이미 있는 API는 그대로 씀. `Price`의 `varieties`, `fallback`, `by_market_type`, `this_market`은 값이 있으면 결과 표에 줄을 더함.
- 새 필드의 mock 값(점포 위경도, 시장 경계, 편의시설 위치, 4주 시세, 조회 수, 단골 수, 거리)은 예시임. mock 파일에 "예시 값" 주석을 달고, 화면에는 기존 샘플 표시 규칙과 "핀 위치는 예시" 표기를 둠. 점포 위경도는 시장 중심 둘레의 예시 경계 안에 구역별로 모아, 실행할 때마다 바뀌지 않는 고정 값으로 둠.
- 아래는 백엔드에 아직 없음. mock에만 만들고, 같은 표를 `docs/tasks/030-api-gaps.md`로 남김.

| 필요한 것 | 쓰는 화면 | 제안 형태 |
| --- | --- | --- |
| 가격 구간 코드 | Result, Card, 목록의 작은 눈금 | `/price` 응답에 `band`. 그때까지 프런트 util `priceBand()`가 같은 규칙으로 계산 |
| 점포 좌표, 카테고리, 네이버 지도에서 열 이름, 현장 확인 여부 | 지도 핀, Route | 지도 응답의 점포에 `lat`, `lng`, `category`(store_category id), `naver_name`, `verified`. 지금 상가정보에는 시장 안 위치가 없음(지시서 026) |
| 시장 경계와 편의시설 | MarketInside | 시장에 `boundary`(좌표 목록), `facilities`(입구·주차장·화장실), 시장 단위 주차장·화장실·상품권 유무 |
| 영업 중, 결제 수단, 점포별 품종, 오늘 품절 | 점포 목록, 검색 거르기, Store | 점포에 `open_now`, `payments`, `varieties`, `sold_out_item_ids` |
| 여러 품목 지도 | ShopRoute | `/markets/{id}/map?item=a&item=b`. 방문 순서는 프런트에서 가까운 순으로 계산 |
| 품종 설명과 수확 시기 | Variety, Result | 품종에 `description`, `harvest`(온톨로지 `harvestPeriod`의 `label`, `from`, `to`) |
| 품종별 최근 4주 시세 | Result | `/price/history?item=&variety=&weeks=4` |
| 단골 점포와 알림 | Store, Saved, SaleNew | `/me/favorites`, 푸시 구독 |
| 손님 계정 | Login, Signup | 역할 `customer` 추가 |
| 가게 위치 저장, 품절 스위치 | StorePin, Merchant | `/merchant/store/location`, 품목별 품절 |
| 경계·편의시설·공지 편집 | WebMarketAdmin | 이번에는 표시만, 편집은 mock |

## 6. 디자인

전체 규칙은 `design-system/README.md`에 있음. 아래는 놓치기 쉬운 것만 적음.

- 토큰: 디자인 폴더의 `tokens.css` 값을 `src/styles/tokens.css`에 반영. 변수 이름은 유지하고 새 변수를 더함. 옛 원색 변수(`--olive`, `--peach`, `--cream` 계열)는 없앰.
- 자산: 글꼴, 로고, 품목 그림, 아이콘은 디자인 폴더의 `assets/`, `icons/`에서 복사함. 폴더 없이 링크로 작업해서 내려받지 못한 자산은 비슷한 것으로 대신하지 않고 자리만 잡은 뒤 보고에 적음(글꼴은 시스템 글꼴로 둠).
- 글꼴은 Pretendard Variable 한 가족. `assets/fonts/PretendardVariable.woff2`를 `frontend/public/fonts/`에 두고 `@font-face`로 불러옴. 제목 600, 본문 400, 가격 숫자만 700과 `tabular-nums`. 한글은 `word-break: keep-all`.
- 로고: `public/brand/`의 파일 이름은 유지하고 내용만 바꿈. `logo-light.svg` ← `marketon-logo.svg`, `logo-dark.svg` ← `marketon-logo-inverse.svg`, `icon.svg` ← `marketon-icon.svg`. `index.html`의 `theme-color`는 `#ffffff`와 `#111113`.
- 품목 그림은 품목 id로 고름(`item:sweet_persimmon` → `persimmon.svg`, 사과 품종은 `apple-hongro.svg`, `apple-shinano-gold.svg`). 그림이 없는 품목은 그림 없이 연한 면만 둠.
- 공통 컴포넌트: 기존 `components/common/*`(Button, Card, ChipGroup, ErrorBox, Loading, Resource, Sheet)을 새 디자인으로 고쳐 쓰고, 없는 것만 새로 만듦(Field, ListRow, SectionHeader, 탭 있는 BottomSheet, TabBar, SearchBar, Segmented, Toggle, Stepper, PriceGauge와 작은 눈금, ItemTile, CategoryBadge, MapView와 그 안의 MapPin, FacilityMarker, MarketBoundary, StopMarker). 버튼은 주요, 면, 외곽선, 밑줄 글자 네 가지에 높이 54/48/38.
- 주요(검정) 버튼은 한 화면에 하나. 나머지는 테두리 없는 옅은 면. 목록은 카드로 싸지 않고 구분선으로 나눔.
- 주황은 켜진 것 하나에만 씀(가격 눈금의 켜진 칸, 마감세일 점, 선택된 점포 면). 좋고 나쁨을 초록과 빨강으로 칠하지 않음.
- 가격 눈금은 네 칸이고 한 칸만 켬. 문구는 AI가 아니라 코드가 고름. 구간은 화면에 보이는 `diff_pct`(반올림한 정수, `utils/diffPct.ts`)로 정함.
  - 기준시세보다 30% 넘게 낮음: 1번 칸, "많이 낮아요, 상태를 꼭 확인하세요"
  - 30% 낮음부터 5% 높음까지: 2번 칸, "살 만한 가격이에요"
  - 5% 초과 20% 이하로 높음: 3번 칸, "시세보다 조금 높아요"
  - 20% 넘게 높음: 4번 칸, "시세보다 높은 편이에요"
  - 기준시세가 없거나 대체값: 칸을 모두 끔, "비교는 참고만 하세요". `fallback`이 있으면 무엇으로 대신했는지 적음. 고른 품종의 `varieties[].reference_price`가 비어 있으면 그 품종은 기준시세가 없는 것으로 봄
- 신선도에는 어떤 결론도 붙이지 않고 "확인 4개 중 3개"처럼 손님이 한 체크만 셈. 판단 카드 하단 문구는 "신선도는 직접 확인했어요".
- 문구는 짧은 해요체. 정보를 가운뎃점으로 길게 잇지 않음. 팀이 정한 꼬리표("업종 기준 · 상인 확인 전")와 출처·조사일 표기는 유지.
- 하단 탭은 지도, 찍기, 장보기 세 칸. 가운데 찍기만 검정 면에 글자를 넣은 버튼. 내 정보는 검색창 오른쪽 둥근 버튼.
- 반응형: 1024px 미만은 한 단에 하단 탭, 본문 최대 폭 480px 가운데. 1024px 이상은 상단 머리말, 지도 화면은 왼쪽 패널 420~460px과 오른쪽 지도, 그 밖은 최대 1140px. `frontend/DESIGN.md`의 "데스크톱은 가운데 480px 앱 프레임" 규칙은 이 지시서로 바꿈.
- 지도는 `MapView` 하나로 감싸고, 그리는 방식을 둘로 둠.
  - 네이버 지도: 키를 받고 SDK가 뜨면 씀. 핀은 `icons/map/pin-*.svg`를 쓰는 HTML 마커(30×37.5, 끝점이 점포 위치). 시장 경계는 2px 선의 폴리곤, 바깥은 흰 면 66%로 덮음(구멍 뚫린 폴리곤. SDK에서 안 되면 경계선만 그리고 보고에 적음). `naverMap.ts`의 타입은 필요한 만큼만 넓힘.
  - 약도(지도 타일 없는 미리보기): mock에서 키가 없을 때와 테스트에서 씀. 연한 면 위에 같은 경계, 핀, 편의시설, 내 위치를 위경도 비례로 그리고, 구석에 "미리보기 지도"라고 적음.
  - mock의 `publicConfig()`는 지금처럼 키 없음(`null`)이 기본. `frontend/.env`에 `VITE_PUBLIC_CONFIG=live`를 적으면 mock이어도 `/config/public`만 실제 서버에 물어 키를 받게 함(mock 핀을 네이버 지도 위에서 확인하는 용도).
  - 핀 상태: 기본, 마감세일 점, 선택(44×55와 이름·가격 말풍선), 줄인 회색 점(9px). 입구·주차장·화장실은 24px 흰 원 아이콘.
  - 카테고리 아이콘과 색은 `category`가 올 때까지 구역 이름으로 정함: 채소·과일, 청과, 채소 → produce / 건어물·젓갈 → dried / 수산 → seafood / 반찬 → side / 정육 → meat / 떡·분식, 떡 → ricecake / 그 밖은 회색 기본 핀.
  - 점포에 좌표가 없는 응답(지금의 live)이면 시장 안 지도 자리에 기존 평면도(`MiniMap`)를 새 토큰으로 고쳐 넣고 안내 문구는 유지함. 시트와 목록은 새 디자인 그대로 씀.
  - live에서 키가 없거나 SDK를 못 불러오거나 인증이 실패하면 Error 화면을 보이고 `/markets` 목록으로 갈 수 있게 함.
- PWA: `public/manifest.webmanifest`, 앱 아이콘, 앱 틀만 캐시하는 가벼운 서비스 워커를 직접 작성(개발 모드에서는 등록하지 않음). `viewport-fit=cover`와 `env(safe-area-inset-*)`로 위아래 안전 영역을 비움. 아이콘 PNG를 만들 도구가 없으면 SVG만 넣고 보고에 적음.
- 접근성: 터치 영역 44px 이상(칩과 작은 버튼은 보이는 높이 38px에 터치 영역 44px), 글자 대비 4.5:1 이상, 실제 `button`·`a`·`input`+`label`, 포커스 링 2px, `prefers-reduced-motion` 존중.

## 7. 순서 (단계마다 검증하고 커밋)

1. 준비: 브랜치를 따고 문서를 읽음. 지금 상태에서 검증 명령을 돌려 기준을 적음. 이 지시서가 `docs/tasks/030-frontend-integration.md`에 없으면 그 이름으로 저장.
2. 토큰, 글꼴, 로고, 공통 컴포넌트와 그 테스트.
3. 앱 틀: 주소 재편과 리다이렉트, 하단 탭, PC 머리말과 2단 틀, `useShoppingContext`.
4. 지도 틀(`MapView`의 두 방식), 지도 홈(시장 밖과 안), 점포 목록 시트, 검색, 검색 결과, 점포 상세, 길 안내.
5. 찍기, 확인, 직접 입력, 결과(품종 전환과 눈금), 품종 견줘 보기, 판단 카드.
6. 장보기, 장보기 동선, 물어보기.
7. 내 정보, 단골, 설정, 로그인, 회원가입, 상인 가입.
8. 상인 화면, 시장 입점 신청, 시장 관리자, 운영자.
9. PWA, 접근성 점검, 문서 정리(`frontend/DESIGN.md`와 `docs/Design Tokens.Md`를 새 시스템에 맞게 고치고 맨 위에 바꾼 날짜와 이유를 적음, `frontend/README.md`, 그날의 작업 일지 `docs/2026-11-DD.md`).

## 8. 확인

- 단계마다 바뀐 화면을 390px과 1440px 폭으로 캡처해 `screens/<화면>.png`와 나란히 봄. 시장 이름과 숫자는 데이터가 달라서 다를 수 있으니 배치, 여백, 글자 크기, 색을 봄. 다르게 만든 곳은 이유를 적음. 캡처할 도구가 없으면 건너뛰고 보고에 적음.
- mock에서 지도 키 없이 `/`, `/?market=market:demo`, `/?market=market:demo&item=item:apple`이 약도로 보이는지 확인.
- 주소만으로 상태가 복원되는지 확인: `/?market=…&item=…&store=…`, `/items/…?variety=…`를 새 탭에서 열어 봄.
- 품종 전환: mock에서 사과 1개를 2,300원으로 넣으면 후지는 2번 칸(28% 낮음), 홍로로 바꾸면 1번 칸(34% 낮음), 시나노골드는 칸이 모두 꺼짐.
- 키보드만으로 지도 홈에서 검색, 점포, 길 안내까지 갈 수 있는지 확인.

## 9. 끝나면 보고

- 만든 화면과 주소, 아직 mock으로만 도는 기능.
- 시안과 다르게 만든 곳과 이유.
- 고치거나 지운 테스트, 새로 쓴 테스트.
- `docs/tasks/030-api-gaps.md` 위치.
- 디자인 폴더에서 `frontend/`로 복사한 자산 목록과, 가져오지 못한 자산.
- 출처와 라이선스 기록: Pretendard(SIL OFL 1.1), 로고·아이콘·품목 그림(이번 시안에서 만든 것, 생성형 AI 산출물).
- [확인 필요] 목록. 적어도 다음을 포함함: 디자인을 올리브·피치에서 새 시스템으로 바꾸는 것의 팀 승인, `CLAUDE.md` 서비스 원칙에 "가격 구간 문구는 코드가 계산해 붙인다"를 명시할지, 손님 계정을 만들지, 디자인 폴더를 레포에 넣을지.

막히면 추측으로 사실(가격, 품종 정보, 점포 정보)을 만들지 말고 [확인 필요]로 남긴 뒤 다음 단계로 넘어감.
