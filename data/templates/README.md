# 손질법·레시피 문서 양식

손질법(`prep`)과 레시피(`recipe`) 문서를 쓰는 규칙이에요. 여기 있는 파일은 **양식**이라 적재되지 않아요. 복사해서 `data/rag_docs/` 아래에 저장해야 DB에 들어가요.

| 양식 | 저장 위치 | 만드는 방법 |
| --- | --- | --- |
| [`prep.md`](prep.md) 손질법 | `data/rag_docs/<품목>/prep.md` | 사람이 출처를 보고 작성 |
| [`recipe.md`](recipe.md) 레시피 | `data/rag_docs/recipes/<이름>.md` | 식품안전나라는 `import_recipes`로 자동 생성, 그 밖의 출처는 사람이 작성 |

## 공통 규칙

1. **출처 먼저:** `data/sources.yaml`에 출처를 등록하고, 그 키를 `source:`에 적어요. 출처가 없는 내용은 쓰지 않아요.
2. **품목 ID:** `entities`에는 `data/ontology/items.yaml`의 `id`(예: `item:green_onion`)만 적어요. 재료 이름은 본문에 쓰면 적재할 때 자동으로 품목과 연결돼요.
3. **검수 표시:** 본문 첫 줄은 `> 초안 · 검수 전 (작성자 날짜, 출처 대조 필요)`예요. 팀 검수가 끝나면 지워요(`data/RAG_REVIEW.md`).
4. **판정·권유 금지:** "신선해요", "A등급", "사세요", "추천" 같은 말은 쓰지 않아요. 답변 검사(fact check)에서 막혀요.
5. **숫자는 출처 그대로:** 분량·시간·온도는 출처에 있는 숫자만 써요.
6. **말투:** 해요체, 한 줄에 한 동작.
7. **마지막 줄:** `출처: <문서 제목> (<발행 기관>)`

## 손질법 본문

- 한 문서에 품목 하나만 다뤄요.
- `씻기 → 다듬기 → 썰기 → 남은 것 보관` 순서로 필요한 것만 써요.
- 짧게 써요. 손질법은 문서 하나가 통째로 검색 조각 1개가 돼서, 600자 안쪽이 좋아요.

## 레시피 본문

`## 재료`, `## 만드는 법`, `## 팁` 세 절로 나눠요. 레시피는 길면 절 단위로 나눠 검색되므로 절 제목을 지켜요.

- **재료:** 한 줄에 하나, `이름 분량` 형식 (예: `대파 1대(100g)`)
- **만드는 법:** 번호 목록, 한 단계에 한 동작
- **팁:** 출처에 있을 때만

## 적재

```sh
cd backend
# 1) 식품안전나라 레시피를 md로 변환 (파일 또는 API)
python -m scripts.import_recipes --from-file 저장한_응답.json
python -m scripts.import_recipes --from-api --parts 대파   # FOODSAFETY_KEY 필요, 서버에서만
# 2) DB에 적재 (기존 적재기, 바뀐 문서만 다시 넣음)
python -m scripts.load_sources
python -m scripts.load_documents
# 3) 확인
python -m scripts.search "대파 요리" --lang ko --k 5
```
