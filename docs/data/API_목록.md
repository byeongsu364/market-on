# 외부 데이터·API 목록 (Water 관리)

마지막 갱신: 2026-11-26 16:40 · 신청하거나 확인할 때마다 상태 칸을 갱신한다. 키는 전부 저장소 루트 `.env`에만 둔다.

## 1. 키가 필요한 API

| # | 데이터 | 쓰는 기능 | 신청처 / 키 | `.env` 변수 | 불러오는 방식 | 상태 |
|---|---|---|---|---|---|---|
| 1 | aT 기간별 소매가격 ([15156065](https://www.data.go.kr/data/15156065/openapi.do)) | A4·A7 | 공공데이터포털 | `DATA_GO_KR_KEY` | 하루 1회 배치 | ✅ 호출 확인 |
| 2 | aT 일별 도·소매 가격 ([15156057](https://www.data.go.kr/data/15156057/openapi.do)) | A4·A7 | 공공데이터포털 | `DATA_GO_KR_KEY` | 하루 1회 배치 | ✅ 호출 확인 |
| 3 | aT 지역별 도·소매 가격 ([15156062](https://www.data.go.kr/data/15156062/openapi.do)) | B3 | 공공데이터포털 | `DATA_GO_KR_KEY` | 하루 1회 배치 | ✅ 호출 확인 |
| 4 | aT 최근일자 도·소매가격 ([15156063](https://www.data.go.kr/data/15156063/openapi.do)) | 홈 화면 오늘의 시세 | 공공데이터포털 | `DATA_GO_KR_KEY` | 하루 1회 배치 | ✅ 호출 확인 |
| 5 | aT 가격 추이 ([15156069](https://www.data.go.kr/data/15156069/openapi.do)) | 시세 추이 | 공공데이터포털 | `DATA_GO_KR_KEY` | 하루 1회 배치 | ✅ 호출 확인 |
| 6 | 소상공인 상가(상권)정보 ([15012005](https://www.data.go.kr/data/15012005/openapi.do)) | E1·E3 | 공공데이터포털 | `DATA_GO_KR_KEY` | 한 번 | ✅ 호출 확인 |
| 7 | 기상청 단기예보 ([15084084](https://www.data.go.kr/data/15084084/openapi.do)) | F5 | 공공데이터포털 | `DATA_GO_KR_KEY` | 1시간 캐시 | ✅ 호출 확인 |
| 8 | 농식품 이달의 식재료 ([15168024](https://www.data.go.kr/data/15168024/openapi.do)) | D2·홈 화면 제철 | 공공데이터포털 | `DATA_GO_KR_KEY` | 월 1회 | ✅ 호출 확인 |
| 9 | 한국관광공사 관광음식 ([15174840](https://www.data.go.kr/data/15174840/openapi.do)) | G3 | 공공데이터포털 | `DATA_GO_KR_KEY` | 한 번 | ✅ 호출 확인 |
| 10 | 식품안전나라 레시피 DB ([COOKRCP01](https://www.foodsafetykorea.go.kr/api/openApiInfo.do?svc_no=COOKRCP01)) | F1·F2 | 식품안전나라 별도 키 | `FOODSAFETY_KEY` | 한 번 전부 | ✅ 호출 확인 |
| 11 | 네이버 지도 (Maps · Web Dynamic Map) | 시장 위치 지도 | 네이버 클라우드 플랫폼 콘솔 | `NAVER_MAP_CLIENT_ID` / `NAVER_MAP_CLIENT_SECRET` | 화면 (지도 스크립트) | ✅ 발급·지도 표시 확인 (11/26) |

- 공공데이터포털 API(1~9번)는 **계정당 인증키 하나**로 모두 쓴다. API마다 활용신청만 따로 한다.
- 카카오맵은 쓰지 않는다 (지도는 네이버로 결정).
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
| 16 | 학교 서버 Ollama: Gemma `gemma4:e4b` (`/api/chat`) | 사진 인식·가격표 읽기·질문 답변 | `OLLAMA_BASE_URL`, `OLLAMA_CHAT_MODEL` | Tailscale 팀 네트워크 가입 | ✅ 사용 중 |
| 17 | 학교 서버 Ollama: bge-m3 `bge-m3:latest` (`/api/embed`, 1024차원) | RAG 문서·질문 임베딩 | `OLLAMA_BASE_URL`, `OLLAMA_EMBEDDING_MODEL` | Tailscale 팀 네트워크 가입 | ✅ 사용 중 |
| 18 | OpenAI GPT (보조) | Gemma가 못 알아볼 때만 다시 물음 | `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL` | 유료 키 | ⬜ 미설정 (Gemma만 사용) |

- 모델 서버 실제 주소는 `.env`에만 둔다. 저장소·단톡방에 적지 않는다.
- 모델 서버는 지금 키 없이 열려 있어서, 앞에 키 검사 문지기(게이트웨이)를 세우는 설계를 배포 담당에게 전달함 (11/26). 적용되면 `OLLAMA_BASE_URL`이 바뀌고 `OLLAMA_API_KEY`가 추가된다.

## 4. 공통 주의

- 공공데이터포털은 **초당 호출 제한**이 빡빡하다. 호출 간격 1초 이상.
- 날짜 파라미터는 `yyyyMMdd` (예: 20261120).
- 대회 중 실시간 호출은 aT 가격(하루 1회), 기상청(1시간)뿐. 나머지는 대회 전에 조사·다운로드만 해 두고, 현장에서 DB·RAG에 넣는다.
- 서약서에 따라 **수집 코드는 현장에서 새로 작성**한다.
- 자세한 호출 방법과 확인 결과: `docs/data/API_데이터확인.md`
