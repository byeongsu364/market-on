# 작업 지시서 016 · [1-5] 프론트 실제 연결 + 새 소비자 흐름 (P-1·P-2 포함)

- 담당: Codex · 지시: Claude · 2026-11-24 · 승인: 병수 (1-5, P-1·P-2 함께)
- 설계: **`docs/design/07-pull-growth.md` 1·2장** (시장 자동, 사진 한 장, 직접 입력 시 가격 필수, 가격표 없으면 그냥 넘어감, 점포 정하기 순서)
- 디자인: **`frontend/DESIGN.md`** (최우선), `docs/Design Tokens.Md`
- 계약 변경: `docs/tasks/015-photo-price-report.md` 3장 (RecognizeResponse·Market·PriceReport)
- 범위: **`frontend/` 전체 + 계약이 다른 `backend/` 응답 고치기** (아래 4장). 패키지 추가 금지. 프론트는 끝나면 `npm run format`, 백엔드는 `ruff format`

## 1. 실제 API 연결
- `VITE_API_MODE` 기본값을 **`live`**로 (mock은 `VITE_API_MODE=mock`일 때만). 개발 서버 프록시 `/api` → `http://localhost:8000` 그대로
- `api/client.ts`: 모든 요청에 **`X-Device-Id`** 헤더 (첫 실행 때 `crypto.randomUUID()` → localStorage, 읽기 실패 시 세션 동안 메모리 값), 기존 `X-Requested-With`·`credentials` 유지
- `types/contract.ts`: 015 문서 3장 모양 반영 (`RecognizeResponse.media_id·price_tag`, `Market.distance_m`, `PriceReportRequest/Response`) + 4장에서 맞춘 모양
- mock도 새 계약 모양으로 갱신 (테스트·오프라인 시연용으로 유지)

## 2. 새 소비자 흐름 (07 문서 1장)
1. **시장 자동 선택**: 앱 시작 시 위치 권한 → `/markets/nearby` → 가장 가까운 시장이 **1km 이내면 자동 선택**하고 상단 표시줄에 "지금 있는 시장 · ○○ (자동)" + "바꾸기". 1km 밖·권한 거부·실패면 목록 화면. 사용자가 바꾼 시장은 그 날 동안 우선
2. **홈 입력 두 가지** (P-1)
   - 큰 **찍기** 버튼 + 안내 한 줄 "가격표가 함께 보이게 찍어 주세요"
   - **직접 입력**: 품목 이름(자동완성 `/items/search`) + **가격(필수)** + 단위 칩(품목의 `units`, 기본 `default_unit`) → "확인하기". 가격 없으면 버튼 비활성 + 안내
3. **사진 → 확인 화면**: `/recognize` 결과로
   - 품목: 1순위가 0.8 이상이면 미리 선택, 후보 칩(최대 3) + "목록에 없어요" → 검색
   - 가격: `price_tag`가 있으면 **가격·단위·수량 칸을 채워서 보여 주고 고칠 수 있게** ("가격표에서 읽었어요" 캡션). `price_tag`가 null이면 **가격 칸 없이 바로 결과로 갈 수 있게** (가격 칸은 선택, 비어 있어도 진행 — "가격표가 없으면 그냥 넘어가요")
   - `unit`이 null(봉지 등)이면 단위 칩에서 고르게, 안 고르면 기본 단위
4. **결과 화면**: 확인 포인트 + 기준시세(`/price`, 가격이 있으면 `seen_price` 포함해 ±%) + **이 시장 판매 점포 목록** (P-2)
   - `/markets/{id}/map?item_id=`의 `highlight` 점포를 목록으로: 점포 이름·구역·마감세일 있으면 표시, 점포별 가격 칸은 "가격 정보 준비 중"(P-3에서 채움)
   - **점포 정하기** (07 문서 2장): ① `/s/:storeId`(QR)에서 들어왔으면 그 점포 ② 지도·목록에서 점포를 누르고 들어왔으면 그 점포 ③ 아니면 결과 아래 "어느 가게예요?" 판매 점포 칩 (건너뛰기 가능)
5. **가격 제보 저장**: 결과 화면에 **가격이 있을 때만** `POST /price-reports` (method: 사진이면 `price_tag_photo`+`media_id`, 직접 입력이면 `manual`). 결과 화면 들어올 때 1번, 사용자가 점포를 고르면 같은 내용 + `store_id`로 1번 더 (서버가 10분 안 재제출은 갱신 처리). 실패해도 화면은 그대로 (조용히 로그)
   - 결과 화면에 작게: "이 가격은 시장 가격표에 익명으로 더해져요" (개인정보 없음 안내)
6. 오류 대체: `/recognize` 503 → "사진 인식이 잠시 안 돼요. 이름으로 찾아 주세요" + 직접 입력으로, `/price` 404 → "기준시세가 아직 없어요"

## 3. 다른 화면 실제 연결
- 지도·점포 바텀시트·점포 공개 페이지·마감세일·상인 로그인/가입/홈/세일/점포 정보/포스터·운영자 승인 — 모두 live에서 동작
- 상인 가입의 시장·점포 고르기는 `/markets/nearby`·`/markets/{id}/map` 사용

## 4. 백엔드 응답 맞추기 (계약이 정답)
- `contract.ts`의 `ActiveSale`(= ClosingSale + `store_name`, `item_name`), `StorePage`, `MerchantStore`, `ClosingSale`, `User`, `PendingMerchant`, `PosterInfo` 와 실제 백엔드 응답을 **필드 단위로 비교**하고, 다르면 **백엔드를 계약에 맞춤** (예: `/sales/active`에 점포·품목 이름 없음)
- 계약 자체가 잘못됐다고 판단되면 고치지 말고 보고에 적기
- 각 엔드포인트 계약 키 테스트 추가 (백엔드)

## 5. 테스트
- 프론트(vitest, API 모듈 모킹): 시장 자동 선택(1km 안·밖·권한 거부), 직접 입력 가격 필수, 사진 결과 price_tag 있음/없음 흐름, 제보는 가격 있을 때만 + 점포 고르면 store_id 포함, `X-Device-Id` 헤더, 503 대체
- 백엔드: 4장 계약 키 테스트
- 기존 테스트 유지 (mock 기준 테스트는 mock 모드로)

## 하지 말 것
- 패키지 추가, `.env` 수정, 마이그레이션 0001~0009 수정, 커밋, 점포별 가격 집계(P-3), 판정·과장 문구, 새 색

## 자체 검수
- [ ] 프론트 `npm run build`·`lint`·`test`·`format:check`, 백엔드 `pytest`(DB가 막히면 보고)·`ruff format`
- [ ] `fetch(`는 `api/client.ts`만, HEX는 토큰 파일만, 140자 넘는 줄 없음
- [ ] 실제 브라우저 확인은 Claude가 함 (백엔드+DB+Ollama 필요)

## 보고 (한국어, 한 번)
변경 파일, 4장에서 맞춘 백엔드 응답 목록, 계약이 이상해 보이는 곳, 검수 결과, 남은 문제
