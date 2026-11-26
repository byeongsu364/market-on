"""식품안전나라 레시피 → RAG 문서 변환 (네트워크 없이, 테스트용 가짜 응답으로)."""

import json
import logging

import pytest

from app.core import http
from scripts import import_recipes as ir
from scripts.load_documents import read_document


def row(seq, name, parts, steps=(), **extra):
    value = {'RCP_SEQ': str(seq), 'RCP_NM': name, 'RCP_PARTS_DTLS': parts}
    for i, step in enumerate(steps, 1):
        value[f'MANUAL{i:02d}'] = step
    return value | extra


ROWS = [
    row(
        10,
        '테스트 대파 달걀볶음',
        '대파 50g(1/2대), 달걀 100g(2개)\n●양념 : 소금 약간',
        ['1. 대파는 송송 썰어요.a', '2. 달걀을 풀어 함께 볶아요.b', ''],
        RCP_PAT2='반찬',
        RCP_WAY2='볶기',
        INFO_ENG='150',
        RCP_NA_TIP='소금 대신 <b>대파</b> 향으로 간을 줄여요.',
    ),
    row(11, '테스트 배추겉절이', '배추 200g, 고춧가루 5g', ['1. 배추를 절여요.']),
    row(12, '테스트 파프리카 볶음', '파프리카 100g, 쪽파 10g', ['1. 볶아요.']),
    row(
        13,
        '테스트 사과 양파 샐러드',
        '사과 1/2개, 양파 1/4개, 배 1/4개',
        ['1. 사과와 양파는\n얇게 썰어요.'],
        RCP_NA_TIP='•첫째 팁이에요.\n•둘째 팁이에요.',
    ),
    row(14, '', '대파 10g', ['1. 이름 없는 레시피']),
]


def test_match_items_short_labels_need_boundaries():
    labels = ir.item_labels()
    assert ir.match_items('대파 50g, 파 10g', labels) == ['item:green_onion']
    assert ir.match_items('배추 200g, 파프리카 1개, 쪽파 10g', labels) == []
    assert ir.match_items('사과 1개, 배 1/4개', labels) == ['item:apple', 'item:pear']


def test_render_matches_template_and_loader(tmp_path):
    chosen = ir.select(ROWS, ir.item_labels())
    assert sorted(chosen) == ['10', '13']  # 배추·파프리카·쪽파는 우리 품목 아님, 이름 없는 건 제외
    counts = ir.write_docs(chosen, tmp_path)
    assert counts['added'] == 2
    text = (tmp_path / 'foodsafety-10.md').read_text(encoding='utf-8')
    assert '## 재료\n- 대파 50g(1/2대)\n- 달걀 100g(2개)\n- 양념 : 소금 약간' in text
    assert '## 만드는 법\n1. 대파는 송송 썰어요.\n2. 달걀을 풀어 함께 볶아요.' in text
    assert '요리 종류: 반찬 · 조리 방법: 볶기 · 열량: 150kcal' in text
    assert '<b>' not in text and '## 팁' not in text
    assert '소금 대신' not in text
    assert text.splitlines()[-1] == '출처: 조리식품의 레시피 DB (식품의약품안전처 식품안전나라)'
    salad = (tmp_path / 'foodsafety-13.md').read_text(encoding='utf-8')
    assert '1. 사과와 양파는 얇게 썰어요.' in salad
    assert '## 팁' not in salad
    doc = read_document(tmp_path / 'foodsafety-13.md', tmp_path)
    assert doc.doc_type == 'recipe' and doc.source_key == ir.SOURCE_KEY
    assert doc.entities == ['item:apple', 'item:onion', 'item:pear']
    assert doc.title == '테스트 사과 양파 샐러드' and doc.store_id is None


def test_rerun_is_stable_and_prune_only_touches_generated(tmp_path):
    chosen = ir.select(ROWS, ir.item_labels())
    ir.write_docs(chosen, tmp_path)
    assert ir.write_docs(chosen, tmp_path) == {'skipped': 2}  # 같은 입력이면 다시 임베딩 안 함
    (tmp_path / 'hand-written.md').write_text('---\n---\n', encoding='utf-8')
    only_one = {'10': chosen['10']}
    counts = ir.write_docs(only_one, tmp_path, prune=True)
    assert counts['deleted'] == 1
    assert sorted(p.name for p in tmp_path.iterdir()) == ['foodsafety-10.md', 'hand-written.md']


def test_max_per_item_and_item_filter():
    many = [row(100 + i, f'대파 요리 {i}', '대파 10g', ['1. 끝']) for i in range(8)]
    assert len(ir.select(many, ir.item_labels(), max_per_item=3)) == 3
    assert ir.select(ROWS, ir.item_labels(), only_items={'item:pear'}) == {}


def test_rows_from_file_accepts_api_response(tmp_path):
    path = tmp_path / 'resp.json'
    path.write_text(
        json.dumps({'COOKRCP01': {'total_count': '2', 'row': ROWS[:2]}}, ensure_ascii=False),
        encoding='utf-8',
    )
    assert [r['RCP_SEQ'] for r in ir.rows_from_file(path)] == ['10', '11']


class FakeResponse:
    def __init__(self, data):
        self.data = data

    def json(self):
        return self.data


def test_api_pages_until_total(monkeypatch):
    urls = []

    def get(url, timeout):
        urls.append(url)
        start = int(url.split('/json/')[1].split('/')[0])
        rows = ROWS[:2] if start == 1 else ROWS[2:4]
        return FakeResponse(
            {
                'COOKRCP01': {
                    'total_count': '1500',
                    'row': rows,
                    'RESULT': {'CODE': 'INFO-000', 'MSG': '정상처리되었습니다.'},
                }
            }
        )

    monkeypatch.setattr(http, 'get_sync', get)
    monkeypatch.setattr(ir, 'PAGE', 1000)
    before = logging.getLogger('httpx').level
    rows = ir.rows_from_api('대파', key='SECRET-KEY')
    assert logging.getLogger('httpx').level == before  # 다른 로그 설정을 바꾸지 않음
    assert len(rows) == 4 and len(urls) == 2
    assert urls[0].endswith('/COOKRCP01/json/1/1000/RCP_PARTS_DTLS=%EB%8C%80%ED%8C%8C')


def test_api_error_never_shows_key(monkeypatch):
    def fail(url, timeout):
        raise RuntimeError(f'connection refused: {url}')

    monkeypatch.setattr(http, 'get_sync', fail)
    with pytest.raises(RuntimeError) as info:
        ir.rows_from_api(key='SECRET-KEY')
    assert 'SECRET-KEY' not in str(info.value) and '***' in str(info.value)


def test_api_needs_key(monkeypatch):
    monkeypatch.setattr(ir.settings, 'FOODSAFETY_KEY', None)
    with pytest.raises(RuntimeError, match='FOODSAFETY_KEY'):
        ir.rows_from_api()
