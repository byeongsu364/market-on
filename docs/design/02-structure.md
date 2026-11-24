# 02. 폴더 구조와 규칙

> 상태: **[확정]** 2026-11-22
> 바탕: 팀이 정리한 구조안. 검토하면서 고친 곳은 4장에 따로 모았어요.

---

## 1. 구조

```
market-on/
├─ docs/                         기획·설계
├─ data/
│  ├─ ontology/                  품목 온톨로지 원본 (YAML)
│  ├─ rag_docs/                  확인 포인트·출하 시기·저장 조건·레시피 문서
│  ├─ markets/                   시연 시장 점포 목록 + 평면도 SVG
│  ├─ kamis/                     KAMIS 품목 코드표 (Wayket에서 가져옴)
│  └─ SOURCES.md                 모든 데이터·이미지 출처와 라이선스
│
├─ backend/
│  ├─ app/
│  │  ├─ main.py                 앱 생성 + 라우터 등록만
│  │  ├─ deps.py                 의존성 주입 (DB 클라이언트, LLM, 외부 클라이언트)
│  │  │
│  │  ├─ core/                   ── 전역 공통: 어디서든 import ──
│  │  │  ├─ config.py            .env 읽기 (키는 여기서만)
│  │  │  ├─ http.py              외부 API 공통 호출 (타임아웃·재시도·로깅)
│  │  │  ├─ cache.py             메모리 TTL 캐시 데코레이터 (KAMIS 응답 등 짧은 캐시)
│  │  │  ├─ errors.py            공통 예외 + 에러 응답 형식
│  │  │  └─ logging.py
│  │  │
│  │  ├─ routers/                ① 요청 받기 → service 호출 → 응답 (로직 없음)
│  │  │  ├─ scan.py   (A)        price.py (B)   merchant.py (C)
│  │  │  ├─ stores.py (E)        recipe.py (F)  card.py (G)
│  │  │  └─ agent.py  (H)
│  │  │
│  │  ├─ services/               ② 기능 로직 (라우터와 에이전트가 같이 씀)
│  │  │  ├─ scan_service.py      price_service.py   merchant_service.py
│  │  │  ├─ store_service.py     recipe_service.py  card_service.py
│  │  │  └─ agent/
│  │  │     ├─ agent_service.py
│  │  │     └─ tools.py          위 service들을 에이전트 도구로 감싸기만 함
│  │  │
│  │  ├─ knowledge/      ★ D     ③ 온톨로지·RAG (service가 부름)
│  │  │  ├─ ontology.py          품목 조회·동의어 정규화·KAMIS 코드 매핑
│  │  │  ├─ ingest.py            문서 → 조각 나누기 → 엔터티 태깅 → 저장 (scripts·상인 노하우 공용)
│  │  │  ├─ embedder.py          임베딩 생성 (llm/ 호출)
│  │  │  ├─ retriever.py         RAG 검색 (match_chunks SQL 함수)
│  │  │  ├─ answer_cache.py      DB 응답 캐시 (엔터티+의도+날짜+언어)
│  │  │  └─ citation.py          근거 출처 붙이기
│  │  │
│  │  ├─ clients/                ④ 외부 API 래퍼 (core/http.py 사용)
│  │  │  ├─ at_price.py   vision.py   stores.py   weather.py
│  │  │
│  │  ├─ llm/            ★ J1    ④ LLM 호출은 이 폴더에서만
│  │  │  ├─ base.py              LLMProvider 인터페이스 (generate, embed)
│  │  │  ├─ gemini.py  ollama.py  fake.py  구현체
│  │  │  ├─ factory.py           config 값으로 provider 선택 (교체 지점)
│  │  │  └─ prompts/             프롬프트 템플릿 파일 (코드와 분리)
│  │  │
│  │  ├─ db/                     ④ DB 접근은 이 폴더에서만
│  │  │  ├─ pool.py              psycopg 커넥션 풀 (DATABASE_URL, pgvector 타입 등록)
│  │  │  └─ repositories/        테이블별 함수
│  │  │     ├─ knowledge_repo.py entities·labels·relations·documents·chunks·cache
│  │  │     ├─ price_repo.py     가격표 기록 (B)
│  │  │     ├─ store_repo.py     시장·점포 (E)
│  │  │     ├─ merchant_repo.py  상인 오늘 추천 (P1)
│  │  │     └─ media_repo.py     사진·녹음 메타데이터
│  │  │
│  │  ├─ schemas/                Pydantic 요청/응답 모델 (router·service 공용)
│  │  └─ utils/                  순수 함수: 단위 변환, 가격 포맷, 날짜, 한글 정규화
│  │
│  ├─ migrations/                ★ 테이블·인덱스·SQL 함수 (DB 구조의 유일한 원본, 0001_xxx.sql 순서)
│  │
│  ├─ scripts/                   app 패키지를 import해서 재사용 (backend/에서 python -m scripts.xxx)
│  │  ├─ load_ontology.py        data/ontology → entities·labels·relations
│  │  ├─ load_sources.py         data/SOURCES → sources
│  │  ├─ load_documents.py       data/rag_docs → documents·chunks (knowledge/ingest.py 사용)
│  │  ├─ build_embeddings.py     임베딩 빈 chunks 채우기
│  │  ├─ update_prices.py        KAMIS 기준시세 갱신 (Wayket n8n A 로직 이식)
│  │  └─ clean_store_data.py     점포 데이터 정리
│  │
│  ├─ tests/
│  └─ requirements.txt
│
├─ frontend/
│  └─ src/
│     ├─ pages/                  화면 조립만 (Home, Scan, Result, Map, Recipe, Card, Agent, Merchant)
│     ├─ components/
│     │  ├─ common/              Button, Card, Modal, Loading, ErrorBox
│     │  ├─ layout/              Header, BottomNav, PageLayout
│     │  └─ domain/              Checklist, PriceCompare, MiniMap, StoreCard
│     ├─ hooks/                  useScan, usePrice, useStores, useCamera, useGeolocation
│     ├─ api/
│     │  ├─ client.ts            fetch 래퍼 (baseURL·에러·언어 헤더), fetch는 여기서만
│     │  └─ scan.ts price.ts stores.ts recipe.ts card.ts agent.ts merchant.ts
│     ├─ types/                  API 타입 (backend OpenAPI에서 자동 생성)
│     ├─ utils/                  formatPrice, formatDate, 단위 변환
│     ├─ constants/              라우트 경로, 지원 언어, 점포 카테고리 색상
│     ├─ store/                  전역 상태 (언어, 선택한 시장)
│     ├─ i18n/                   index.ts + locales/ko·en·zh·ja·vi.json
│     └─ styles/
│
├─ .env.example                  키 이름만 (값 없음)
└─ README.md
```

---

## 2. 지켜야 할 규칙

1. **호출은 한 방향으로만 흘러요.**
   `router → service → knowledge → (llm · db/repositories · clients)`
   - service는 knowledge를 거치지 않고 llm·repositories·clients를 바로 불러도 돼요.
   - 아래 층이 위 층을 부르면 안 돼요. 예: knowledge가 service를 부르면 안 돼요.
   - `core/`, `schemas/`, `utils/`는 어느 층에서나 import해요.
2. **외부 연결은 한 곳에서만 해요.**
   - 외부 HTTP: `core/http.py`
   - LLM·임베딩: `llm/`
   - DB: `db/`
   - 프론트 fetch: `api/client.ts`
   - 그래서 Gemini를 Gemma로 바꿀 때 `factory.py` 하나만 고치면 돼요.
   - 단, Gemini처럼 공식 SDK를 쓰는 경우는 SDK 호출을 해당 폴더(`llm/`) 안에만 둬요.
3. **에이전트(H)는 새로 만들지 않고 조립해요.** `tools.py`가 `price_service`, `store_service` 같은 기존 로직을 그대로 감싸요.
4. **프론트는 역할별로 나눠요.**
   - 페이지(pages): 화면 조립만
   - 상태와 로직: hooks
   - 서버 호출: api
   - 계산: utils

예: 시세 조회
`routers/price.py → price_service.get_price() → knowledge/ontology.py(품목명 → KAMIS 코드) + clients/at_price.py`
스캔 결과 화면과 에이전트도 같은 `get_price()`를 불러요.

---

## 3. 담당 영역 (충돌 줄이기)

| 영역 | 폴더 |
|---|---|
| 지식 | `data/ontology`, `data/rag_docs`, `knowledge/`, `scripts/load_*`, `build_embeddings.py` |
| 인식·시세 | `llm/`, `clients/at_price.py`·`vision.py`, `scan_service`, `price_service`, `scripts/update_prices.py` |
| 지도·상인 | `data/markets`, `clients/stores.py`, `store_service`, `merchant_service` |
| 프론트 | `frontend/` 전체 |
| 공용 (먼저 합의) | `schemas/`, `backend/migrations/`, `core/` |

- 공용 폴더는 첫 1~2시간 안에 함께 정하고, 이후에는 바꿀 때 팀에 알려요.

---

## 4. 팀 초안에서 고친 곳

| 고친 곳 | 이유 |
|---|---|
| `backend/migrations/` 추가 | DB 구조(01 문서)를 SQL 파일로 관리할 곳이 없었어요. 팀원 모두 같은 SQL로 DB를 만들 수 있어요. |
| `db/session.py`·`models/` → `db/pool.py`·`repositories/` | ORM 모델 없이 repositories에서 SQL을 직접 써요. 테이블 구조는 마이그레이션 SQL 한 곳에만 둬요. |
| `models/knowhow.py` 삭제 | 01 문서에서 상인 노하우는 `documents` 테이블의 `merchant_tip` 유형으로 넣기로 했어요. 별도 테이블이 없어요. |
| `knowledge/ingest.py` 추가 | 적재 스크립트와 상인 노하우 API가 같은 조각 나누기·태깅 로직을 쓰게 해요. |
| `knowledge` 층 위치 명시 | 원래 규칙에 knowledge가 llm·db를 불러도 되는지 빠져 있었어요. |
| `scripts/` → `backend/scripts/` | 루트에 두면 `app` 패키지 import 경로가 꼬여요. backend 안에 두고 `python -m scripts.xxx`로 실행해요. |
| 적재 스크립트 4개, `update_prices.py` 추가 | 01 문서의 적재 순서와 Wayket 가격 갱신 로직을 옮길 곳 |
| `data/kamis/` 추가 | Wayket KAMIS 코드표를 둘 곳 |
| `constants/` "등급 색상" → "점포 카테고리 색상" | 서비스 원칙상 신선도 등급을 쓰지 않아요. |
| `types/` 자동 생성 | FastAPI가 만드는 OpenAPI 명세로 TS 타입을 생성하면 손으로 1:1 맞출 필요가 없어요. |
| `core/cache.py`와 `answer_cache.py` 역할 구분 | 앞은 메모리 TTL 캐시(짧은 외부 응답), 뒤는 DB에 저장하는 답변 캐시 |

---

## 5. 결정 사항

- **[확정]** DB는 PostgreSQL + pgvector예요 (2026-11-22 Supabase에서 변경).
- **[확정]** DB 접근은 psycopg 3 + 커넥션 풀로 해요. ORM은 쓰지 않고, 테이블 정의는 `backend/migrations/` SQL에만 둬요. 적용은 `python -m scripts.migrate`.
- **[확정]** 프론트는 React + Vite + TypeScript예요.

- **[확정]** Ollama로 Gemma 대화와 bge-m3 임베딩(1024차원)을 호출하며 `gemma` 공급자 이름은 `ollama`의 별칭이에요.
