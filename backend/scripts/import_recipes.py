"""식품안전나라 조리식품 레시피 DB(COOKRCP01) → RAG 레시피 문서(md).

우리 품목(data/ontology/items.yaml)이 재료에 들어간 레시피만 골라
data/rag_docs/recipes/foodsafety-<RCP_SEQ>.md 로 써요 (양식: data/templates/recipe.md).
DB 적재는 기존 적재기(load_sources → load_documents)가 해요.

입력은 둘 중 하나예요.
  --from-file 응답.json   식품안전나라 API 응답(JSON)을 저장한 파일. 키·네트워크 필요 없음
  --from-api              FOODSAFETY_KEY로 직접 호출 (http 주소라 서버에서만 실행)
"""

import argparse
import json
import logging
import re
from collections import Counter
from pathlib import Path
from urllib.parse import quote

import yaml

from app.core import http
from app.core.config import settings

from ._common import DATA, run, summary

SOURCE_KEY = 'src:foodsafety-cookrcp01'
OUT_DIR = DATA / 'rag_docs' / 'recipes'
PREFIX = 'foodsafety-'
API = 'http://openapi.foodsafetykorea.go.kr/api/{key}/COOKRCP01/json/{start}/{end}'
PAGE = 1000  # API 한 번에 최대 1000개
STEPS = 20  # MANUAL01 ~ MANUAL20


def item_labels(ontology_dir: Path = DATA / 'ontology') -> list[tuple[str, str]]:
    """온톨로지 YAML에서 품목의 한국어 라벨을 (라벨, 품목 ID)로 모아요. DB 없이 동작."""
    labels = []
    for path in sorted(ontology_dir.glob('*.yaml')):
        for entity in (yaml.safe_load(path.read_text(encoding='utf-8')) or {}).get('entities', []):
            if entity.get('type') != 'item':
                continue
            for label in (entity.get('labels') or {}).get('ko', []):
                labels.append((label, entity['id']))
    # 긴 라벨부터 (예: '대파'가 '파'보다 먼저)
    return sorted(set(labels), key=lambda x: (-len(x[0]), x[0], x[1]))


def match_items(text: str, labels: list[tuple[str, str]]) -> list[str]:
    """재료 글에서 우리 품목을 찾아요.

    한 글자 라벨('파', '배')은 앞뒤가 한글이 아닐 때만 인정해요.
    ('배추'의 '배', '파프리카'·'쪽파'의 '파'가 품목으로 잡히지 않게)
    """
    occupied: set[int] = set()
    found: set[str] = set()
    for label, item_id in labels:
        if len(label) == 1:
            pattern = rf'(?<![가-힣]){re.escape(label)}(?![가-힣])'
        else:
            pattern = re.escape(label)
        for match in re.finditer(pattern, text):
            span = set(range(*match.span()))
            if not occupied & span:
                occupied |= span
                found.add(item_id)
    return sorted(found)


def _clean(value) -> str:
    text = re.sub(r'<[^>]+>', ' ', str(value or ''))  # 혹시 섞인 HTML 태그 제거
    return re.sub(r'[ \t\r\f\v]+', ' ', text).strip()


def _ingredients(parts: str) -> list[str]:
    lines = []
    for piece in re.split(r'[,\n]', _clean(parts)):
        piece = re.sub(r'^[●•·\-\s]+', '', piece).strip()
        if piece:
            lines.append(piece)
    return lines


def _lines(value) -> list[str]:
    """여러 줄·글머리(●•·-) 글을 한 줄씩으로."""
    lines = []
    for piece in str(value or '').split('\n'):
        piece = re.sub(r'^[●•·\-\s]+', '', _clean(piece)).strip()
        if piece:
            lines.append(piece)
    return lines


def _step(text: str) -> str:
    text = _clean(str(text or '').replace('\n', ' '))
    text = re.sub(r'^\d+\s*[.)]\s*', '', text)  # 앞 번호 "1."
    return re.sub(r'(?<=[가-힣.!?)\]%])[a-z]$', '', text).strip()  # 끝의 사진 표시 "a"


def render(row: dict, items: list[str]) -> str:
    """양식(data/templates/recipe.md)과 같은 모양의 md. 같은 입력이면 항상 같은 결과."""
    meta = {
        'source': SOURCE_KEY,
        'doc_type': 'recipe',
        'lang': 'ko',
        'title': _clean(row.get('RCP_NM')),
        'entities': items,
        'store_id': None,
    }
    info = []
    if _clean(row.get('RCP_PAT2')):
        info.append(f'요리 종류: {_clean(row["RCP_PAT2"])}')
    if _clean(row.get('RCP_WAY2')):
        info.append(f'조리 방법: {_clean(row["RCP_WAY2"])}')
    if _clean(row.get('INFO_ENG')):
        info.append(f'열량: {_clean(row["INFO_ENG"])}kcal')
    steps = [_step(row.get(f'MANUAL{i:02d}')) for i in range(1, STEPS + 1)]
    steps = [step for step in steps if step]
    body = ['> 식품안전나라 레시피 DB 자동 변환 · 검수 전', '']
    if info:
        body += [' · '.join(info), '']
    body += ['## 재료', *[f'- {line}' for line in _ingredients(row.get('RCP_PARTS_DTLS'))], '']
    body += ['## 만드는 법', *[f'{n}. {s}' for n, s in enumerate(steps, 1)], '']
    tips = _lines(row.get('RCP_NA_TIP'))
    if tips:
        body += ['## 팁', *[f'- {tip}' for tip in tips], '']
    body.append('출처: 조리식품의 레시피 DB (식품의약품안전처 식품안전나라)')
    front = yaml.safe_dump(meta, allow_unicode=True, sort_keys=False, default_flow_style=None)
    return f'---\n{front}---\n' + '\n'.join(body) + '\n'


def select(rows, labels, *, only_items=None, max_per_item=5):
    """우리 품목이 들어간 레시피만, 품목마다 최대 max_per_item개 (레시피 번호 순)."""
    chosen, per_item = {}, Counter()

    def order(row):
        seq = str(row.get('RCP_SEQ') or '').strip()
        return (0, int(seq)) if seq.isdigit() else (1, 0)

    for row in sorted(rows, key=order):
        seq = str(row.get('RCP_SEQ') or '').strip()
        if not seq.isdigit() or not _clean(row.get('RCP_NM')):
            continue
        items = match_items(_clean(row.get('RCP_PARTS_DTLS')), labels)
        if only_items:
            items = [i for i in items if i in only_items]
        wanted = [i for i in items if per_item[i] < max_per_item]
        if not wanted:
            continue
        per_item.update(wanted)
        chosen[seq] = (row, items)
    return chosen


def write_docs(chosen, out_dir: Path = OUT_DIR, *, prune=False) -> Counter:
    out_dir.mkdir(parents=True, exist_ok=True)
    counts = Counter()
    keep = set()
    for seq, (row, items) in chosen.items():
        path = out_dir / f'{PREFIX}{seq}.md'
        keep.add(path.name)
        text = render(row, items)
        if path.exists() and path.read_text(encoding='utf-8') == text:
            counts['skipped'] += 1
            continue
        counts['changed' if path.exists() else 'added'] += 1
        path.write_text(text, encoding='utf-8', newline='\n')
    if prune:
        # 이 스크립트가 만든 파일만 지워요 (손으로 쓴 레시피는 그대로)
        for path in out_dir.glob(f'{PREFIX}*.md'):
            if path.name not in keep:
                path.unlink()
                counts['deleted'] += 1
    return counts


def rows_from_file(path: Path) -> list[dict]:
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    body = data.get('COOKRCP01', data) if isinstance(data, dict) else {'row': data}
    return list(body.get('row') or [])


def rows_from_api(parts: str | None = None, *, key: str | None = None) -> list[dict]:
    key = key or settings.FOODSAFETY_KEY
    if not key:
        raise RuntimeError('FOODSAFETY_KEY가 필요합니다 (.env).')
    suffix = f'/RCP_PARTS_DTLS={quote(parts)}' if parts else ''
    # 키가 주소 안에 들어가는 API라, 요청 로그(httpx INFO)에 키가 찍히지 않게 잠시 낮춰요
    httpx_log = logging.getLogger('httpx')
    level = httpx_log.level
    httpx_log.setLevel(logging.WARNING)
    try:
        return _fetch_pages(key, suffix)
    finally:
        httpx_log.setLevel(level)


def _fetch_pages(key: str, suffix: str) -> list[dict]:
    rows, start, total = [], 1, None
    while total is None or start <= total:
        url = API.format(key=quote(key, safe=''), start=start, end=start + PAGE - 1) + suffix
        try:
            data = http.get_sync(url, timeout=30.0).json()['COOKRCP01']
        except Exception as exc:
            message = str(exc).replace(key, '***').replace(quote(key, safe=''), '***')
            raise RuntimeError(f'식품안전나라 호출 실패: {message}') from None
        code = (data.get('RESULT') or {}).get('CODE')
        if code == 'INFO-200':  # 해당하는 데이터 없음
            break
        if code != 'INFO-000':
            raise RuntimeError(f'식품안전나라 응답 오류: {code}')
        total = int(data.get('total_count') or 0)
        rows += data.get('row') or []
        start += PAGE
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--from-file', type=Path, help='식품안전나라 응답 JSON 파일')
    source.add_argument('--from-api', action='store_true', help='FOODSAFETY_KEY로 직접 호출')
    parser.add_argument('--parts', help='API 재료 검색어 (예: 대파). --from-api에서만')
    parser.add_argument('--items', help='품목 ID 쉼표 목록 (예: item:green_onion,item:onion)')
    parser.add_argument('--max-per-item', type=int, default=5)
    parser.add_argument('--prune', action='store_true', help='이번에 안 고른 자동 생성 파일 삭제')
    args = parser.parse_args()
    rows = rows_from_file(args.from_file) if args.from_file else rows_from_api(args.parts)
    only = set(args.items.split(',')) if args.items else None
    chosen = select(rows, item_labels(), only_items=only, max_per_item=args.max_per_item)
    counts = write_docs(chosen, prune=args.prune)
    print(f'레시피 {len(rows)}개 중 우리 품목이 들어간 {len(chosen)}개 → {OUT_DIR}')
    summary('recipes', counts)
    print('다음: python -m scripts.load_sources && python -m scripts.load_documents')


if __name__ == '__main__':
    run(main)
