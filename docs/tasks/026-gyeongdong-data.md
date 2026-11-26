# 작업 지시서 026 · [E1] 경동시장 점포 데이터 (상가정보 → 업종 구역 지도)

- 담당: Codex · 지시: Claude · 2026-11-26 · 승인: 병수 (실제 상호명 · 업종으로 구역 배치 · 업종으로 취급 품목 추정 + 표시)
- 근거: `docs/data/API_데이터확인.md` 3장(상가정보 API, 경동시장 반경 조회, **시장 안 위치 없음 — 180곳 좌표 동일**), `docs/presentation/demo-market-gyeongdong.md`(경동시장 선택 이유, aT 조사처 `0110212`)
- 기존: 스키마가 이미 준비됨 — `stores.sbiz_id/sbiz_industry/floor/source='sbiz'`, `store_items.source='sbiz_guess'`, `zones(x,y)`, `markets.at_mrkt_cd`. `scripts/seed_demo_market.py`(가짜 시장), `scripts/clean_store_data.py`(빈 자리), `store_categories.yaml`(6종), `/markets/{id}/map`, 미니맵, 점포 바텀시트·공개 페이지
- 범위: `data/` + `backend/` + `frontend/`. **새 마이그레이션 없음**. 패키지 추가 금지. 끝나면 `ruff format`, `npm run format`

## 1. 설정 파일 `data/markets/gyeongdong.yaml` (팀이 고칠 수 있게 코드 밖에)
```yaml
market: {id: market:gyeongdong, name_ko: 경동시장, at_mrkt_cd: '0110212', at_sgg_nm: 서울, region: <서울 region 엔터티>}
center: {lat: 37.5798, lng: 127.0397}   # 반경 조회 중심 (주소 기준 좌표로 보정해도 됨)
radius_m: 300
buildings: [경동시장, 경동시장 본관, 경동시장 신관, 경동시장 옥외점포]   # bldNm 일치(공백 무시). 응답 보고 보정 — 보고서에 실제 bldNm 목록 적기
industries:   # 상가정보 소분류(indsSclsNm) → store_category. 여기 없는 업종은 넣지 않음(약국·부동산·병원 등)
  채소/과일 소매업: store_category:produce
  건어물/젓갈 소매업: store_category:dried
  수산물 소매업: store_category:seafood
  정육점: store_category:meat
  반찬/식료품 소매업: store_category:side_dish
  떡/한과: store_category:snack
  # 약재·곡물·건강식품 등은 실제 응답의 업종 이름을 보고 추가 (보고서에 업종별 개수 표)
category_items:   # store_category → 온톨로지 분류 (취급 품목 추정용)
  store_category:produce: [cat:vegetable, cat:fruit]
```
- 시장 좌표: 점포 좌표(대부분 같은 점)의 대표값을 `markets.lat/lng`로

## 2. 온톨로지
- `store_categories.yaml`에 추가: `store_category:produce`(채소·과일), `store_category:dried`(건어물·젓갈), 필요하면 `store_category:herb`(약재·건강식품)·`store_category:grain`(곡물). 라벨 ko·en

## 3. 적재 스크립트 `scripts/load_market_stores.py --market data/markets/gyeongdong.yaml [--dry-run]`
- 상가정보 `storeListInRadius`(`core/http`, `DATA_GO_KR_KEY`, 페이지 전부) → `buildings` 일치 → `industries`에 있는 업종만
- upsert: `stores` id `store:gd-<bizesId>`, `name_ko`=상호명(**실제 상호**), `sbiz_id`, `sbiz_industry`, `floor`(flrNo), `store_category_id`, `source='sbiz'`, `active=true`. 다시 실행해도 같은 결과, **응답에서 사라진 sbiz 점포는 `active=false`**(삭제 안 함 — 상인 계정이 붙어 있을 수 있음)
- **취급 품목 추정**: `category_items`의 분류에 속한 온톨로지 품목 전부를 `store_items(source='sbiz_guess')`로. 상인이 직접 고친 `merchant` 행은 건드리지 않음
- **구역·배치(예시)**: store_category마다 zone 하나(`zone:gd-<category>`), 구역은 격자로 배치, 점포는 구역 안에서 (건물 → 층 → 상호명) 순서로 격자 배치해 `map_x/map_y` 채움. 크기 상수는 기존 미니맵 좌표계에 맞춤
- `--dry-run`: 저장 없이 업종별 개수·건물명별 개수·추정 품목 수 출력
- 출처 `data/sources.yaml`에 `src:sbiz-store-info`(소상공인시장진흥공단 상가(상권)정보, 데이터 기준월 2026-09, 라이선스는 포털 표기 확인 — 불명확하면 "확인 필요")

## 4. API · 화면
- `/markets/{id}/map` 응답에 `layout: 'schematic' | 'surveyed'`(경동은 schematic) + `source_note`("소상공인 상가정보 2026-09 기준") 추가, 점포에 `items_basis: 'merchant' | 'sbiz_guess' | 'mixed'`
- 미니맵: `schematic`이면 작은 안내 "배치는 업종별 예시예요 · 실제 위치는 현장에서 확인해 주세요"
- 판매 점포 목록·바텀시트·점포 공개 페이지: `sbiz_guess` 품목이면 "업종 기준 · 상인 확인 전" 작은 표시, 점포 이름 아래 "공공데이터 상호명" 출처 한 줄(바텀시트·공개 페이지만)
- 결과 화면 판매 점포 목록이 길어지므로 **처음 5곳 + "더 보기"**, 마감세일·상인 확인 가격 있는 점포 먼저(기존 정렬 유지)
- `contract.ts`·mock·계약 키 테스트
- `/price`: 시장이 `at_mrkt_cd`를 가지면 `this_market`(그 시장 aT 조사값)이 이미 있는 구조 — 경동에서 채워지는지 확인하고, 안 되면 고쳐서 결과 화면 "이 시장 aT 조사값"으로 표시

## 5. 테스트 (상가정보 응답은 고정 데이터)
- 건물·업종 필터, 업종 → 카테고리, 추정 품목(sbiz_guess) 생성·merchant 행 보존, 재실행 멱등, 사라진 점포 비활성, 구역·좌표 결정성, dry-run 저장 없음
- map 응답 layout·source_note·items_basis, 계약 키
- 프론트: schematic 안내, "업종 기준" 표시, 판매 점포 5곳 + 더 보기
- 기존 테스트 유지 (가짜 시연 시장 `market:demo`는 그대로 둠 — 테스트용)

## 하지 말 것
- 패키지 추가, `.env` 수정, 마이그레이션, 커밋, `marketon` DB 접근(적재는 Claude가 실행), 실제 API 호출(테스트는 고정 데이터), 상가정보에 없는 정보 지어내기(위치·품목을 사실처럼 표시), 새 색

## 자체 검수
- [ ] 백엔드 `pytest`(DB 막히면 보고)·`ruff format`, 프론트 `build`·`lint`·`test`·`format:check`
- [ ] HTTP는 `core/http.py`, SQL은 `db/`, `fetch(`는 `api/client.ts`만

## 보고 (한국어, 한 번)
변경 파일, 설정 파일 항목, 적재·dry-run 사용법, 계약 변경, 검수 결과, 남은 문제
