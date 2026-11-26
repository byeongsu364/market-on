# 08. 서비스 흐름도

> 상태: **[확정]** 지금 코드 기준 (2026-11-26, main `70431a7`) · 5장만 **[제안]**
> 그림은 Mermaid라 GitHub·VS Code에서 바로 보여요.

---

## 1. 한눈에 보는 구조

```mermaid
flowchart LR
  subgraph 사용자
    C[손님]:::u
    M[상인]:::u
    A[시장 관리자·운영자]:::u
  end
  subgraph 화면["화면 (React · 휴대폰 웹)"]
    FE[홈 · 촬영 · 결과 · 지도<br/>물어보기 · 장보기 추천 · 대화<br/>판단 카드 · 점포 페이지]
  end
  subgraph 서버["서버 (FastAPI)"]
    R[routers] --> S[services]
    S --> K["knowledge<br/>온톨로지 · RAG · 사실 확인"]
    S --> L["llm/router<br/>Gemma 먼저 → 부족하면 GPT"]
    S --> CL["clients<br/>aT 시세 · 네이버 지도"]
  end
  subgraph 저장소["PostgreSQL + pgvector"]
    DB1[(온톨로지<br/>entities · relations)]
    DB2[(RAG 문서 조각<br/>+ 임베딩)]
    DB3[(시장 · 점포 · 판매 품목<br/>마감세일 · 가격 제보)]
    DB4[(응답 캐시 · LLM 호출 기록)]
  end
  subgraph 외부
    G[Gemma · bge-m3<br/>Ollama, Tailscale 서버]
    O[OpenAI GPT]
    AT[aT 전통시장 시세]
    NV[네이버 지도]
  end
  C & M & A --> FE --> R
  K --> DB1 & DB2
  S --> DB3 & DB4
  L --> G & O
  CL --> AT & NV
  classDef u fill:#fff3d6,stroke:#c08a00
```

- **원칙**: AI는 등급을 매기지 않아요. 숫자(시세·수량·제철)는 코드와 온톨로지가 만들고, AI는 근거 문장을 고르고 말로 풀기만 해요.
- **데이터 원본**: `data/ontology/*.yaml`, `data/rag_docs/`, `data/markets/gyeongdong.yaml` → 적재 스크립트 → DB.

---

## 2. 손님 흐름 (주 기능: "이 품목, 이 시장 어디서 팔아요?")

```mermaid
flowchart TD
  Start([앱 열기 / 시장 입구 QR ?market=]) --> Where{시장 안인가?<br/>GPS 1km 또는 QR}
  Where -- 시장 밖 --> Near["홈 · 주변 시장<br/>네이버 지도 마커 (10km, 없으면 가까운 5곳)"]
  Near --> MC[시장 카드<br/>구역 칩 · 길찾기]
  MC --> Pick[/markets 시장 선택/]
  Where -- 시장 안 --> Home[홈: 11월 제철 칩 · 오늘 기준시세 · 마감세일]
  Pick --> Home

  Home --> Scan["/scan 촬영<br/>품목 + 가격표 한 장"]
  Home --> MapP["/map 시장 지도<br/>카테고리 구역 + 품목 칩"]
  Home --> Rec["/recommend 장보기 추천<br/>용도 · 인원 · 예산"]
  Home --> Chat["/chat 대화"]
  Home -- 제철 칩 --> Result

  Scan --> Rcg{품목 인식<br/>POST /recognize}
  Rcg -- 후보 칩 / 목록에 없어요 → 검색 --> Result
  Rcg -- 실패 → 직접 입력 --> Result

  Result["/items/:id 결과 화면"]
  Result --> R1[기준시세 ±%<br/>품종 칩]
  Result --> R2[확인 포인트 체크<br/>내가 직접 판단]
  Result --> R3[이 시장 판매 점포<br/>→ 지도에서 강조]
  Result --> R4["물어보기 칩<br/>고르는 법·보관·손질·제철·특징"]
  Result --> R5[판단 카드 만들기<br/>PNG 저장·공유 + QR]
  Result -.확장.-> R6[점포 가격 제보<br/>손님 N명 확인 · 상인 확인]

  R3 --> MapP
  MapP --> Store["점포 바텀시트 / /s/:storeId<br/>판매 품목 · 마감세일"]
  Rec -- 품목별 판매 점포 --> MapP
  Chat -- 도구 결과의 점포 --> MapP
  R5 -. QR .-> Store
```

---

## 3. 결과 화면 안에서 일어나는 일 (요청별)

```mermaid
sequenceDiagram
  autonumber
  participant F as 화면
  participant API as 서버
  participant ON as 온톨로지
  participant RAG as RAG 검색
  participant LLM as Gemma→GPT
  participant AT as aT 시세

  F->>API: POST /recognize (사진)
  API->>ON: 품목 목록
  API->>LLM: 목록 안에서 고르기 + 가격표 읽기
  Note right of LLM: Gemma 결과가 부족할 때만 GPT
  API-->>F: item_id, 후보, price_tag(가격·단위·품종 글자)

  F->>API: GET /prices?item&variety&market
  API->>AT: 이 시장(없으면 지역·전국) 시세
  API-->>F: 기준시세, 단위 환산, ±%, 출처·조사일

  F->>API: GET /markets/{id}/items
  API-->>F: 품목별 판매 점포 (상가정보 업종 추정은 "추정" 표시)

  F->>API: POST /ask (품목 + 의도/질문)
  alt 제철·수확·산지
    API->>ON: inSeason · harvestPeriod · producedIn
    API-->>F: 템플릿 문장 + 출처 (LLM 없음)
  else 시세·어디서 파는지
    API-->>F: DB 값으로 바로 답 (LLM 없음)
  else 고르는 법·보관·손질·특징
    API->>API: 응답 캐시 확인
    API->>RAG: 의도별 문서 종류로 검색 (유사도 0.45 이상)
    API->>LLM: 근거만으로 답하기
    API->>API: 사실 확인 (숫자·단위·판정어 문장 삭제)
    API-->>F: 답 + 실제로 쓴 근거 출처
  end
```

- **장보기 추천** `POST /recommend`: 품목·수량·가격은 코드가 계산 → LLM은 이유 문장만 (근거 = 용도별 RAG 문서 + 온톨로지 제철 문장).
- **대화** `POST /chat`: GPT 먼저. 도구 6개(품목 찾기·기준시세·판매 점포·마감세일·지식 질문·장보기 구성)를 최대 4번 부르고, 마지막 답을 도구 결과와 대조.

---

## 4. 상인 · 시장 관리자 · 운영자 흐름

```mermaid
flowchart TD
  MS["/merchant 시작"] --> ML[로그인] & SU["가입<br/>점포 고르기 (+캡차)"]
  SU --> Pend[승인 대기]
  Pend -- 시장 관리자 승인 --> MH[상인 홈]
  ML --> MH
  MH --> Sale["/merchant/sale/new<br/>30초 마감세일"] --> Live[홈·지도·점포 페이지에 노출]
  MH --> SE["/merchant/store<br/>점포 정보·판매 품목"]
  MH --> PO["/merchant/poster<br/>점포 QR 포스터"]

  MA["/market-admin 시장 관리자"] --> Ap[상인 승인·거절·중지]
  MA --> MP[시장 입구 QR 포스터]

  Cust[손님: '이 시장도 쓰고 싶어요'] --> Dem[(시장 수요)]
  Join["/join 시장 입점 신청 (+캡차)"] --> Apps[(신청)]
  Dem & Apps --> OP["/admin 운영자<br/>신청 승인 → 시장 관리자 계정"]
  OP --> MA
```

- **캡차 화면**은 신태빈 님 담당이에요. 지금은 가입과 `/join`이 서버에서 막혀 있어요.

---

## 5. 남은 작업이 붙는 자리 **[제안]**

```mermaid
flowchart LR
  Result[결과 화면] --> F1["F 레시피: 이 재료로 만드는 요리<br/>(레시피 문서 11개 있음)"]
  F1 --> F2[다른 재료도 같은 시장 판매 점포로 연결]
  MH[상인 홈] --> F3[남는 재고 → 그 재고로 만드는 요리]
  Home[홈] --> F4[날씨 맞춤 요리]
  Result --> G4[다국어 · 주문 문장 카드]
  Home --> I2[관심 품목 마감세일 알림]
  MapP[시장 지도] --> I3[편의시설 층]
  classDef todo stroke-dasharray:4 3
  class F1,F2,F3,F4,G4,I2,I3 todo
```

| 순서 | 작업 | 흐름에서 바뀌는 곳 |
|---|---|---|
| 1 | 고정 주소 배포 (이름 있는 Cloudflare 터널) | 1장 바깥: 네이버 지도 도메인 한 번만 등록 → 시장 밖 지도가 목록 대신 지도로 보임 |
| 2 | 개발용 DB 정리 | 2장 시장 선택에서 시험 시장·시험 계정이 사라짐 |
| 3 | 레시피 화면 (F) | 3장 `/ask`에 `recipe` 의도 추가 + 결과 화면 새 섹션 |
