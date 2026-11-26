# 작업 지시서 044 · 적재 파이프라인 7단계 + 적재 리포트(자동 검사 4개) + 시연 질문 30개 평가

- 담당: Codex · 지시: Claude · 2026-11-27 · 승인: 병수 ("044 진행하자")
- 근거: 「MarketOn 온톨로지·RAG 적재 파이프라인 기획서 v1」 4장(7단계)·9장(품질·평가). 042(그래프 뷰·검수 상태·청크 숫자), 043(제보 상태)는 main에 있음
- 기존: `scripts/load_all.py`(출처 → 온톨로지 → 문서 → 임베딩, 한 번에), `knowledge/ingest.py`, `build_embeddings.py`(content_hash로 바뀐 청크만), 응답 캐시 키에 품목별 문서 버전이 들어 있음(`answer_cache.cache_key`) → 문서가 바뀌면 그 품목만 새로 계산됨
- 범위: `backend/scripts/`, `backend/app/`(읽기 API 하나), `frontend/`(운영자 화면 한 섹션), `data/eval/`, `.gitignore`. 패키지 추가 금지

## 1. 파이프라인 (`backend/scripts/pipeline.py`, 단계마다 다음 단계가 읽는 파일을 남겨 중간부터 다시 시작)
| # | 단계 | 하는 일 | 남기는 파일 |
|---|---|---|---|
| 1 | collect | 출처 중 **이용 조건이 확인된 API**만 원문 수집: 「농식품 이달의 식재료」 `foodCont`(출처 `sources.yaml`의 `# fdmtSn N` 주석 → 번호). 키는 `DATA_GO_KR_KEY`. 라이선스가 "확인 필요"면 수집하지 않고 리포트에 적음 | `data/raw/nics/{fdmtSn}.json` + `data/raw/LICENSES.md`(출처·이용 조건·받은 날) |
| 2 | clean | 원문 HTML 제거, ■·- 항목을 문장 줄로, 단위 표기 통일(℃·kg·원) | `data/raw/clean/{source_key}.md` |
| 3 | normalize | `data/rag_docs/**/*.md` frontmatter 검사: `entities`가 온톨로지 ID인지, `source`가 `sources.yaml`에 있는지, doc_type·intent. **ID 없는 문서는 이후 단계에서 제외**하고 리포트에 적음 | (메모리) |
| 4 | chunk | 지금 `ingest.py` 청크 규칙 그대로 → 청크마다 item_ids·node_type·intent·variety_id·numbers·chunk_hash | `data/build/chunks.jsonl` |
| 5 | review | 청크의 **숫자·단위가 그 출처 원문(clean)에 있는지 자동 대조**(있음/없음/원문 없음). frontmatter `review_status` 그대로 | `data/build/review.md` (문서별 대조표, `RAG_REVIEW.md`에서 링크) |
| 6 | load | 지금 `load_all`(출처·온톨로지·문서·임베딩) 호출. 바뀐 청크만 임베딩(지금과 같음) | DB |
| 7 | invalidate | 바뀐 문서의 item_id에 대한 **예전 버전 캐시 행 삭제**(키의 버전이 지금 버전과 다른 `ask:{item}:…`, `recommend:…` 중 그 품목 포함). 그다음 회귀 검사(아래 2장) | `data/build/load_report.json` + `.md` |

- 실행: `python -m scripts.pipeline --from collect|clean|normalize|chunk|review|load|invalidate [--to …] [--offline]`(offline이면 collect 건너뜀)
- `data/build/`는 `.gitignore`. `data/raw/`는 **이용 제한 없는 출처만** 커밋(원문 대조 근거)

## 2. 자동 검사 4개 (load 전후, 실패하면 load 하지 않거나 리포트에 실패로)
| 검사 | 기준 | 실패 시 |
|---|---|---|
| 온톨로지 연결 | 모든 청크에 item_id·node_type, yaml에 있는 ID | load 중단 |
| 출처·라이선스 | 모든 문서·관계의 source가 있고 license 비어 있지 않음 | load 중단 |
| 중복 | 같은 chunk_hash 1개 | 경고(지금도 unique라 중복은 하나만 들어감) |
| 제보 가격 범위 | `price_reports` 중 `status='held'` 수와 비율(043 규칙) | 정보로만 |
- 리포트: 단계별 처리 수·건너뜀·실패, 검사 4개 결과, 숫자 대조(있음/없음 수), 검수 상태 비율, 걸린 시간

## 3. 시연 질문 30개 평가 (`data/eval/questions.yaml`, `backend/scripts/evaluate.py`)
- 질문 30개: 품목 6개(대파·양파·사과·배·단감·귤) × 의도 중 **근거 문서가 있는 것**(고르는 법 select·보관 store·손질 prep·특징 story) 25개 + **범위 밖 5개**(시세 예측, 다른 품목 "망고", 의학 효능 단정, 레시피 분량, 원산지 단정). 질문 문장은 손님 말투로, **각 질문에 정답 문서 `doc_key`**(범위 밖은 `expect: no_evidence`)
  - 질문은 Codex가 초안을 쓰고 Claude가 검수함. 근거 문서에 없는 사실을 정답으로 두지 말 것
- 지표 (`/ask` 서비스 함수 직접 호출, 캐시 끔):
  - 검색 적중률: 정답 doc_key 청크가 상위 5개 안 (목표 90%)
  - 출처 표시율: answer일 때 citations ≥ 1 (목표 100%)
  - 값 대조 통과율: 최종 답 숫자가 근거에 있음 (`fact_check` 재사용, 목표 100%)
  - 자료 없음 정답률: 범위 밖 5개가 no_evidence (목표 5/5)
  - 응답 시간: 중앙값·최대 (캐시 적중은 별도로 한 번 더 불러 측정)
- 결과: `data/build/eval_report.json` + `.md`, 파이프라인 7단계 끝에 `--eval`로 붙일 수 있게. 모델·임베딩 서버가 없으면 검색 적중률만 계산하고 나머지는 "측정 못 함"으로

## 4. 운영자 화면 (발표용)
- `GET /admin/pipeline/report` (운영자만) → 최근 `load_report.json`·`eval_report.json` 내용(없으면 404)
- 운영자 화면(WebAdmin)에 "적재 리포트" 섹션: 단계별 숫자, 검사 4개(통과/실패), 평가 지표 5개, 실행 시각. 새 디자인 컴포넌트 사용

## 5. 테스트
- 단계 단위: clean(HTML·■ 처리), normalize(ID 없는 문서 제외), chunk(jsonl 필드), review(숫자 있음/없음), invalidate(예전 버전 키만 삭제, 지금 버전·다른 품목 유지), 검사 4개 실패 시 load 안 함
- collect는 네트워크 없이(응답 픽스처), 라이선스 미확인 출처 건너뜀
- evaluate: 픽스처 질문 3개로 지표 계산, 서버 없을 때 "측정 못 함"
- API 권한(운영자만), 화면 표시
- 백엔드 `TEST_DATABASE_URL=postgresql:///marketon_test` 전체, 프런트 전체 3번 연속

## 하지 말 것
- 패키지 추가, `.env` 수정, 기존 마이그레이션 수정, 커밋, `marketon` DB 접근(실제 실행·평가는 Claude), 이용 조건 미확인 원문 커밋, 근거 없는 정답, 키를 파일·로그에 남기기
