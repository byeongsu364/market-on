# 작업 지시서 015 · [1-4] 사진 한 장 인식(품목+가격) · 가격 제보 저장 · 시장 자동 선택

- 담당: Codex · 지시: Claude · 2026-11-24 · 승인: 병수 (1-4 a·b·c)
- 설계: **`docs/design/07-pull-growth.md` 1·2장** (소비자 흐름, 손님 가격 제보, 가격표 없으면 그냥 넘어감)
- 기존: `POST /recognize`(014·014b), `price_reports` 테이블(0006), `GET /markets/nearby`(012)
- 범위: `backend/`만. **프론트 계약 타입(`contract.ts`)은 1-5에서 아래 3장 모양으로 맞출 예정** — 백엔드는 3장 모양을 정답으로. 패키지 추가 금지

## 1-4a · 사진 한 장으로 품목 + 가격표
- Gemma 호출은 **한 번**. `prompts/recognize.txt`를 확장해 `{"labels": [...], "price_tag": {...} | null}` 을 받음
  - 프롬프트 추가 문장: "사진에 가격표·가격 표시가 보이면 그 상품의 가격을 읽어 `price_tag`에 넣으세요: `price`(원, 숫자만 — '5천원'은 5000), `unit_text`(가격표에 적힌 단위 그대로, 예: '1단', '3개', '1kg', '한 바구니'), `quantity`(숫자로 읽히면, 아니면 null). **가격이 안 보이거나 확실하지 않으면 `price_tag`는 null.** 추측하지 마세요."
  - 여러 가격이 보이면 **사진 가운데 상품의 가격 하나만**
- `unit_text` → 단위 엔터티 매칭: 단위 라벨(ko·en)에서 숫자 뺀 단어로 (`1단`→`unit:bunch`, `3개`→`unit:piece` + quantity 3, `1kg`→`unit:kg`). 못 찾으면 `unit: null`
- 검증: `price`가 10원 미만·1천만 원 초과면 null 처리 (오인식 방지)
- JSON 파싱 실패 재요청은 기존 헬퍼 그대로. `price_tag` 형식만 틀리면 labels는 살리고 `price_tag: null`
- 응답에 `media_id`(저장한 사진 id, 저장 실패면 null) 추가

## 1-4b · 손님 가격 제보 `POST /price-reports`
- 요청: `{item_id, market_id, store_id?, unit?, quantity?, price, method: "price_tag_photo"|"manual", media_id?}`
- 헤더: `X-Requested-With: market-on` 필수 (기존 CSRF 규칙), **`X-Device-Id`** 필수 (프론트가 만든 무작위 UUID)
- 저장: `price_reports` + **`device_hash` = sha256(X-Device-Id + 서버 비밀값)** — 원본 기기 ID는 저장하지 않음. 서버 비밀값 `settings.DEVICE_HASH_SALT` (기본: 서버 시작 시 무작위가 아니라 **필수 설정 없으면 개발용 고정값 + 경고 로그**)
- 검증: 품목(type item)·시장 존재, `store_id`는 그 시장 점포, `unit`은 단위 엔터티, `media_id`는 photo, 가격 10원~1천만 원, `method=price_tag_photo`면 `media_id` 필수
- 중복·남용 방지:
  - 같은 기기·품목·점포(없으면 시장) **10분 안 재제출 → 새 행 대신 마지막 행 갱신**
  - 같은 기기 **1시간 30건 초과 → `429 TOO_MANY_REPORTS`**
- 응답 `201 {id, updated: bool}`
- 로그인 불필요 (손님은 가입 없음), 개인정보 저장 없음
- 이번 작업은 **저장만**. 점포별 가격 집계·표시는 다음 작업(P-3)

## 1-4c · 시장 자동 선택용 거리
- `GET /markets/nearby?lat=&lng=` 응답 각 시장에 `distance_m`(정수, 좌표 없으면 null) 추가, 거리순 유지
- 프론트는 가장 가까운 시장이 **1km 이내면 자동 선택**, 아니면 목록 (프론트 규칙 — 백엔드는 거리만)

## 2. 마이그레이션 `0009_price_reports_device.sql`
- `price_reports`에 `device_hash text not null default ''`(기존 행 대비), `quantity` 이미 있으면 그대로
- 인덱스: `(market_id, item_id, reported_at desc)`, `(device_hash, reported_at desc)`
- 0001~0008 수정 금지

## 3. 계약 변경 (1-5에서 프론트 `contract.ts`에 반영)
```ts
type RecognizeResponse = {
  vision_labels: string[];
  candidates: { item_id: string; name: string; confidence: number }[];
  media_id: string | null;
  price_tag: { price: number; unit_text: string; unit: string | null; quantity: number | null } | null;
};
type Market = { market_id: string; name: string; lat: number; lng: number; distance_m: number | null };
type PriceReportRequest = {
  item_id: string; market_id: string; store_id?: string; unit?: string; quantity?: number;
  price: number; method: 'price_tag_photo' | 'manual'; media_id?: string;
};
type PriceReportResponse = { id: number; updated: boolean };
```

## 테스트 (LLM monkeypatch)
- 가격표 있음: `{"labels":["green onion"],"price_tag":{"price":3000,"unit_text":"1단","quantity":1}}` → 후보 대파 + price_tag unit `unit:bunch`
- 가격표 없음(`null`)·형식 틀림 → labels 유지, price_tag null
- '5천원' 같은 응답 숫자 처리는 모델이 하므로, 문자열 price가 오면 숫자 변환 시도 후 실패 시 null
- 가격 범위 밖 → null
- `/price-reports`: 정상 201, 10분 재제출 → updated true, 30건 초과 429, 헤더 없음 403/422, 다른 시장 점포 422, photo인데 media 없음 422, DB에 기기 ID 원문 없음
- `/markets/nearby` distance_m
- 계약 키 테스트 (위 3장 모양)

## 하지 말 것
- `frontend/`, `.env` 수정(새 설정은 보고에 적기), 0001~0008 수정, 커밋, 패키지 추가, 점포별 가격 집계

## 자체 검수
- [ ] `TEST_DATABASE_URL=postgresql://localhost:5432/marketon_test pytest` (DB가 막히면 보고 — Claude가 검증)
- [ ] LLM은 `llm/`, SQL은 `db/`, `ruff format`

## 보고 (한국어, 한 번)
변경 파일, `.env.example` 추가 변수, 계약과 다른 점, 검수 결과, 남은 문제
