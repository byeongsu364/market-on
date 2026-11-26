---
# 레시피 문서 양식 (직접 쓸 때 복사해서 data/rag_docs/recipes/<요리-영어-kebab>.md 로 저장)
# - 식품안전나라 레시피는 손으로 쓰지 말고 backend/scripts/import_recipes.py 로 자동 생성해요 (같은 양식).
# - '#'으로 시작하는 줄은 지우고 값만 남겨요. 이 templates 폴더는 적재되지 않아요.
source: src:출처-키              # data/sources.yaml 에 먼저 등록한 키
doc_type: recipe                 # 레시피는 항상 recipe
lang: ko
title: 대파 달걀볶음             # 요리 이름
entities: [item:green_onion]     # 재료 중 우리 품목 ID만 (data/ontology/items.yaml 의 id)
store_id: null
---
> 초안 · 검수 전 (작성자 YYYY-MM-DD, 출처 대조 필요)

요리 종류: 반찬 · 조리 방법: 볶기 · 열량: 000kcal

## 재료
- 대파 1대(100g)
- 달걀 2개
- 소금 약간

## 만드는 법
1. 대파는 깨끗이 씻어 송송 썰어요.
2. 달걀을 풀어 소금으로 간해요.
3. 팬에 기름을 두르고 대파를 볶다가 달걀을 넣어 익혀요.

## 팁
- (출처에 있는 팁만 적어요. 없으면 이 절을 지워요.)

출처: <문서 제목> (<발행 기관>)
