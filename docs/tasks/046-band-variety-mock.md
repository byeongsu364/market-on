# 작업 지시서 046 · 가격 띠 중립 문구, 가격 없을 때 품종 전달, 세부 품종 예시 시세

- 담당: Codex · 지시: Claude · 2026-11-27 · 승인: 병수 ("가격 띠 이름은 구매 추천 금지 원칙을 지켜", "가격을 못 읽어도 품종은 넘기기", "세부 품목 목데이터 — 귤을 찍었을 때 귤 세부 품목 가격으로, 사과처럼")
- 범위: `frontend/`, `backend/`, `data/ontology/items.yaml`. 패키지 추가 금지

## 1. 가격 띠 문구 (원칙: AI·서비스가 "사라/살 만하다"를 말하지 않음, 숫자 비교만)
- `utils/priceBand.ts`
  - `BAND_LABELS`: `['기준보다 많이 낮음', '기준과 비슷', '기준보다 조금 높음', '기준보다 높음']`
  - `BAND_MESSAGES`: 1 "기준시세보다 많이 낮아요 · 상태를 함께 확인해 보세요" / 2 "기준시세와 비슷해요" / 3 "기준시세보다 조금 높아요" / 4 "기준시세보다 높아요"
- `ko.json`의 `meHeroTitle` "살 만한 가격인지…" → "기준시세와 비교해 보고, 시장에서 바로 확인해요"
- 판단 카드·Variety·Result·목록 눈금 등 이 문구를 쓰는 모든 곳, 테스트 기대값. `grep -rn "살 만" frontend/src` 결과 0개
- 구간 경계(-30% / +5% / +20%)는 그대로

## 2. 가격을 못 읽어도 품종은 넘기기 (040 후속)
- `backend/app/services/price_tag.py`·`scan_service.recognize`: OCR 글자에서 가격을 못 읽어도 품종 글자가 맞으면 응답에 `variety_id`(및 `variety_text`)를 넘김
  - 응답 모양: `price_tag`는 지금처럼 가격이 있을 때만, 그 밖에 최상위 `variety_id: str | null` 추가(가격이 있을 때도 같은 값)
- 화면(ScanConfirm·Result): `price_tag`가 없어도 `variety_id`가 오면 그 품종을 기본 선택("가격표에 '부사'라고 적혀 있어 후지로 골랐어요" 문구 그대로)
- 계약·mock 갱신

## 3. 세부 품종 예시 시세 (mock — 실제 조사값 아님을 분명히)
- 실제 aT 조사 품종은 사과 3개, 나머지 품목 1개씩뿐 → **예시 품종**을 추가하되 이름은 **근거 문서에 나온 것만**:
  - 귤: `온주밀감`(기존 노지와 별개로 두지 말고 노지 품종의 다른 이름 라벨로 추가) — 귤은 aT 품종(노지·시설)에 예시 시세를 채움(시설은 지금 조사값 없음)
  - 배: `녹수`, `한아름`, `만풍배` (data/rag_docs/pear/varieties.md)
  - 단감: `감풍`, `로망`, `조완` (sweet_persimmon/varieties.md)
  - 양파: `장일황`, `고랭지 여름양파` (onion/varieties.md)
  - 대파: `한지형`, `난지형` (green_onion/varieties.md)
- 온톨로지: 예시 품종 엔터티 `attrs: {mock: true}`, kamis 없음, `hasGrade` 관계는 기본 품종이 아님(`default` 없음). 출처는 이름이 나온 근거 문서의 source 키(`source:`)
- 예시 시세: `backend/scripts/seed_mock_varieties.py`
  - 기본 품종의 최근 aT 시세(같은 지역·시장·날짜·단위)에 품종별 고정 배수(예: 0.85~1.25, 코드 상수, 주석 "예시 값")를 곱해 `price_observations`에 `source='mock'`으로 최근 35일치 행 생성 (시설 귤은 노지 귤 기준)
  - `--remove`로 `source='mock'` 행 전부 삭제. 기본 실행은 개발용 DB에만 (Claude가 실행)
- API: `/prices`의 `varieties[]`와 응답 최상위에 `mock: bool`(그 품종 시세가 예시인지), 출처 문구 `source`는 예시면 "예시 시세 · 실제 조사값 아님"
- 기준시세·4주 그래프·장보기 금액 계산에서 **기본 품종은 언제나 실제 aT 값**(mock 행이 섞이지 않게 `source<>'mock'` 조건 — 예시 품종을 직접 고른 경우만 예시 값)
- 화면: 품종 칩·품종 견줘 보기·결과 화면에서 예시 품종은 가격 옆 작은 "예시" 배지 + 출처 줄 "예시 시세 · 실제 조사값 아님"
- 온톨로지 그래프 뷰(`onto_node` price 노드)에는 `origin: 'mock'`

## 4. 테스트
- 문구: "살 만" 없음, 띠 경계 그대로
- 품종 전달: 가격 없음 + "부사" → variety_id 후지, 화면 기본 선택
- mock: seed/remove, 기본 품종 시세에 mock 안 섞임, 예시 품종 고르면 mock true·출처 문구, history·장보기 계산에 mock 없음
- 백엔드 `TEST_DATABASE_URL=postgresql:///marketon_test` 전체, 프런트 전체 3번 연속

## 하지 말 것
- 근거 문서에 없는 품종 이름, mock을 실제 시세처럼 표시, 판정·추천 문구, 패키지 추가, `.env` 수정, 기존 마이그레이션 수정(필요하면 0025부터), 커밋, `marketon` DB 접근
