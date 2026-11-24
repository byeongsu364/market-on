# 04. 운영 데이터 DB 설계 (시세·시장·점포·상인 입력)

> 상태: **[제안]** 2026-11-24
> 범위: 매일 바뀌거나 앱에서 쌓이는 데이터. 온톨로지·RAG(01·03 문서)와 엔터티 ID(`item:…`, `region:…`)로 연결해요.
> 근거: 신태빈 `Water` 브랜치 `docs/data/API_데이터확인.md` (aT API 5개·상가정보 실제 호출 결과, 2026-11-22)

---

## 1. 설계 목표

| 목표 | 설계 |
|---|---|
| 기준시세를 **전통시장 / 대형유통**으로 나눠 보여 주기 (기능 2) | aT 기간별 소매가격의 시장(조사처)별 가격을 그대로 저장하고, 시장 이름 규칙으로 구분 |
| "기준시세 대비 ○%"를 정직하게 (03 문서 단점→장점 3번) | 시세를 **출처·날짜·지역·시장 구분이 붙은 관측값**으로 저장, 평균은 조회할 때 계산 |
| 실제 사는 단위로 환산 | aT 조사 단위(`unit`, `unit_sz`) 원본을 저장하고, 품목별 환산은 온톨로지 `soldBy` 관계의 `props` 사용 |
| 시장 안 점포 지도 | 점포 목록은 상가정보, 미니맵 좌표는 직접 배치 |
| 상인 입력 (P1) | 취급 품목, 오늘 추천 |
| 소비자가 찍은 가격 (B1) | 가격표 기록 → 시장별 시세표 |

## 2. 테이블

```
markets 1─N zones 1─N stores N─M items(entities)  (store_items = sells)
                       stores 1─N today_picks
markets 1─N price_reports (소비자 가격표)
price_observations (aT) ── item_id → entities
media (사진·녹음 파일)
```

### 2-1. price_observations — aT 시세 관측값
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | bigserial PK | |
| exmn_ymd | date | 조사일 |
| se_cd | text | 01 소매 / 02 중도매 |
| ctgry_cd, item_cd, vrty_cd, grd_cd | text | aT 코드 원본 |
| item_nm, vrty_nm, grd_nm | text | aT 이름 원본 |
| sgg_nm | text | 조사지역 이름 |
| mrkt_cd, mrkt_nm | text | 조사처(시장) |
| market_type | text | `traditional` · `large_retail` · `wholesale` · `unknown` (3장 규칙) |
| unit, unit_sz | text | 조사 단위 원본 (예: kg, 1 / 개, 10) |
| price | int | `exmn_dd_prc` (조사 단위당 원) |
| item_id | text FK entities, null 허용 | 코드 → 품목 엔터티 (적재 시 `entities.kamis`로 매핑, 못 찾으면 null) |
| variety_id | text FK entities, null 허용 | |
| source | text | `at_period_retail` 등 API 이름 |
| fetched_at | timestamptz | |
| UNIQUE | (source, exmn_ymd, se_cd, mrkt_cd, item_cd, vrty_cd, grd_cd) | 다시 받아도 중복 없음 |

- 인덱스: `(item_id, exmn_ymd desc)`, `(item_cd, vrty_cd, exmn_ymd desc)`
- 지역 평균·최저·최고는 테이블로 두지 않고 조회 함수로 계산 (4장)

### 2-2. markets — 시장
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | text PK | `market:gyeongdong` |
| name_ko | text | |
| region_id | text FK entities | `region:seoul` |
| address, lat, lng | | 전국전통시장표준데이터 |
| at_mrkt_cd | text, null 허용 | aT 조사처이면 코드 (경동 `0110212`) → **이 시장 자체 시세**를 바로 보여 줌 |
| at_sgg_nm | text | 기준시세에 쓸 aT 조사지역 |
| floorplan_svg | text, null 허용 | 미니맵 평면도 파일 경로 |
| source | text | `std_market_data` · `manual` |

### 2-3. zones — 시장 안 구역
| id text PK (`zone:gyeongdong-veg`) · market_id FK · store_category_id FK entities (`store_category:vegetable` 등, 색 지정) · name_ko · svg_path text (평면도 위 영역) |

### 2-4. stores — 점포
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | text PK | `store:gyeongdong-B03` |
| market_id | FK markets | |
| zone_id | FK zones, null 허용 | |
| name_ko | text | 상가정보 상호명 |
| store_category_id | FK entities | 청과·채소·수산·정육·반찬·떡/분식 |
| sbiz_id | text UNIQUE, null 허용 | 상가정보 상가업소번호 |
| sbiz_industry | text | 상가정보 업종명 원본 |
| floor | text | |
| map_x, map_y | real, null 허용 | **평면도 좌표 (직접 배치)**. 상가정보 좌표는 시장 건물 하나로 뭉쳐 있어 쓰지 않음 |
| hours | jsonb | 영업시간 (상인 입력 M3) |
| source | text | `sbiz` · `manual` |
| active | boolean default true | |

**store_items** (`sells`): store_id FK · item_id FK entities · source (`merchant` · `sbiz_guess` · `manual`) · PK (store_id, item_id)

### 2-5. today_picks — 상인 오늘 추천 (P1)
| id bigserial · store_id FK · item_id FK · price int null · note text (한 줄 소개) · origin_region_id FK null · valid_until timestamptz (기본: 오늘 영업 마감) · created_at |

### 2-6. price_reports — 소비자가 찍은 가격 (B1)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | bigserial PK | |
| market_id | FK markets | |
| store_id | FK stores, null 허용 | |
| item_id | FK entities | 사용자가 확정한 품목 |
| unit_id | FK entities, null 허용 | 사용자가 고른 단위 (`unit:bunch`) |
| quantity | numeric default 1 | |
| price | int | |
| method | text | `price_tag_photo` (가격표 읽기) · `manual` |
| media_id | FK media, null 허용 | 가격표 사진 |
| reported_at | timestamptz | |

- 개인정보는 저장하지 않아요 (사용자 ID 없음).

### 2-7. media — 사진·녹음 파일
| id uuid PK · kind (`photo` · `audio`) · path text (백엔드 로컬 `storage/` 기준 상대 경로) · mime · bytes int · created_at |

- 파일은 `backend/storage/` (Git 제외), DB에는 경로만. 서버로 옮기면 같은 폴더 구조로 복사.

## 3. 시장 구분 규칙 (aT 조사처)

`Water` 브랜치 확인 결과를 그대로 따라요.

| 조건 | market_type |
|---|---|
| `se_cd = '02'` | `wholesale` |
| `mrkt_nm`이 `-유통`으로 끝남 | `large_retail` |
| 그 외 이름 (경동, 부전, 칠성, 현대, 양동, 역전, 신정, 지동, 중앙, 육거리, 남부, 죽도, 상남, 동문) | `traditional` |
| `복조리` 등 위 목록에 없는 이름 | `unknown` (확인 후 목록에 추가) |

- **시장코드로 나누지 않아요** (순천 역전 `0360402` 같은 예외). 규칙은 코드의 표 하나(`utils`)로 관리.

## 4. 기준시세 조회

`price_baseline(item_id, variety_id, on_date, sgg_nm)` 결과
- 기준 날짜: `on_date` 이하에서 **가장 최근 조사일** (주말·공휴일 조사 없음)
- 전통시장 평균·대형유통 평균·전체 평균, 최저·최고, 조사처 수, 단위
- 지역(`sgg_nm`)을 주면 그 지역, 없으면 전국
- 시장에 `at_mrkt_cd`가 있으면 **그 시장 자체 가격**도 함께
- 대체 순서 (Wayket 로직): 지역 값 없음 → 전국 → 최근 14일 안 유효 가격

## 5. 수집 (aT 기간별 소매가격 `periodRetail/price`)

- 하루 1회 배치 (`scripts/update_prices.py`), 호출 간격 1초 이상, 최근 평일 기준
- 품목 목록: `entities.kamis`가 있는 품목만 (온톨로지가 수집 범위를 정함)
- 키: `DATA_GO_KR_KEY` (공공데이터포털 계정 키 하나로 aT·상가정보·기상청 공통)
- 축산(500)·가공식품은 이 API에 없어요 → 해당 품목은 기준시세 없이 확인 포인트만

## 6. 결정 필요

- [ ] **시연 시장**: **경동시장 추천** — aT 조사처라 시장 자체 시세가 있고, 상가정보 점포 194곳이 확인됨. 단, 서울시 입체주소 시범 지역(청량리 일대)과 겹치는지 확인 필요 (CONTEXT 6-1)
- [ ] 미니맵에 배치할 점포 수 (Water 제안: 20~30곳)
- [ ] 상가정보 업종 → 점포 카테고리 대응표 (채소/과일 → 청과·채소 등)
