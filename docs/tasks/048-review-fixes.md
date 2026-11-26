# 작업 지시서 048 · 팀 검수 후속: 금칙어·업종 규칙·재료 매칭·날씨 규칙·생성기 보존·용어집 번역

- 담당: Codex(코드) / Claude(글: 근거 문서·확인 포인트·용어집·화면 문구) · 지시: Claude · 2026-11-27 · 승인: 병수 ("끝나면 고치고 커밋해줘")
- 근거: 검수 결과 3건(근거 문서·규칙표 4개·번역 초안) — 2026-11-27 대화
- **Codex가 손대지 않는 파일**(Claude가 동시에 고침): `data/rag_docs/**`, `data/i18n/glossary.yaml`, `data/ontology/criteria_overrides.yaml`, `frontend/src/i18n/locales/*.json`
- 범위(Codex): `backend/`, `data/ontology/{item_store_categories,ingredient_categories,weather_rules}.yaml`, `data/moderation/`, `data/markets/gyeongdong.yaml`, 테스트. 패키지 추가 금지

## 1. 금칙어 (`services/moderation.py`, `data/moderation/`)
- 지금: 글 전체 공백·기호 제거 후 부분 문자열 → "다시 발걸음", "수박씨 발라", "한 병 신경 써", "시발점"이 막힘
- 바꿈: **단어(공백 기준)마다** 기호 제거·NFKC·소문자 후 비교 + 띄어 쓴 욕설을 잡기 위해 **이웃 두 단어를 붙인 것**도 비교하되 `data/moderation/allow_words.txt`(허용: 다시발·씨발라·병신경·시발점·시발역 등)에 걸리면 통과
- `banned_words.txt` 보충(범주: 욕설 변형·초성(ㅅㅂ·ㅂㅅ·ㅈㄹ 등)·패드립·혐오(외국인·지역·장애·성별)·성적 표현(3글자 이상만)·영어 욕설 대표형), **넣지 말 것**: 씹·새끼·미친·두 글자 성기 비속어·니미(시장 리뷰에서 흔한 말과 겹침)
- 자모를 나눠 쓴 입력은 초성 패턴으로만 잡음(과차단 주의)
- 테스트: 위 4개 평범한 문장 통과, 대표 욕설·띄어 쓴 욕설·초성·영어 욕설 차단, 전화번호·URL 차단 유지

## 2. 품목 → 점포 업종 (`build_at_items.py`, `load_market_stores.py`, `item_store_categories.yaml`)
- 한 품목에 업종 **여러 개**: `store_categories: [..]`(첫 번째가 대표). 로더가 목록을 받음
- 바꿈: 고춧가루 dried+side_dish, 건고추 dried+produce, 참깨 side_dish+dried, 계란 side_dish(ingredient 쪽도 통일), 천일염·멸치액젓·새우젓 dried+side_dish, 김 dried+side_dish
- 떡·분식 업종에 연결 품목이 없는 것은 의도(주석)
- 생성기를 고쳐서 이 결과가 다시 만들어지게(파일만 고치지 말 것)

## 3. 레시피 재료 매칭 (`knowledge/recipes.py`, `ingredient_categories.yaml`, 품목 라벨)
- 품목 매칭 오탐 막기: 포도주→포도, 사과주스→사과, 감자전분→감자, 생강청→생강, "두 가지 색 파프리카"→가지 (가공품 접미어 제외 목록 + 한 글자/두 글자 품목 경계 규칙)
- "배추" 라벨이 배추·알배기배추 둘에 걸리는 문제: 알배기배추는 "알배기배추·알배추"만
- 품목 별칭 추가(온톨로지 생성기 상수로): 소금→천일염, 다시마→건다시마, 멸치→마른멸치, 미역→마른미역, 달걀→계란
- ingredient_categories: 건어물 규칙을 수산보다 위로, 새우젓·건새우 → dried, 고추기름·고추장·유자청·매실청·생강청 → side_dish 먼저, `떡`은 떡국떡·가래떡 등 구체 키워드(떡갈비 제외), `마른 표고` 공백 정규화(마른표고·건표고), 닭가슴살·닭다리·닭봉·닭날개 → meat, 대추 → dried, 스팸·베이컨·소시지 → side_dish, 추가: 셀러리·청경채·쪽파·비트·치커리·마·고사리 → produce, 북어채·잣·통깨·계피 → dried, 쌀가루·메밀가루·완두콩·병아리콩·수수·율무·메추리알 → side_dish. 참기름·간장·식초·설탕·꿀·식용유·밀가루는 side_dish(반찬·식료품). 이미 품목인 이름의 키워드는 "품목 매칭 실패 때만" 주석
- 키워드 비교 전 공백 제거

## 4. 날씨 규칙 (`weather_rules.yaml`, `recipes.py`)
- `hot` 규칙 **끔**(지금 후식이 모두 따뜻한 음식) — 주석
- rain: `부침` 제거, 제목에 '전'·'부침'·'파전'이 있는 반찬만(조리법 굽기와 함께)
- `max_temp_c` 미사용이면 제거, 서로 반대 태그(cold·hot) 동시 부여 금지

## 5. 생성기 보존 (`build_at_items.py`)
- `data/ontology/criteria_overrides.yaml`(Claude 작성: `crit:<item>-<key>: {text, source}`)이 있으면 그 문장으로 확인 포인트를 만들고 `criteria_style`은 지움(원문 인용 아님)
- 문서: 대상 경로의 기존 파일 frontmatter에 `manual: true`가 있으면 **덮어쓰지 않음**. 없는 문서는 지금처럼 생성
- 알배기배추: 문서 3개를 만들지 않고 배추 문서 `entities`에 `item:baby_napa_cabbage` 추가, 확인 포인트도 배추 것을 공유하지 않음(알배기배추는 "자료 준비 중")
- HTML 엔티티(`&apos;` 등) 풀기
- `scripts/pipeline.py` review: "보관.- 5℃"처럼 숫자 앞 "-"를 음수로 읽지 않게(대조 정확도)

## 6. 번역 용어집 사용 (`scripts/translate_locales.py`, `llm/translate.py`)
- `data/i18n/glossary.yaml`(Claude 작성: `ko → {en, zh, ja, vi}` — 품목·품종·단위·부위·용어)
  - 엔터티 이름 번역은 용어집에 있으면 **그 값 그대로**(LLM 안 부름)
  - 문장 번역(확인 포인트·답변)은 프롬프트에 그 문장에 나온 용어집 항목을 "반드시 이 번역 사용"으로 넣음
- `--retranslate`(검수 전 항목을 지우고 다시 번역) 옵션

## 7. 테스트·검수
- 각 항목 단위 테스트, 백엔드 `TEST_DATABASE_URL=postgresql:///marketon_test` 전체, 프런트 전체 3번 연속
- 하지 말 것: 위 Claude 파일 수정, 패키지 추가, `.env` 수정, 기존 마이그레이션 수정, 커밋, `marketon` DB 접근
