# 번역 초안 (045)

`en.yaml`, `zh.yaml`, `ja.yaml`, `vi.yaml`은 근거 문서가 아닌 표시용 데이터다.
95개 품목을 포함한 품목·품종·단위·카테고리·레시피·지역 이름은 `entities`,
확인 포인트는 `crit:<품목>-<key>` 엔터티, 제철·보관의 원문 한정 문구는
`phrases`, 조립 문장은 `templates`에 둔다. 각 항목은 `{text, reviewed}` 형식이다.
빈 `text`는 미번역이며 한국어로 표시한다. 현재 모두 `reviewed: false`다.

초기 파일은 외부 호출 없이 온톨로지에 이미 있는 외국어 라벨과 고정 템플릿만으로
생성한다. `backend/tests/test_i18n_data.py`는 임시 디렉터리에서 오프라인 재생성해
이 파일들과 비교하고, 전체 95개 품목·키·자리표시자를 검증한다.

```sh
cd backend
# 오프라인 재생성. DB와 LLM을 호출하지 않는다.
../.venv/bin/python -m scripts.translate_locales
# 나중에 Gemma가 준비되면 Claude가 실행할 번역 초안 채우기
../.venv/bin/python -m scripts.translate_locales --gemma
```

`--gemma`는 `translate` 역할만 사용한다. Gemini/GPT로 넘어가지 않는다.
실패한 항목은 비워 두고, 기존 비어 있지 않은 데이터는 유지한다.
화면 문구는 `frontend/src/i18n/locales`에 같은 스크립트로 채운다.
한국어와 같은 값은 미번역 대체 문구이므로 `--gemma` 실행 때 번역 대상이다.
번역 후 사람이 용어·뜻·단위와 자리표시자를 확인하고 `reviewed`를 변경한다.
`python -m scripts.load_ontology`로 표시용 라벨을 `entity_labels(kind=translated)`에
적재한다. 한국어 근거 문서를 외국어로 적재하지 않는다.
