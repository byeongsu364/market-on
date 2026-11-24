# 작업 지시서 009 · 프론트 화면 (P0 + P1 기본) · 가짜 데이터 모드

- 담당: Codex · 지시: Claude · 2026-11-24
- 기준 문서 (반드시 읽기)
  - **`frontend/DESIGN.md`** (글꼴·모서리·상태·움직임·하지 말 것 — 최우선)
  - `docs/Design Tokens.Md` (색 토큰 값, 라이트/다크, 사용 규칙)
  - `docs/Market-On 개발 전 기획서 (MVP·서비스 개요).md` ④ 화면 설계 · ⑦ API 명세 · ⑩ 시연 시나리오
  - `docs/design/02-structure.md` 프론트 규칙 (pages는 조립만, 상태·로직은 hooks, 서버 호출은 api, 계산은 utils, fetch는 `api/client.ts`에서만)
- 이미 설치함 (네트워크 필요 없음): `@sun-typeface/suit`, `wanted-sans`, `@fontsource-variable/geist`, `vitest@3`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`. **새 패키지를 추가하지 마세요** (설치 불가). 아이콘은 인라인 SVG로 직접

## 목표
기획서 ⑩ 시연 시나리오의 1~4단계(찍고 → 판단하고 → 가격 → 찾고)를 **백엔드 없이 가짜 데이터로 끝까지** 눌러 볼 수 있게 만들어요. 실제 API가 생기면 환경변수 하나로 바꿔요.

## 1. 화면과 라우트
| 화면 | 라우트 | 파일 | 단계 |
|---|---|---|---|
| S1 홈 | `/` | `pages/Home.tsx` | P0 |
| S2 촬영·인식 확정 | `/scan` | `pages/Scan.tsx` | P0 |
| S3 구매 판단 결과 | `/items/:itemId` | `pages/Result.tsx` | P0 |
| S4 시장 점포 지도 + S5 점포 상세(바텀시트) | `/map?item=` | `pages/MarketMap.tsx` + `components/domain/StoreSheet.tsx` | P0 |
| 시장 선택 | `/markets` | `pages/MarketSelect.tsx` | P0 (필수 입력 1회) |
| S6 AI 구매 추천 | `/recommend` | `pages/Recommend.tsx` | P1 기본 |
| M1 상인 점포 등록 · M2 오늘 추천 올리기 | `/merchant`, `/merchant/pick` | `pages/MerchantRegister.tsx`, `pages/MerchantPick.tsx` | P1 기본 |
- 기존 `Card.tsx`, `Recipe.tsx`, `Agent.tsx`, `Merchant.tsx`, `Map.tsx` 삭제 (기획에서 제외·이름 변경)
- 하단 탭: 홈 · 지도 · 추천 · 상인 (현재 탭 표시는 `text` / 나머지 `text-secondary`, 상단 1px `border`)
- 화면 흐름은 기획서 ④ "화면 흐름" 1~4 그대로

## 2. 화면별 내용
- **S1 홈**: 맨 위 현재 시장 한 줄(없으면 "시장을 골라 주세요" → `/markets`), 로고 차양 줄무늬를 이 표시줄에만 얇게(DESIGN 2장) / 가운데 큰 **찍기** 버튼(주요 버튼, 화면 폭, 높이 72px 안팎) / 오늘 기준시세 3품목: 가격표 위계(품목명 → 큰 가격 → 단위 → 출처·조사일 캡션) / 상인 오늘 추천 목록(배지 "오늘 추천"은 `accent`+`on-accent`)
- **S2 촬영·인식**: `<input type="file" accept="image/*" capture="environment">`로 촬영 또는 앨범 → 미리보기 → `POST /recognize` → 신뢰도 0.8 이상이면 1순위로 바로 S3, 아니면 후보 3개 칩 + "목록에 없어요" → 품목 검색(이름·동의어). 인식 라벨(vision_labels)도 작게 보여 줌
- **S3 결과**: 품목명 큰 제목 / **확인 포인트 체크리스트**(실제 checkbox, 항목마다 출처 캡션, "AI가 판정하지 않아요. 직접 확인해 보세요" 한 줄) / **가격 입력**(숫자 키패드 `inputMode="numeric"`, 단위 칩: 기본 판매 단위 선택됨) → 기준시세 대비 `▼ 12%` / `▲ 5%` + 스크린리더 문장 + 기준값·조사지역·조사일·대체(fallback) 여부 캡션, 전통시장·대형유통 평균이 있으면 두 줄로 / 하단 고정 "파는 점포 보기" → `/map?item=`
  - 금지: "신선", "좋음", "추천 구매", 등급, 색으로 좋고 나쁨 표시
- **S4 지도**: 시장 평면도 SVG(구역 사각형 + 구역 이름, DESIGN 4장 구역 6색 20% 면), 점포 작은 사각형(`map_x`,`map_y`), `item`을 파는 점포는 `accent` 면 + 2px `text` 테두리, 위에 "대파 파는 점포 3곳" 요약. 구역 범례(색 + 이름). 점포를 누르면 **S5 바텀시트**(DESIGN 6장 대표 움직임): 점포명, 구역, 취급 품목 칩, 영업시간, 오늘 추천. 닫기 버튼·바깥 누름·Esc로 닫힘, 포커스 가두기, 닫으면 누른 점포로 포커스 복귀
- **시장 선택**: Geolocation으로 가까운 순(거부·실패 시 목록 그대로), 하나 고르면 저장 후 이전 화면
- **S6 추천 (기본)**: 목적·받는 사람·예산·인원 칩 → `POST /recommend` → 품목 3개 + 이유 + 근거 출처 + "점포 보기"
- **M1·M2 (기본)**: M1 지도에서 내 점포 탭 → 취급 품목 칩 다중 선택 → 저장 / M2 품목 탭, 가격, 한 줄 소개(40자), 유효기간(기본 오늘 마감) → `POST /stores/{id}/picks`
- 헤더: 로고(`source/img/marketOn_Logo/B_올리브_피치_가로형.svg`, 다크는 `_다크.svg` — `frontend/public/brand/`로 복사해 사용, 이름은 영문으로 `logo-light.svg`·`logo-dark.svg`·`icon.svg`), 테마 전환(시스템/라이트/다크), 언어 선택(ko·en·zh·ja·vi)

## 3. API 층 (기획서 ⑦ 계약)
- `src/types/contract.ts`: 기획서 ⑦의 요청·응답 타입을 손으로 작성 (백엔드가 계약에 맞춰지면 `gen:types`로 교체 예정). `/price` 응답은 기획서 예시 필드 + 선택 필드 `by_market_type?: { traditional?: Stat; large_retail?: Stat }`, `this_market?: { price, name }`
  - `GET /markets/nearby?lat&lng`, `POST /recognize`(multipart), `GET /items/{item_id}?lang`, `GET /price?item_id&market_id&unit&seen_price`, `GET /markets/{market_id}/map?item_id`, `POST /recommend`, `POST /stores/{store_id}/picks`, `GET /items/search?q`(검색용, 기획서에 추가 제안)
- `src/api/client.ts`(fetch는 여기서만) + `src/api/*.ts`(엔드포인트별 함수)
- **모드 전환**: `VITE_API_MODE=mock|live` (기본 `mock`). mock이면 `src/api/mock/`의 함수가 같은 타입을 돌려줌 (200~400ms 지연, 가끔 실패시키는 옵션 `?fail=1` 쿼리로 오류 화면 확인)
- **가짜 데이터 규칙** (DESIGN 7장)
  - 품목: `item:green_onion`(대파), `item:onion`, `item:apple`, `item:pear`, `item:sweet_persimmon` — 백엔드 온톨로지 ID와 같게
  - 대파 확인 포인트 3개는 `data/ontology/items.yaml`의 criteria 문장 그대로
  - 가격: 대파 1kg 전통시장 평균 2,576원(15곳)·대형유통 2,451원(34곳), 2026-11-20 조사, 서울 — 출처 캡션 "aT 기간별 소매가격 · 2026-11-20 조사 · 샘플". 1단 = 0.8kg 환산
  - 시장: "시연 시장" 1곳 (실제 시장 이름 쓰지 않음), 구역 6개, 점포 24곳 이름은 `점포 A-01` 형식, 대파 파는 점포 3곳
  - 오늘 추천·추천 결과도 "샘플" 표시

## 4. 상태·hooks·utils
- `store/session.ts`: 현재 시장, 언어, 테마 (React context + `localStorage`, 모든 읽기·쓰기 try/catch)
- hooks: `useMarkets`, `useRecognize`, `useItem`, `usePrice`, `useMarketMap`, `useCamera`(파일 선택·미리보기 URL 정리), `useGeolocation` — 로딩·오류·데이터 상태 통일
- utils: `formatPrice`(천 단위 쉼표 + 원), `diffPct`, `formatDate`, `convertUnit`
- i18n: `t(key)` — ko 전체 작성, 나머지 언어는 키만(없으면 ko로 대체). `<html lang>` 갱신

## 5. 스타일
- `src/styles/tokens.css`: 팀 Design Tokens 4장 CSS 그대로 + DESIGN.md 글꼴·모서리 변수(`--radius-pill: 999px`, `--radius-card: 8px`)로 교체. `index.html`에 첫 렌더 전 테마 적용 인라인 스크립트(try/catch)와 `theme-color` meta 2개
- 글꼴: `main.tsx`에서 `@sun-typeface/suit/fonts/variable/woff2/SUIT-Variable.css`, `wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.css`, `@fontsource-variable/geist` import
- CSS는 컴포넌트별 CSS Modules 또는 하나의 `styles/app.css` (Tailwind 쓰지 않음 — 설치 불가). HEX 직접 쓰기 금지(토큰만, 구역 6색은 `constants/zones.ts`에서 CSS 변수로)
- DESIGN.md 8장 상태 표를 모든 버튼·칩·입력·체크박스에 구현. 포커스 링 항상 보이게
- 데스크톱에서는 가운데 480px 앱 프레임, 바깥은 `--color-bg`
- 5장 "하지 말 것"과 병수 기준 AI 티 목록(그라데이션, 이모지, 유리 블러, 장식 번호, 모든 요소 fade-in 등) 지키기

## 6. 테스트 (`vitest` + jsdom)
- `package.json`에 `"test": "vitest run"` 추가, `vite.config.ts`에 test 설정
- utils 단위: formatPrice, diffPct 부호, convertUnit(kg → 1단 0.8kg)
- mock api가 contract 타입 형태를 지키는지
- 화면: S3에서 가격 3500 입력 → "▼" 와 숫자 표시, 체크박스 토글, 판정 단어("신선","추천 구매","등급")가 렌더링된 텍스트에 없는지
- S4: `item=item:green_onion`이면 강조 점포 3개, 점포 클릭 → 바텀시트 열림, Esc → 닫힘
- 흐름: 홈 → 찍기(파일 선택 모킹) → S3 → 점포 보기 → 지도

## 하지 말 것
- 새 npm 패키지 설치, 백엔드 수정, `.env` 수정, 커밋
- 실제 시장 이름·상호명·사진 만들기, 판정 문구

## 자체 검수 항목
- [ ] `npm run build`, `npm run lint`, `npm run test` 모두 통과
- [ ] `grep -rn "fetch(" src` → `api/client.ts`만
- [ ] `grep -rniE "#[0-9a-f]{3,8}\b" src --include=*.tsx --include=*.ts` → `constants/zones.ts` 외 없음 (CSS 파일은 tokens.css만)
- [ ] 판정 단어 grep: `신선|추천 구매|등급|좋음|나쁨` → 체크리스트 안내 문구의 부정형("판정하지 않아요") 외 없음
- [ ] `npm run dev`는 Claude가 브라우저로 390px·1440px 스크린샷 확인 (샌드박스에서 포트가 막히면 생략)

## 보고 형식 (한국어)
만든·지운 파일 요약, 화면별 구현 상태, 검수 결과(명령 출력), DESIGN.md와 다르게 한 점, 남은 문제. 모든 검수가 끝난 뒤 한 번만.
