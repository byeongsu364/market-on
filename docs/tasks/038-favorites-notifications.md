# 작업 지시서 038 · 단골 점포와 알림 (계정 기준, 앱 안 알림 + 웹 푸시)

- 담당: Codex · 지시: Claude · 2026-11-27 · 승인: 병수 ("단골알림은 계정기준으로", 알림 방식 "앱 안 알림 + 웹 푸시")
- 근거: 시안 Saved("단골 점포와 알림"), Store(단골 저장), SaleNew("올리면 단골 N명에게 알림"), Merchant("단골로 저장한 손님"), `docs/tasks/030-api-gaps.md`의 `/me/favorites`·`/me/notifications`. 프런트 타입 `Favorite`(지금 mock만)
- 전제: 손님 계정(`customer`, 032). **로그인한 손님만** 단골·알림. 비로그인은 "로그인하면 단골을 저장할 수 있어요"
- 범위: `backend/`, `frontend/`(서비스 워커 `public/sw.js` 포함), `.env.example`. 새 패키지 설치 금지 — 웹 푸시 암호화·서명(VAPID, RFC 8291/8292)은 가상환경에 이미 있는 `cryptography`(다른 패키지를 따라 설치됨, `requirements.txt`에는 없음)로 구현. **[확정] 2026-11-27 병수: `backend/requirements.txt`에 `cryptography`를 명시**(이미 설치된 버전, 새 설치 없음 — 배포에서 빠지지 않게)

## 1. 데이터 (마이그레이션 0026, 046이 0025를 쓸 수 있음)
- `favorites(user_id → users cascade, store_id → stores cascade, notify boolean default true, created_at, pk(user_id, store_id))`
- `notification_settings(user_id pk → users cascade, sales boolean default true, season boolean default true)`
- `notifications(id, user_id → users cascade, kind 'sale'|'season', title, body, url, created_at, read_at null)` (90일 지나면 정리)
- `push_subscriptions(id, user_id → users cascade, endpoint text unique, p256dh, auth, created_at, last_ok_at)`

## 2. API (손님만, CSRF)
- `GET/PUT/DELETE /me/favorites[/{store_id}]` (`PUT` body `{notify}`), 응답 `[{store_id, name, market_id, notify, active_sale}]`
- `GET/PUT /me/notifications/settings` `{sales, season}`
- `GET /me/notifications?unread=` · `POST /me/notifications/{id}/read` · `POST /me/notifications/read-all`
- `POST /me/push/subscribe` `{endpoint, keys:{p256dh, auth}}` · `DELETE /me/push/subscribe` · `GET /push/public-key`(로그인 불필요, VAPID 공개키만)
- 상인: `GET /merchant/stats`에 `favorites: n`(037에서 null이던 값)
- 점포 지도·상세 응답: 로그인 손님이면 `favorite: bool`

## 3. 알림 보내기
- **마감세일 등록**(`POST /merchant/sales`) → 그 점포를 단골로 저장하고 `notify`·`sales`가 켜진 손님에게: 앱 안 알림 1개 + 웹 푸시(구독 있으면). 문구 "{점포} · {품목} {가격}원 마감세일 ({끝나는 시각}까지)" — 판정 문구 없음. 같은 세일은 한 번만
- **이달의 제철**(`season` 켜진 손님): `scripts/send_season_notice.py`(매달 1일 실행용) — 온톨로지 `inSeason` 그 달 품목으로 "12월 제철: 귤" 1개
- 웹 푸시 실패(410 Gone 등)면 그 구독 삭제. 발송은 요청 처리와 분리(세일 등록 응답을 늦추지 않게 — 스레드 풀이나 백그라운드 태스크)
- VAPID 키: `.env`의 `VAPID_PUBLIC_KEY`·`VAPID_PRIVATE_KEY`·`VAPID_SUBJECT`(없으면 푸시만 끄고 앱 안 알림은 동작). `scripts/generate_vapid_keys.py`가 키를 만들어 **화면에 출력하지 않고 `.env`에 줄을 추가할 수 있게 안내만**(실제 추가는 Claude가 병수 확인 후). `.env.example`에 빈 칸 추가
- SaleNew 미리보기 "올리면 단골 N명에게 알림이 가요"를 live 값으로

## 4. 화면
- Store·지도 점포 시트: 단골 별 버튼(로그인 안 했으면 로그인으로, next 유지)
- Saved(`/me/saved`): 단골 목록, 점포별 알림 켜기/끄기, 알림 설정 2개(마감세일·이달의 제철), "알림 받기"(브라우저 권한 요청 → 구독 등록). 아이폰 안내 "홈 화면에 추가한 뒤에 알림을 받을 수 있어요"
- 헤더 종 아이콘 + 안 읽은 수, 알림함(목록·읽음)
- `public/sw.js`: push 이벤트 → 알림 표시, 클릭 → url 열기(같은 출처만)
- mock 갱신

## 5. 테스트
- 권한(비로그인 401, 상인 403, 손님 OK), 단골 CRUD, 설정, 알림함 읽음
- 세일 등록 → 대상 손님만(단골·notify·sales 켜짐) 알림 생성, 중복 없음, 푸시 발송 호출(모의), 410이면 구독 삭제, 키 없으면 푸시 건너뜀
- 제철 알림 스크립트(달별 품목)
- 상인 stats favorites
- 화면: 별 버튼·Saved·종 아이콘·알림함, 권한 거부 안내
- 백엔드 DB 테스트, 프런트 전체 3번 연속

## 하지 말 것
- 패키지 추가(필요하면 보고), `.env` 수정, 키를 파일·로그·화면에 출력, 기존 마이그레이션 수정, 커밋, `marketon` DB 접근, 다른 출처로 이동하는 알림 링크
