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
    S --> L["llm/router (역할별)<br/>답: Gemma → Gemini → GPT<br/>도구·정리·이유: Gemini → GPT"]
    S --> CL["clients<br/>aT 시세 · 네이버 지도 · 구글 비전"]
  end
  subgraph 저장소["PostgreSQL + pgvector"]
    DB1[(온톨로지<br/>entities · relations)]
    DB2[(RAG 문서 조각<br/>+ 임베딩)]
    DB3[(시장 · 점포 · 판매 품목<br/>마감세일 · 가격 제보)]
    DB4[(응답 캐시 · LLM 호출 기록)]
  end
  subgraph 외부
    G[Gemma · bge-m3<br/>Ollama, Tailscale 서버]
    GM[Google Gemini]
    O[OpenAI GPT]
    V[구글 비전<br/>사진 품목·가격표 글자]
    AT[aT 전통시장 시세]
    NV[네이버 지도]
  end
  C & M & A --> FE --> R
  K --> DB1 & DB2
  S --> DB3 & DB4
  L --> G & GM & O
  CL --> AT & NV & V
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

작업 지시서 040 (2026-11-27): 사진 품목 인식은 **구글 비전만**, 젬마는 **헤드 에이전트(최종 한국어 답)**, 제미나이 → GPT는 젬마가 맡기는 일(도구 고르기·긴 근거 정리·장보기 이유·실패 시 대신 답하기).

```mermaid
sequenceDiagram
  autonumber
  participant F as 화면
  participant API as 서버
  participant V as 구글 비전
  participant ON as 온톨로지
  participant RAG as RAG 검색
  participant G as 젬마 (route·write)
  participant X as 제미나이→GPT (plan·extract·reason)
  participant AT as aT 시세

  F->>API: POST /recognize (사진)
  API->>API: 위치·기기 정보 지우기 (동의 시 대략 위치만)
  API->>V: 라벨 + 글자 한 번에 (하루·한 달 한도)
  API->>ON: 비전 라벨 10개 → 품목 후보 (vision 라벨) + 사진 속 글자의 품목 이름(가격표·상자)
  API->>API: 가격표 글자 → 가격·단위(정규식)·품종(온톨로지 라벨)
  Note right of V: AI 모델은 사진을 보지 않음. 비전이 안 되면 후보 없이 → 화면에서 직접 고르기
  API-->>F: 후보, price_tag, model=google-vision

  F->>API: GET /prices?item&variety&market
  API->>AT: 이 시장(없으면 지역·전국) 시세
  API-->>F: 기준시세, 단위 환산, ±%, 출처·조사일

  F->>API: POST /ask (품목 + 의도/질문)
  API->>API: 의도: 키워드 규칙
  opt 규칙으로 못 나눔
    API->>G: route (의도 나누기)
  end
  alt 제철·수확·산지
    API->>ON: inSeason · harvestPeriod · producedIn
    API-->>F: 템플릿 문장 + 출처 (AI 없음)
  else 시세·어디서 파는지
    API-->>F: DB 값으로 바로 답 (AI 없음)
  else 고르는 법·보관·손질·특징
    API->>API: 응답 캐시 확인
    API->>RAG: 의도별 문서 종류로 검색 (유사도 0.45 이상)
    opt 근거 4개 이상 또는 2,000자 이상
      API->>X: extract (필요한 사실만, 근거 번호 유지)
    end
    API->>G: write (근거만으로 한국어 답)
    API->>API: 사실 확인 (원래 근거로, 숫자·단위·판정어 문장 삭제)
    Note right of G: 실패하거나 확인 못 넘으면 write 다음 모델 (제미나이 → GPT)
    API-->>F: 답 + 실제로 쓴 근거 출처 + steps
  end
```

- **장보기 추천** `POST /recommend`: 품목·수량·가격은 코드가 계산 → reason(제미나이 → GPT → 젬마)은 이유 문장만 → 사실 확인.
- **대화** `POST /chat`: plan(제미나이 → GPT)이 도구 6개(품목 찾기·기준시세·판매 점포·마감세일·지식 질문·장보기 구성)를 최대 4번 부름 → write(젬마)가 도구 결과로 한국어 답 → 도구 결과와 대조 → 실패하면 write 다음 모델, 그래도 안 되면 plan 모델의 답을 같은 검사로.
- **기다리는 동안**: 답은 사실 확인 뒤 한 번에 와서 글자 스트리밍은 안 해요. 화면은 "근거 찾는 중 → 정리 중 → 답 쓰는 중"을 차례로 보여 주고, 응답의 `steps`에 실제로 거친 단계가 와요.
- **기록**: 모든 호출은 `llm_calls`에 역할(`role`: route·plan·extract·write·reason·vision)과 모델로 남아요. 발표 때 "최종 답(write)의 몇 %를 젬마가 썼나"를 여기서 셉니다.

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
