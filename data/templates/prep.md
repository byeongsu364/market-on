---
# 손질법 문서 양식 (복사해서 data/rag_docs/<품목>/prep.md 로 저장)
# - 파일 위치: data/rag_docs/<품목 폴더>/prep.md  (예: data/rag_docs/green_onion/prep.md)
# - '#'으로 시작하는 줄은 지우고 값만 남겨요. 이 templates 폴더는 적재되지 않아요.
source: src:출처-키              # data/sources.yaml 에 먼저 등록한 키 (예: src:nongsaro-month-food-green-onion)
doc_type: prep                   # 손질법은 항상 prep
lang: ko
title: 대파 손질하는 법          # "<품목> 손질하는 법" 형식
entities: [item:green_onion]     # 이 문서가 다루는 품목 ID (data/ontology/items.yaml 의 id)
store_id: null                   # 상인 노하우가 아니면 null
---
> 초안 · 검수 전 (작성자 YYYY-MM-DD, 출처 대조 필요)

<품목>을 씻고 다듬는 방법이에요.
- 씻기: 흐르는 물에 ○○을 씻어요.
- 다듬기: ○○ 부분을 잘라 내요.
- 썰기: 쓸 요리에 맞게 ○○ 모양으로 썰어요.
- 남은 것: 손질하고 남은 부분은 ○○해서 보관해요.

출처: <문서 제목> (<발행 기관>)
