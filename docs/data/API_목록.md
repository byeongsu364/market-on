# 외부 데이터·API 목록 (Water 관리)

마지막 갱신: 2026-11-27 03:00 · 신청하거나 확인할 때마다 상태 칸을 갱신한다. 키는 전부 저장소 루트 `.env`에만 둔다.

## 1. 키가 필요한 API

| # | 데이터 | 쓰는 기능 | 신청처 / 키 | `.env` 변수 | 불러오는 방식 | 상태 |
|---|---|---|---|---|---|---|
| 1 | aT 기간별 소매가격 ([15156065](https://www.data.go.kr/data/15156065/openapi.do)) | A4·A7 | 공공데이터포털 | `DATA_GO_KR_KEY` | 하루 1회 배치 | ✅ 호출 확인 |
| 2 | aT 일별 도·소매 가격 ([15156057](https://www.data.go.kr/data/15156057/openapi.do)) | A4·A7 | 공공데이터포털 | `DATA_GO_KR_KEY` | 하루 1회 배치 | ✅ 호출 확인 |
| 3 | aT 지역별 도·소매 가격 ([15156062](https://www.data.go.kr/data/15156062/openapi.do)) | B3 | 공공데이터포털 | `DATA_GO_KR_KEY` | 하루 1회 배치 | ✅ 호출 확인 |
| 4 | aT 최근일자 도·소매가격 ([15156063](https://www.data.go.kr/data/15156063/openapi.do)) | 홈 화면 오늘의 시세 | 공공데이터포털 | `DATA_GO_KR_KEY` | 하루 1회 배치 | ✅ 호출 확인 |
| 5 | aT 가격 추이 ([15156069](https://www.data.go.kr/data/15156069/openapi.do)) | 시세 추이 | 공공데이터포털 | `DATA_GO_KR_KEY` | 하루 1회 배치 | ✅ 호출 확인 |
| 6 | 소상공인 상가(상권)정보 ([15012005](https://www.data.go.kr/data/15012005/openapi.do)) | E1·E3 | 공공데이터포털 | `DATA_GO_KR_KEY` | 한 번 | ✅ 호출 확인 · 이용허락범위 제한 없음 |
| 7 | 기상청 단기예보 ([15084084](https://www.data.go.kr/data/15084084/openapi.do)) | F5 | 공공데이터포털 | `DATA_GO_KR_KEY` | 1시간 캐시 | ✅ 호출 확인 |
| 8 | 농식품 이달의 식재료 ([15168024](https://www.data.go.kr/data/15168024/openapi.do)) | D2·홈 화면 제철, **근거 문서·확인 포인트 출처** | 공공데이터포털 | `DATA_GO_KR_KEY` | 월 1회 | ✅ 호출 확인 · 이용허락범위 제한 없음 · 농사로 화면 대신 출처로 사용 (11/26) |
| 9 | 한국관광공사 관광음식 ([15174840](https://www.data.go.kr/data/15174840/openapi.do)) | G3 | 공공데이터포털 | `DATA_GO_KR_KEY` | 한 번 | ✅ 호출 확인 |
| 10 | 식품안전나라 레시피 DB ([COOKRCP01](https://www.foodsafetykorea.go.kr/api/openApiInfo.do?svc_no=COOKRCP01)) | F1·F2 | 식품안전나라 별도 키 | `FOODSAFETY_KEY` | 한 번 전부 | ✅ 호출 확인 · 레시피 11개 적재 (11/26) · 이용허락범위 제한 없음(공공데이터포털 15060073) |
| 11 | 네이버 지도 (Maps · Web Dynamic Map) | 시장 위치 지도 | 네이버 클라우드 플랫폼 콘솔 | `NAVER_MAP_CLIENT_ID` / `NAVER_MAP_CLIENT_SECRET` | 화면 (지도 스크립트) | ✅ 발급·지도 표시 확인, 시장 지도 화면에 연결됨 (11/26) |
| 20 | Google Cloud Vision (LABEL + TEXT 한 번에) | **사진 품목 인식·가격표 글자 (유일한 인식 경로, 040)** | Google Cloud 콘솔 프로젝트 `market-on` | `GOOGLE_VISION_API_KEY`, `VISION_DAILY_LIMIT`(300), `VISION_MONTHLY_LIMIT`(1000) | 서버 (`clients/vision.py`) | 🔑 키 발급 (11/26) · 코드 연결 (11/27) · 실제 사진 17장 확인: 비전 1.03초, 1순위 15/17 (라벨 + 사진 속 글자) · 키 제한(Cloud Vision API만) 확인 필요 |
| 21 | 카카오맵 (지도 JavaScript SDK · 로컬 REST API) | (예비) 네이버 지도를 못 쓸 때 지도 표시, 주소→좌표 | 카카오 디벨로퍼스 앱 `Market-On` (ID 1668225) | `KAKAO_JS_KEY` / `KAKAO_REST_API_KEY` | 화면 (지도 스크립트) / 서버 | 🔑 키 발급·카카오맵 사용 ON (11/27) · 아직 코드에서 안 씀 |

- 공공데이터포털 API(1~9번)는 **계정당 인증키 하나**로 모두 쓴다. API마다 활용신청만 따로 한다.
- 지도는 네이버가 기본이고, 카카오맵(21번)은 예비로 키만 받아 둔다 (11/27). JavaScript 키의 SDK 도메인은 `https://marketon.laea.io`(배포), `http://localhost:5173`, `http://127.0.0.1:5173`.
- 카카오맵 무료 쿼터는 계정에서 처음 카카오맵을 켠 앱(`Market-On`)에만 준다. 다른 앱에서 카카오맵을 켜지 않는다. JavaScript 키는 브라우저에 보이는 값, REST 키는 서버 전용이다.
- `KAMIS_SERVICE_KEY`·`KMA_SERVICE_KEY`는 `DATA_GO_KR_KEY`와 같은 값이고, 지금 코드는 `DATA_GO_KR_KEY`만 읽는다 (예전 이름을 지우지 않고 둠).
- 이용 조건(라이선스)은 `data/sources.yaml`의 `license`에 적고, 답변 밑 출처 표시에 그대로 나간다. 새 출처는 공공누리 1유형·이용허락범위 제한 없음을 우선한다.
- 네이버 지도(11번): Application `market-on`에 **Dynamic Map만** 켬. Web 서비스 URL은 `http://localhost:5173`, `http://localhost:5174`, `http://127.0.0.1:5173` (배포 주소는 정해지면 추가). 대표 계정 월 600만 건 무료, 콘솔 [한도 및 알림 설정]으로 사용량 상한을 걸어 둔다.
- 네이버 지도 Client ID는 화면 코드에 들어가서 브라우저에 보이는 값이고, 등록한 Web 서비스 URL에서만 동작한다. Client Secret은 서버 전용 API(Geocoding 등)용이라 화면 코드에 넣지 않는다 (지금은 쓰지 않음).

## 2. 키가 필요 없는 데이터 (파일·문서)

| # | 데이터 | 쓰는 기능 | 방식 | 상태 |
|---|---|---|---|---|
| 12 | 전국전통시장표준데이터 ([15012894](https://www.data.go.kr/data/15012894/openapi.do)) | E1·I3 | OpenAPI (`DATA_GO_KR_KEY`, 활용신청 필요) 또는 CSV | ✅ 활용신청 승인·호출 확인 (11/25) |
| 13 | 원재료성식품 영양성분 ([15100065](https://www.data.go.kr/data/15100065/standard.do)) | D2 제철월 | CSV 다운로드 | ⬜ 다운로드 |
| 14 | aT 우수 식재료 디렉토리 | A5·D2·F 손질법 | 웹 문서 → RAG | ⬜ 라이선스 확인 |
| 15 | aT 소매 품목코드표 | A4·D1 | `docs/data/aT_소매_품목코드표_20261120.csv` | ✅ 정리 완료 (83품목·108품종) |

## 3. 내부 모델 서버 (키 대신 Tailscale)

| # | 서버 | 쓰는 기능 | `.env` 변수 | 접속 조건 | 상태 |
|---|---|---|---|---|---|
| 16 | 학교 서버 Ollama: Gemma `gemma4:e4b` (`/api/chat`) | **헤드**: 최종 한국어 답(write)·규칙으로 못 나눈 질문 의도 나누기(route). 사진은 보지 않음 | `OLLAMA_BASE_URL`, `OLLAMA_CHAT_MODEL` | Tailscale 팀 네트워크 가입 | ✅ 사용 중 |
| 17 | 학교 서버 Ollama: bge-m3 `bge-m3:latest` (`/api/embed`, 1024차원) | RAG 문서·질문 임베딩 | `OLLAMA_BASE_URL`, `OLLAMA_EMBEDDING_MODEL` | Tailscale 팀 네트워크 가입 | ✅ 사용 중 |
| 18 | Google Gemini | 대화 도구 고르기(plan)·긴 근거 정리(extract)·장보기 이유(reason) 1순위, Gemma 답이 실패하면 답(write) 2순위 | `GEMINI_API_KEY`, `GEMINI_CHAT_MODEL` (기본 `gemini-flash-lite-latest`) | Google AI Studio 무료 키 (11/26 발급) | ✅ 키 발급·API 연결 확인 (답변·사진·채팅 도구 호출, 11/26) · 서버에서 실제 답변은 `v1beta` 수정 후 다시 확인 필요 |
| 19 | OpenAI GPT | Gemini 다음 순서 (plan·extract·reason 2순위, write 3순위) | `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL` (`gpt-5.4-mini`) | 팀 키 (1:1 전달) | ✅ 설정됨 · 노트북 채팅에서 답변 확인 (11/26) |

- 모델 서버 실제 주소는 `.env`에만 둔다. 저장소·단톡방에 적지 않는다.
- 모델 서버는 지금 키 없이 열려 있어서, 앞에 키 검사 문지기(게이트웨이)를 세우는 설계를 만들어 배포 담당과 공유했다 (11/26, 아직 적용 전). 적용되면 `OLLAMA_BASE_URL`이 바뀌고 `OLLAMA_API_KEY`가 추가된다.
- **모델 순서 (역할별, 040)**: route = Gemma (꺼져 있으면 Gemini → GPT) / plan·extract = Gemini → GPT / write = Gemma → Gemini → GPT / reason = Gemini → GPT → Gemma (`LLM_ROUTES`). 앞 모델이 실패하거나 답이 근거 확인을 못 넘으면 다음 모델로. 어느 역할을 어느 모델이 맡았는지는 DB `llm_calls`의 `role`·`provider`에 기록된다 (질문·답·사진 내용은 저장 안 함). 사진 품목 인식은 AI 모델 없이 구글 비전(20번)만 쓴다.
- **외부 AI(Gemini·GPT) 사용 규칙**: 모델별 하루 전체 `EXTERNAL_LLM_DAILY_LIMIT`(기본 500회), 손님(기기)별 1시간 `EXTERNAL_LLM_HOURLY_PER_CLIENT`(기본 20회), 답변 길이 `LLM_MAX_OUTPUT_TOKENS`(기본 2048), 실패 시 재시도 1번. 한도에 걸리면 Gemma 답을 그대로 쓴다.
- **외부로 나가는 데이터**: 사진은 서버에서 위치·기기·촬영 시각 정보를 지운 뒤 구글 비전에만 보낸다 (AI 모델에는 보내지 않음). Gemini 무료 키는 보낸 내용이 Google 학습에 쓰일 수 있어서 손님 개인정보를 보내지 않는다 (화면에 "외부 AI가 도와요" 안내 필요).
- Gemini는 `v1beta` 주소로 부른다 (`-latest` 모델 이름은 `v1`에 없음).

## 4. 공통 주의

- 공공데이터포털은 **초당 호출 제한**이 빡빡하다. 호출 간격 1초 이상.
- 날짜 파라미터는 `yyyyMMdd` (예: 20261120).
- 대회 중 실시간 호출은 aT 가격(하루 1회), 기상청(1시간)뿐. 나머지는 대회 전에 조사·다운로드만 해 두고, 현장에서 DB·RAG에 넣는다.
- 서약서에 따라 **수집 코드는 현장에서 새로 작성**한다.
- 자세한 호출 방법과 확인 결과: `docs/data/API_데이터확인.md`
