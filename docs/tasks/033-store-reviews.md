# 작업 지시서 033 · 점포 리뷰 (별점 + 글)

- 담당: Codex · 지시: Claude · 2026-11-26 · 승인: 병수 (손님 회원가입 후 작성, 별점 + 글, 금칙어 자동 차단)
- 전제: 032(손님 역할) 먼저
- 원칙: 별점은 **손님이 매긴 평가**임을 화면에 분명히("손님 N명 평가"). AI는 리뷰를 요약·채점·필터링하지 않음
- 범위: `backend/` + `frontend/` + `data/moderation/`. 패키지 추가 금지

## 1. 데이터
- 마이그레이션 `0016_store_reviews.sql`: `store_reviews(id bigserial, store_id → stores on delete cascade, user_id → users on delete cascade, rating smallint 1~5, body text not null 1~200자, created_at, updated_at, unique(store_id, user_id))`, 인덱스 `(store_id, updated_at desc)`
- `data/moderation/banned_words.txt`: 한 줄에 하나, `#` 주석. 흔한 욕설·비하어 초안(짧게, 팀이 보충)

## 2. 백엔드
- `GET /stores/{store_id}/reviews?limit=20&offset=0` (로그인 불필요): `{average: 4.3 | null(0건), count, items: [{id, rating, body, author: 'app***', created_at, updated_at, mine: bool}]}` 최신순. `author`는 아이디 앞 3자 + `***`
- `PUT /stores/{store_id}/reviews/me` (손님만, CSRF): `{rating, body}` → 쓰기/고치기(upsert). 없는 점포·비활성 점포 404
- `DELETE /stores/{store_id}/reviews/me` (손님만, CSRF) → 204
- 손님 아님 → 403, 로그인 안 함 → 401
- 하루 작성·수정 10회 제한(계정 기준, 서울 날짜) → 429 `REVIEW_RATE_LIMIT`
- 금칙어 검사 `services/moderation.py`: 공백·특수문자 제거 후 금칙어 포함, 전화번호(`01x-xxxx-xxxx` 변형), URL·`www.` → 422 `REVIEW_BLOCKED` "이 표현은 쓸 수 없어요." (어떤 단어인지 응답에 넣지 않음)
- SQL은 `db/repositories/review_repo.py`
- 계약·mock 갱신

## 3. 화면
- 점포 상세(지도 바텀시트 `StoreSheet`, `/s/:storeId`): "★ 4.3 · 손님 12명 평가" + 최근 리뷰 3개 + "리뷰 더 보기"
- "리뷰 쓰기": 로그인 안 했으면 로그인 화면(돌아올 주소 유지), 손님이면 별점(1~5 버튼, 접근성 라벨) + 글(200자, 남은 글자 수) → 저장. 내 리뷰가 있으면 고치기·지우기
- 상인·관리자 계정은 "리뷰는 손님 계정으로 쓸 수 있어요"
- 오류 문구 표시(차단·제한)

## 4. 테스트
- 권한(비로그인 401, 상인 403, 손님 OK), upsert 1개 유지, 별점·글 범위 422, 금칙어·전화번호·URL 차단, 하루 제한, 평균·개수·마스킹·mine, 삭제, 비활성 점포 404
- DB 테스트로 마이그레이션·unique 확인
- 화면: 리뷰 표시, 비로그인 쓰기 → 로그인 이동, 쓰기·고치기·지우기, 차단 오류

## 하지 말 것
- 패키지 추가, `.env` 수정, 기존 마이그레이션 수정, 커밋, `marketon` DB 접근, AI 사용, 신고·상인 답글(다음 단계)
