# Market-On · Design Tokens v2 (라이트 / 다크)

> **2026-11-26 바꿈** · 지시서 [030](./tasks/030-frontend-integration.md) · 이유: 화면 시안 52개와 함께 정한 Market-On 디자인 시스템(흰 바탕, 검은 글자, 켜진 것 하나만 주황)으로 바꿨어요. v1의 올리브·피치 팔레트(`--olive`, `--peach`, `--cream` 계열)는 없앴어요. 팀 승인은 **[확인 필요]**.
> 값의 출처: 디자인 시스템 `tokens.json`(https://claude.ai/artifact/L1V5Jh6ykC828Qkox5KdTx). 코드는 `frontend/src/styles/tokens.css`.
> 테마 전환은 지금처럼 `<html data-theme="dark">` 하나. 기본은 기기 설정을 따라요. 다크 화면 다듬기는 이번 범위가 아니에요(값만 둠).

## 1. 원칙

- 흰 바탕(`canvas`)에 검은 글자(`ink`, `body`). 화면에서 색을 내는 것은 품목 그림과 지도 핀뿐이에요.
- 주요(검정) 버튼은 한 화면에 하나. 나머지는 테두리 없는 옅은 면(`surface-strong`).
- 주황(`signal`)은 켜진 것 하나에만: 가격 눈금의 켜진 칸, 마감세일 점, 로고의 켜진 칸.
- 좋고 나쁨을 초록·빨강으로 칠하지 않아요. 가격 차이는 ▲▼와 숫자를 `signal-text` 한 색으로.

## 2. 예전 변수 이름과 새 토큰

컴포넌트가 쓰던 변수 이름은 그대로 두고 값만 바꿨어요.

| 예전 변수 | 새 토큰 |
| --- | --- |
| `--color-bg` | `canvas` |
| `--color-card` | `surface-card` |
| `--color-surface`, `--color-on-surface` | `primary`, `on-primary` |
| `--color-text` | `ink` |
| `--color-text-secondary` | `body` |
| `--color-accent`, `--color-on-accent` | `signal`, `on-signal` |
| `--color-accent-text` | `signal-text` |
| `--color-border` | `hairline-strong` (입력창·체크박스는 `control-border`) |
| `--color-focus` | `ink` |
| `--radius-button` | `radius-lg` |
| `--radius-card` | `radius-xl` |
| `--font-sans`, `--font-heading` | `sans` 하나(Pretendard Variable) |

## 3. 색

| 토큰 | CSS 변수 | 라이트 | 다크 | 쓰는 곳 |
| --- | --- | --- | --- | --- |
| `canvas` | `--color-canvas` | `#ffffff` | `#111113` | 페이지 바탕. 앱 화면과 랜딩 모두 여기서 시작한다. |
| `canvas-soft` | `--color-canvas-soft` | `#fafafa` | `#161618` | 번갈아 깔리는 띠, 지도 바깥 면. |
| `surface-card` | `--color-surface-card` | `#ffffff` | `#19191b` | 카드, 바텀시트, 입력창 바탕. 1px hairline-strong 테두리와 함께 쓴다. |
| `surface-strong` | `--color-surface-strong` | `#f4f4f6` | `#232326` | 보조 버튼, 칩, 꼬리표, 묶음 면, 사진 자리 면. 테두리 없이 면으로만 구분한다. |
| `surface-dark` | `--color-surface-dark` | `#171717` | `#26262a` | 판단 카드(공유 이미지), 점포 QR 면, 강조 카드. 글자는 on-dark. |
| `hairline` | `--color-hairline` | `#ebecef` | `#232326` | 목록 구분선. 장식용 선이며 컨트롤 테두리로 쓰지 않는다. |
| `hairline-strong` | `--color-hairline-strong` | `#dcdee0` | `#34343a` | 흰 바탕 위 외곽선 버튼의 1px 안쪽 선, 바텀시트 손잡이. 장식용 선이며 입력창 테두리로 쓰지 않는다. |
| `control-border` | `--color-control-border` | `#8b8d93` | `#6e7178` | 입력창, 체크박스, 라디오 테두리. canvas와 surface-card 위에서 3:1 이상. 버튼과 칩에는 쓰지 않는다. |
| `ink` | `--color-ink` | `#171717` | `#ededed` | 제목, 품목명, 가격 숫자, 강조 본문. canvas, canvas-soft, surface-card, surface-strong, signal-soft 위. 포커스 링도 이 색 2px. |
| `body` | `--color-body` | `#60646c` | `#b0b4ba` | 기본 본문. canvas, canvas-soft, surface-card, surface-strong 위. |
| `muted` | `--color-muted` | `#6b6f77` | `#8b8f97` | 출처, 조사일, 꼬리표 글자. canvas, surface-card, surface-strong 위에서 4.5:1 이상. |
| `primary` | `--color-primary` | `#000000` | `#ffffff` | 주요 버튼 채움. 한 화면에 하나(찍기, 길 안내 시작). |
| `primary-active` | `--color-primary-active` | `#1a1a1a` | `#e6e6e6` | 주요 버튼을 누른 상태. |
| `on-primary` | `--color-on-primary` | `#ffffff` | `#171717` | primary 위의 글자와 아이콘. |
| `on-dark` | `--color-on-dark` | `#ffffff` | `#ffffff` | surface-dark 위의 글자. |
| `on-dark-soft` | `--color-on-dark-soft` | `#b0b4ba` | `#b0b4ba` | surface-dark 위의 보조 글자(출처, 날짜). |
| `signal` | `--color-signal` | `#f2622e` | `#ff8a5b` | 켜진 것 하나를 가리키는 색: 로고의 켜진 칸, 가격 눈금의 켜진 칸, 마감세일 점. 면과 표시에만 쓰고 본문 글자로 쓰지 않는다. canvas 위에서 3:1 이상. |
| `signal-text` | `--color-signal-text` | `#c2410c` | `#ff9f7a` | 가격 ±% 숫자와 강조 숫자. canvas, surface-card, signal-soft 위에서 4.5:1 이상. |
| `on-signal` | `--color-on-signal` | `#171717` | `#171717` | signal 면 위의 글자. 흰색을 쓰지 않는다. |
| `signal-soft` | `--color-signal-soft` | `#fff1ea` | `#2b1a13` | 강조된 점포, 한 줄 요약 뒤의 옅은 면. 글자는 ink 또는 signal-text. |
| `wash-light` | `--color-wash-light` | `#fff6ef` | `#2a1c15` | 랜딩과 포스터 머리 부분의 번짐, 밝은 쪽. 앱 화면에는 쓰지 않는다. |
| `wash-mid` | `--color-wash-mid` | `#ffe6d3` | `#4a2c1c` | 랜딩과 포스터 머리 부분의 번짐, 짙은 쪽. 동작 색이 아니다. |
| `link` | `--color-link` | `#0d74ce` | `#70b8ff` | 긴 글 속 링크. canvas와 surface-card 위. 버튼에는 쓰지 않는다. |
| `danger` | `--color-danger` | `#b42318` | `#ff9a8f` | 입력 오류 문장과 테두리. 항상 문장과 함께 쓴다. 가격이 높다는 뜻으로 쓰지 않는다. |
| `gauge-off` | `--color-gauge-off` | `#e6e7eb` | `#34343a` | 가격 눈금의 꺼진 칸. 켜진 칸은 signal. |
| `gauge-off-dark` | `--color-gauge-off-dark` | `#34343a` | `#34343a` | surface-dark 면 위 가격 눈금의 꺼진 칸(판단 카드). |
| `pin-produce` | `--pin-produce` | `#1f9d55` | `#1f9d55` | 시장 안 지도의 채소·과일 점포 핀. 핀 안 사과 아이콘은 on-pin. |
| `pin-dried` | `--pin-dried` | `#b7791f` | `#b7791f` | 건어물·젓갈 점포 핀. 핀 안 단지 아이콘은 on-pin. |
| `pin-seafood` | `--pin-seafood` | `#2477e0` | `#2477e0` | 수산 점포 핀. 핀 안 생선 아이콘은 on-pin. |
| `pin-side` | `--pin-side` | `#8a56d6` | `#8a56d6` | 반찬 점포 핀. 핀 안 그릇 아이콘은 on-pin. |
| `pin-meat` | `--pin-meat` | `#e0484e` | `#e0484e` | 정육 점포 핀. 핀 안 고기 아이콘은 on-pin. 가격이 높다는 뜻으로 쓰지 않는다. |
| `pin-ricecake` | `--pin-ricecake` | `#d2488f` | `#d2488f` | 떡 점포 핀. 핀 안 꼬치떡 아이콘은 on-pin. |
| `on-pin` | `--color-on-pin` | `#ffffff` | `#ffffff` | 핀 색 여섯 가지 위의 아이콘과 2px 테두리. 여섯 색 모두에서 3:1 이상(아이콘 기준). 핀 색 위에 글자는 쓰지 않는다. |
| `zone-0` | `--color-zone-0` | `#c9b458` | `#c9b458` | 지도 구역 면, 청과. 20% 농도 면으로만 쓰고 글자색으로 쓰지 않는다. |
| `zone-1` | `--color-zone-1` | `#7fa36b` | `#7fa36b` | 지도 구역 면, 채소. 20% 농도 면으로만. |
| `zone-2` | `--color-zone-2` | `#6e9bb0` | `#6e9bb0` | 지도 구역 면, 수산. 20% 농도 면으로만. |
| `zone-3` | `--color-zone-3` | `#b07a6e` | `#b07a6e` | 지도 구역 면, 정육. 20% 농도 면으로만. |
| `zone-4` | `--color-zone-4` | `#a08bb0` | `#a08bb0` | 지도 구역 면, 반찬. 20% 농도 면으로만. |
| `zone-5` | `--color-zone-5` | `#c4a484` | `#c4a484` | 지도 구역 면, 떡·분식. 20% 농도 면으로만. |

## 4. 글자 (Pretendard Variable 한 가족, 숫자는 `tabular-nums`)

| 이름 | 크기 | 굵기 | 행간 | 자간 | 쓰는 곳 |
| --- | --- | --- | --- | --- | --- |
| `display-xl` | 48px | 600 | 1.1 | -1.44px | 랜딩과 포스터의 머리글. |
| `display-lg` | 30px | 600 | 1.2 | -1px | 결과 화면의 결론 한 줄. |
| `display-md` | 26px | 600 | 1.25 | -0.7px | 앱 화면 제목. |
| `display-sm` | 19px | 600 | 1.35 | -0.4px | 화면 안 묶음 제목, 바텀시트 제목. |
| `price-xl` | 40px | 700 | 1.05 | -1.2px | 가격표의 가격, 기준시세 대비 ±%. tabular-nums와 함께. |
| `price-md` | 24px | 700 | 1.15 | -0.6px | 목록 안의 가격, 점포별 가격. tabular-nums와 함께. |
| `title-md` | 18px | 600 | 1.4 | 0 | 컴포넌트 제목, 가격표의 품목명. |
| `title-sm` | 16px | 600 | 1.4 | 0 | 목록 라벨, 점포 이름. |
| `body-md` | 16px | 400 | 1.5 | 0 | 기본 본문. |
| `body-sm` | 14px | 400 | 1.5 | 0 | 보조 본문, 단위, 안내 문장. |
| `caption` | 13px | 400 | 1.4 | 0 | 출처, 조사일, 꼬리표. |
| `label` | 11px | 600 | 1.4 | 0.88px | 배지, 섹션 라벨. |
| `button` | 16px | 600 | 1 | 0 | 버튼 글자. |
| `code` | 13px | 400 | 1.5 | 0 | 점포 번호, 코드, 개발 문서의 코드 조각. |

## 5. 간격·모서리·그림자

간격(4px 단위): `space-1` 4px · `space-2` 8px · `space-3` 12px · `space-4` 16px · `space-5` 20px · `space-6` 24px · `space-8` 32px · `space-12` 48px · `space-24` 96px

| 변수 | 값 | 쓰는 곳 |
| --- | --- | --- |
| `--radius-xs` | 6px | 꼬리표, 지도 출처 표시. |
| `--radius-sm` | 10px | 작은 버튼(높이 38px). |
| `--radius-md` | 12px | 입력창, 중간 버튼(높이 48px). |
| `--radius-lg` | 14px | 큰 버튼(높이 54px), 품목 그림 판. |
| `--radius-xl` | 20px | 묶음 면, 선택된 점포 카드, 판단 카드. |
| `--radius-xxl` | 24px | 바텀시트 위 모서리. |
| `--radius-pill` | 9999px | 칩, 지도 위 시장 이름표, 토글, 가격 눈금 칸의 아래쪽. |

| 변수 | 값 | 쓰는 곳 |
| --- | --- | --- |
| `--shadow-soft` | `0 1px 2px rgba(0, 0, 0, 0.06), 0 6px 16px rgba(0, 0, 0, 0.10)` | 지도 위에 뜬 검색창, 칩, 둥근 버튼. |
| `--shadow-sheet` | `0 -2px 20px rgba(0, 0, 0, 0.10)` | 바텀시트. |

## 6. 가격 눈금

네 칸(많이 낮음, 살 만함, 조금 높음, 높음) 가운데 한 칸만 `signal`로 켜요. 구간은 화면에 보이는 `diff_pct`(반올림한 정수)로 정하고 문구는 코드(`frontend/src/utils/priceBand.ts`)가 골라요.

| 기준시세 대비 | 칸 | 문구 |
| --- | --- | --- |
| 30% 넘게 낮음 | 1 | 많이 낮아요, 상태를 꼭 확인하세요 |
| 30% 낮음 ~ 5% 높음 | 2 | 살 만한 가격이에요 |
| 5% 초과 ~ 20% 이하 높음 | 3 | 시세보다 조금 높아요 |
| 20% 넘게 높음 | 4 | 시세보다 높은 편이에요 |
| 기준시세 없음·대체값 | 모두 끔 | 비교는 참고만 하세요 |
