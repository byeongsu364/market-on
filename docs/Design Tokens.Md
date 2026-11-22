# Market-On · Design Tokens v1 (라이트 / 다크)

> **요약** — 색은 로고 **P5 올리브·피치** 5색(+로고 부제용 반투명 2색)만 써요. 개발에서는 원색 값을 직접 쓰지 않고 **시맨틱 토큰**(`--color-bg`, `--color-text` …)만 써요. 테마 전환은 `<html data-theme="dark">` 하나로 끝나요.
> 바로 붙여 넣는 코드는 **4장(CSS 변수)**, **5장(Tailwind)** 에 있어요. 기본은 기기 설정(`prefers-color-scheme`)을 따르고, 사용자가 고르면 그 값을 우선해요.
> 접근성: 본문 글자는 WCAG AA(4.5:1) 이상이 되도록 정했어요. 그래서 로고 부제의 반투명 색과 앱 보조 글자색은 **값이 달라요**(6장).
>
> 기준일 2026-11-22 · 출처: `로고/A_컬러맵/P5_올리브_피치_가로형.svg` · `_가로형_다크.svg` · `_아이콘.svg` (값 그대로 추출)
> 표시: **[확정]** 로고에서 그대로 가져온 값 · **[제안]** 앱 개발을 위해 추가한 값 (팀 검토 후 확정)

---

## 1. 원색 팔레트 [확정]

| 이름 | HEX | 역할 |
|---|---|---|
| Olive 올리브 | `#3A5F2B` | 브랜드 기본색 (아이콘 판, 다크 배경) |
| Olive Deep 진올리브 | `#2F4A23` | 글자 (워드마크 "Market") |
| Peach 피치 | `#FF9F7A` | 강조 면, 다크 모드 강조 글자 |
| Peach Deep 진피치 | `#D9643C` | 라이트 모드 강조 글자 (워드마크 "On") |
| Cream 크림 | `#FFF8F1` | 라이트 배경, 다크 글자 |

로고 부제 전용: `#2F4A23A6`(진올리브 65%, 라이트) · `#FFF8F1B3`(크림 70%, 다크) — **로고에만** 써요.

---

## 2. 시맨틱 토큰 (라이트 / 다크)

| 토큰 | CSS 변수 | 라이트 | 다크 | 로고에서 쓰인 곳 | 앱에서 쓰는 곳 | 구분 |
|---|---|---|---|---|---|---|
| 배경 | `--color-bg` | `#FFF8F1` 크림 | `#3A5F2B` 올리브 | 다크 로고 배경 | 앱 전체 배경 | 확정 |
| 카드 | `--color-card` | `#FFFFFF` | `#2F4A23` 진올리브 | — | 결과 카드, 바텀시트, 점포 상세 | 제안 |
| 버튼·아이콘 판 | `--color-surface` | `#3A5F2B` 올리브 | `#FFF8F1` 크림 | 아이콘 둥근 사각형 | 주요 버튼, 헤더, 하단 탭 선택 | 확정 |
| 판 위 요소 | `--color-on-surface` | `#FFF8F1` 크림 | `#3A5F2B` 올리브 | 아이콘 차양·렌즈 테두리 | 주요 버튼 위 글자·아이콘 | 확정 |
| 본문 글자 | `--color-text` | `#2F4A23` 진올리브 | `#FFF8F1` 크림 | 워드마크 "Market" | 제목, 본문 | 확정 |
| 보조 글자 | `--color-text-secondary` | `#596D4C` | `#D8D9C9` | (부제는 반투명 원본 사용) | 출처·날짜·조사지역, 안내 문구 | 제안 |
| 강조 글자 | `--color-accent-text` | `#D9643C` 진피치 | `#FF9F7A` 피치 | 워드마크 "On" | 가격 ±%, 강조 숫자 (18px 이상 굵게) | 확정 |
| 강조 면 | `--color-accent` | `#FF9F7A` 피치 | `#FF9F7A` 피치 | 차양 줄무늬, 체크 표시 | 배지, 지도 강조 점포, 체크박스 선택 | 확정 |
| 강조 면 위 글자 | `--color-on-accent` | `#2F4A23` 진올리브 | `#2F4A23` 진올리브 | — | 배지 글자, "오늘 추천" 라벨 | 제안 |
| 구분선 | `--color-border` | `#2F4A231F` (12%) | `#FFF8F129` (16%) | — | 카드 테두리, 리스트 구분선 | 제안 |
| 포커스 링 | `--color-focus` | `#D9643C` | `#FF9F7A` | — | 키보드·스크린리더 포커스 | 제안 |

- `보조 글자`를 로고처럼 반투명(65%/70%)으로 쓰면 대비가 3.6:1 / 4.4:1로 AA에 못 미쳐요. 그래서 같은 색 계열을 **80% 농도로 섞은 단색**으로 정했어요.
- 지도 구역 6색(청과·채소·수산·정육·반찬·떡/분식)은 **[확인 필요]** 이 팔레트와 겹치지 않는 별도 세트로 정해요. 강조 점포는 구역 색과 상관없이 항상 `--color-accent` + 굵은 테두리로 보여 줘요.

---

## 3. 테마 전환 규칙

1. 처음 접속하면 기기 설정(`prefers-color-scheme`)을 따라요.
2. 사용자가 설정에서 고르면 `localStorage('theme')`에 저장하고 `<html data-theme="light|dark">`를 붙여요.
3. 컴포넌트는 `var(--color-*)` 또는 Tailwind 시맨틱 클래스(`bg-bg`, `text-text`)만 써요. **HEX를 직접 쓰지 않아요.**
4. 이미지·로고는 테마에 맞는 파일로 바꿔요 (7장).
5. 시장 현장(햇빛 아래)을 고려해 **기본 추천은 라이트**예요. 다크는 저녁 장보기·외국인 투어 시연에서 보여 줘요.

---

## 4. CSS 변수 (붙여 넣기용)

```css
/* tokens.css */
:root,
[data-theme="light"] {
  /* palette */
  --olive: #3A5F2B;
  --olive-deep: #2F4A23;
  --peach: #FF9F7A;
  --peach-deep: #D9643C;
  --cream: #FFF8F1;

  /* semantic */
  --color-bg: var(--cream);
  --color-card: #FFFFFF;
  --color-surface: var(--olive);
  --color-on-surface: var(--cream);
  --color-text: var(--olive-deep);
  --color-text-secondary: #596D4C;
  --color-accent-text: var(--peach-deep);
  --color-accent: var(--peach);
  --color-on-accent: var(--olive-deep);
  --color-border: #2F4A231F;
  --color-focus: var(--peach-deep);

  /* type & shape */
  --font-sans: "Noto Sans KR", system-ui, sans-serif;
  --radius-card: 16px;
  --radius-button: 12px;
  --radius-icon: 24%;
  color-scheme: light;
}

[data-theme="dark"] {
  --color-bg: var(--olive);
  --color-card: var(--olive-deep);
  --color-surface: var(--cream);
  --color-on-surface: var(--olive);
  --color-text: var(--cream);
  --color-text-secondary: #D8D9C9;
  --color-accent-text: var(--peach);
  --color-accent: var(--peach);
  --color-on-accent: var(--olive-deep);
  --color-border: #FFF8F129;
  --color-focus: var(--peach);
  color-scheme: dark;
}

/* 사용자가 직접 고르지 않았을 때 기기 설정을 따름 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-bg: var(--olive);
    --color-card: var(--olive-deep);
    --color-surface: var(--cream);
    --color-on-surface: var(--olive);
    --color-text: var(--cream);
    --color-text-secondary: #D8D9C9;
    --color-accent-text: var(--peach);
    --color-border: #FFF8F129;
    --color-focus: var(--peach);
    color-scheme: dark;
  }
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
}
```

```js
// theme.js — 테마 적용 (첫 렌더 전에 실행해 깜빡임 방지)
const saved = localStorage.getItem("theme"); // "light" | "dark" | null
if (saved) document.documentElement.dataset.theme = saved;

export function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  localStorage.setItem("theme", mode);
}
```

---

## 5. Tailwind 설정 (붙여 넣기용)

```js
// tailwind.config.js
export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        card: "var(--color-card)",
        surface: "var(--color-surface)",
        "on-surface": "var(--color-on-surface)",
        text: "var(--color-text)",
        "text-secondary": "var(--color-text-secondary)",
        "accent-text": "var(--color-accent-text)",
        accent: "var(--color-accent)",
        "on-accent": "var(--color-on-accent)",
        border: "var(--color-border)",
        focus: "var(--color-focus)",
      },
      fontFamily: { sans: ["Noto Sans KR", "system-ui", "sans-serif"] },
      borderRadius: { card: "16px", button: "12px" },
    },
  },
};
```

색이 CSS 변수로 바뀌므로 `dark:` 접두사를 컴포넌트마다 붙일 필요가 없어요. `bg-surface text-on-surface` 하나로 두 모드가 다 맞아요.

---

## 6. 사용 규칙

| # | 규칙 | 이유 |
|---|---|---|
| 1 | 피치(`#FF9F7A`)는 **라이트 모드에서 글자로 쓰지 않아요** | 크림 위 1.9:1 |
| 2 | 강조 글자(`accent-text`)는 **18px 이상 굵게**만 써요 | 라이트 3.4:1, 다크 3.7:1 → 큰 글자 기준(3:1)만 통과 |
| 3 | 작은 글자(출처·날짜)는 `text-secondary`를 써요 | 라이트 5.4:1, 다크 5.2:1 |
| 4 | 피치 면 위 글자는 진올리브(`on-accent`)로 써요 | 4.9:1 |
| 5 | 한 화면에서 피치 강조는 **2곳 이하** | 강조가 많으면 아무것도 강조되지 않음 |
| 6 | 가격 비교는 색만으로 구분하지 않고 **▼ / ▲ + 숫자**로 함께 보여 줘요 | 색약 사용자, "싸다/비싸다" 판정 대신 사실만 표시 |
| 7 | 신선도·추천 같은 판정 색(초록=좋음, 빨강=나쁨)은 쓰지 않아요 | "소비자가 판단한다" 원칙 |

### 대비표 (WCAG)

| 조합 | 라이트 | 다크 | 판정 |
|---|---|---|---|
| 본문 글자 / 배경 | 9.4:1 | 7.0:1 | AA 통과 |
| 본문 글자 / 카드 | 9.9:1 | 9.4:1 | AA 통과 |
| 보조 글자 / 배경 | 5.4:1 | 5.2:1 | AA 통과 |
| 판 위 요소 / 버튼 판 | 7.0:1 | 7.0:1 | AA 통과 |
| 강조 글자 / 배경 | 3.4:1 | 3.7:1 | 큰 글자만 |
| 강조 면 위 글자 (진올리브 / 피치) | 4.9:1 | 4.9:1 | AA 통과 |
| 피치 / 크림 | 1.9:1 | — | 글자 금지 |

---

## 7. 컴포넌트 매핑

| 컴포넌트 | 배경 | 글자·아이콘 | 테두리 | 화면 |
|---|---|---|---|---|
| 주요 버튼 (찍기, 확인) | `surface` | `on-surface` | — | S1·S2·S3 |
| 보조 버튼 | `transparent` | `text` | `border` | 전 화면 |
| 칩 (선택 전 / 후) | `card` / `surface` | `text` / `on-surface` | `border` / — | S2·S6·M1 |
| 카드 | `card` | `text` | `border` | S3·S5 |
| 확인 포인트 체크박스 (선택) | `accent` | `on-accent` (체크) | — | S3 |
| 가격 ±% | — | `accent-text` (굵게 20px) | — | S1·S3 |
| 출처·날짜 캡션 | — | `text-secondary` (12px) | — | 전 화면 |
| 배지 "오늘 추천" | `accent` | `on-accent` | — | S1·S5 |
| 지도 강조 점포 | `accent` | `on-accent` | 2px `text` | S4 |
| 하단 탭 (선택 / 기본) | `bg` | `text` / `text-secondary` | 상단 `border` | 전 화면 |

---

## 8. 로고 파일 사용

| 상황 | 파일 |
|---|---|
| 라이트 헤더·발표 자료 흰 배경 | `P5_올리브_피치_가로형.svg` |
| 다크 헤더·발표 자료 어두운 배경 | `P5_올리브_피치_가로형_다크.svg` |
| PWA 앱 아이콘·파비콘·스플래시 | `P5_올리브_피치_아이콘.svg` (512×512, 두 모드 공통) |

- PWA `manifest.json`: `"theme_color": "#3A5F2B"`, `"background_color": "#FFF8F1"`
- `<meta name="theme-color" content="#FFF8F1" media="(prefers-color-scheme: light)">` / `content="#3A5F2B" media="(prefers-color-scheme: dark)"`

---

## 9. 단점을 장점으로 바꾸는 전략

| 단점 | 장점으로 바꾸는 표현 | 적용 가능성 |
|---|---|---|
| 피치가 밝아 글자로 못 씀 | "로고 색을 그대로 쓰되 **명암비 기준으로 글자색을 따로 정한 접근성 설계**" | **7/10** |
| 다크 모드까지 만들면 작업량이 늘어남 | "색을 토큰으로 묶어 **`data-theme` 한 줄로 전환**돼요. 컴포넌트는 손대지 않아요" | **8/10** |
| 색 수가 적음 (5색) | "5색만으로 화면을 만들어 **시장 현장에서도 한눈에 읽히는 단순한 화면**" | **7/10** |
| 판정 색(초록·빨강)을 쓰지 않아 정보가 약해 보임 | "색으로 판정하지 않는 것도 **'소비자가 판단한다' 원칙의 일부**예요" | **8/10** |

---

## 10. 루브릭 (디자인 시스템 기준)

| 기준 | 배점 | 점수 | 근거 |
|---|---|---|---|
| 창의성 | 20 | 15 | 시장 차양·렌즈 모티프 로고와 앱 색이 하나로 이어짐 |
| 기술성 | 20 | 17 | 시맨틱 토큰 + CSS 변수 + Tailwind, 테마 전환 한 줄 |
| 완성도 | 30 | 25 | 두 모드 모두 AA 대비 확인, 컴포넌트 매핑까지 정리 |
| 활용성 | 20 | 16 | 발표 자료·홍보물·앱이 같은 토큰을 씀 |
| 발표·협업 | 10 | 8 | 팀원 모두 같은 변수 이름으로 개발 |
| **합계** | **100** | **81** | 보완: 지도 구역 6색 확정, 실제 기기(햇빛 아래)에서 라이트 화면 확인 |

### 남은 할 일
- [ ] 지도 구역 6색 세트 확정 (팔레트와 구분되고 색약에서도 구분되는 조합)
- [ ] 프론트엔드 초안 색을 이 토큰으로 교체 (#16301F·#E8743B·#F7F5EE 폐기)
- [ ] **[제안]** 값(카드·보조 글자·구분선·포커스) 팀 검토 후 확정
- [ ] 대회 당일 `tokens.css`·`tailwind.config.js`는 위 코드를 보고 **현장에서 새로 작성** (서약서 1항: 사전 코드 제출 금지)