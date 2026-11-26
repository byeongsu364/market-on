"""Pipeline fixtures never fetch public APIs or connect to the application database."""

from contextlib import nullcontext
from pathlib import Path
from unittest.mock import Mock

import pytest
import yaml

from scripts import pipeline as p

DATA = Path(__file__).resolve().parents[2] / 'data'


@pytest.fixture
def data(tmp_path):
    (tmp_path / 'ontology').mkdir()
    (tmp_path / 'ontology/items.yaml').write_text(
        yaml.safe_dump(
            {
                'entities': [
                    {'id': 'item:apple', 'type': 'item', 'name_ko': '사과', 'relations': []},
                ]
            }
        )
    )
    (tmp_path / 'sources.yaml').write_text(
        '# fdmtSn 123\nsrc:apple:\n  title: 사과\n  license: 제한 없음\n# fdmtSn 999\nsrc:unknown:\n  title: 미확인\n  license: 확인 필요\n'
    )
    (tmp_path / 'rag_docs').mkdir()
    (tmp_path / 'rag_docs/apple.md').write_text(
        '---\nsource: src:apple\ndoc_type: storage\nlang: ko\ntitle: 사과 보관\nentities: [item:apple]\n---\n0℃에 두어요.\n'
    )
    return tmp_path


def test_collect_clean_license_and_resume(data):
    fetch = Mock(
        return_value={
            'response': {'body': {'stdInfo': {'cstdyMthDtl': '<p>■ 0°C</p><p>- 2㎏</p>'}}}
        }
    )
    report = p.run_pipeline(data_dir=data, end='clean', fetch=fetch)
    fetch.assert_called_once_with('123')
    assert len(report['results']['collect']['skipped']) == 1
    assert (data / 'raw/nics/123.json').exists()
    assert not (data / 'raw/nics/999.json').exists()
    text = (data / 'raw/clean/apple.md').read_text()
    assert '0℃' in text and '2kg' in text and '<p>' not in text
    resumed = p.run_pipeline(data_dir=data, start='chunk', end='review', offline=True)
    assert resumed['results']['chunk']['chunks'] == 1
    assert resumed['results']['review']['found'] == 1
    assert 'src:apple' in (data / 'raw/LICENSES.md').read_text()


def test_clean_html_and_units():
    text = p.clean_text('&lt;p&gt;■ 3°C&lt;br&gt;- 2㎏ 3천원</p><script>secret</script>')
    assert '3℃' in text and '2kg' in text and '\n' in text
    assert 'secret' not in text
    assert not p.license_ok('제한 없음 여부 확인 필요')


def test_normalize_excludes_missing_unknown_and_bad_frontmatter(data):
    for name, content in [('missing', 'entities: []'), ('unknown', 'entities: [item:mango]')]:
        (data / f'rag_docs/{name}.md').write_text(
            f'---\nsource: src:apple\ndoc_type: prep\nlang: ko\ntitle: 손질\n{content}\n---\n씻어요.'
        )
    (data / 'rag_docs/broken.md').write_text('no frontmatter')
    docs, info = p.normalize(p.paths(data))
    assert [d.doc_key for d in docs] == ['apple.md']
    assert len(info['excluded']) == 3


def test_chunk_jsonl_review(data):
    paths = p.paths(data)
    docs, _ = p.normalize(paths)
    rows = p.chunk_rows(docs, p.ontology_index(paths['ontology']))
    p.write_jsonl(data / 'build/chunks.jsonl', rows)
    row = p.read_jsonl(data / 'build/chunks.jsonl')[0]
    assert {'item_ids', 'node_type', 'intent', 'variety_id', 'numbers', 'chunk_hash'} <= row.keys()
    assert row['intent'] == 'store' and row['item_ids'] == ['item:apple']
    assert p.review_rows(rows, paths['clean'])[0]['status'] == 'no_source'
    paths['clean'].mkdir(parents=True)
    (paths['clean'] / 'apple.md').write_text('10℃')
    assert p.review_rows(rows, paths['clean'])[0]['status'] == 'missing'
    (paths['clean'] / 'apple.md').write_text('0℃')
    assert p.review_rows(rows, paths['clean'])[0]['status'] == 'found'
    rows[0]['numbers'] = ['0°C', '0도']
    assert all(c['status'] == 'found' for c in p.review_rows(rows, paths['clean']))


def test_block_load_and_filtered_documents(data, monkeypatch):
    from scripts import load_all

    load = Mock(return_value={})
    monkeypatch.setattr(load_all, 'load_all', load)
    (data / 'sources.yaml').write_text('src:apple: {license: ""}')
    conn = Mock(transaction=nullcontext)
    conn.execute.return_value.fetchone.return_value = (10, 2)
    report = p.run_pipeline(data_dir=data, start='load', conn=conn)
    assert len(report['checks']) == 4 and report['results']['load']['blocked_by']
    load.assert_not_called()
    (data / 'sources.yaml').write_text('src:apple: {license: 제한 없음}')
    (data / 'rag_docs/no-id.md').write_text(
        '---\nsource: src:apple\ndoc_type: prep\nlang: ko\ntitle: 제외\n---\n씻어요.'
    )
    p.run_pipeline(data_dir=data, start='load', end='load', conn=conn)
    assert [d.doc_key for d in load.call_args.kwargs['documents']] == ['apple.md']


def test_ontology_relation_and_duplicate_checks(data):
    paths = p.paths(data)
    index = p.ontology_index(paths['ontology'])
    row = {
        'doc_key': 'x',
        'item_ids': [],
        'node_type': 'storage',
        'chunk_hash': 'same',
        'content': 'x',
    }
    assert not p.check_ontology([row], [], index)['ok']
    assert not p.check_duplicates([row, row])['ok']
    # 구조 관계(분류·품종·판매 단위)는 출처 없이도 통과, 사실 관계는 출처가 있어야 해요
    index['entities']['item:apple']['relations'] = [
        {'p': 'isA', 'o': 'cat:fruit'},
        {'p': 'hasGrade', 'o': 'variety:apple-fuji'},
        {'p': 'soldBy', 'o': 'unit:piece'},
    ]
    assert p.check_sources(paths, [], index)['ok']
    index['entities']['item:apple']['relations'] = [{'p': 'inSeason', 'o': 'season:11'}]
    assert not p.check_sources(paths, [], index)['ok']


def test_stale_cache_preserves_current_other_and_quota(monkeypatch):
    from app.db.repositories import ask_repo, store_repo
    from app.knowledge.answer_cache import document_digest

    monkeypatch.setattr(ask_repo, 'document_version', lambda c, i: [i])
    monkeypatch.setattr(store_repo, 'market_items', lambda *a: [{'item_id': 'item:apple'}])
    current = document_digest(['item:apple'])
    other = document_digest(['item:pear'])
    rec = document_digest([('item:apple', ['item:apple'])])
    keys = [
        f'ask:item:apple:store:ko:2026-11-27:{current}:hash',
        'ask:item:apple:store:ko:2026-11-27:old:hash',
        f'ask:item:pear:store:ko:2026-11-27:{other}:hash',
        f'recommend:v2:market:demo:선물:가족:2:10000:2026-11-27:{rec}',
        'recommend:v2:market:demo:선물:가족:2:10000:2026-11-27:old',
        'ask-rate:quota:x',
    ]
    conn = Mock(transaction=nullcontext)
    conn.execute.return_value.fetchall.return_value = [(k,) for k in keys]
    conn.execute.return_value.rowcount = 1
    assert p.stale_cache_rows(conn) == 2
    deleted = [c.args[1][0] for c in conn.execute.call_args_list if c.args[0].startswith('delete')]
    assert deleted == [keys[1], keys[4]]


def test_questions_have_actual_documents_and_coverage():
    questions = yaml.safe_load((DATA / 'eval/questions.yaml').read_text())['questions']
    assert len(questions) == 35
    assert len({q['id'] for q in questions}) == 35
    # 범위 밖 5개: 지어내지 않은 안전한 응답 종류 목록, 모두 no_evidence를 포함
    outside = [q for q in questions[:30] if q.get('expect')]
    assert len(outside) == 5 and all('no_evidence' in q['expect'] for q in outside)
    for q in questions[:25]:
        text = (DATA / 'rag_docs' / q['doc_key']).read_text()
        assert q['item_id'] in text
        assert p.DOC_TYPE_TO_INTENT[yaml.safe_load(text.split('---')[1])['doc_type']] == q['intent']


def test_collect_fixture_and_unknown_license(tmp_path):
    paths = p.paths(tmp_path)
    paths['sources'].write_text(
        "# fdmtSn 36\nsrc:allowed: {license: '제한 없음', title: 대파}\n# fdmtSn 74\nsrc:unknown: {license: '확인 필요'}\n"
    )
    fetch = Mock(return_value={'response': {'body': {'stdInfo': {'cstdyMthDtl': '<p>냉장</p>'}}}})
    report = p.collect(paths, fetch=fetch)
    fetch.assert_called_once_with('36')
    assert report['collected'] == ['src:allowed']
    assert len(report['skipped']) == 1
    assert (paths['raw'] / 'nics/36.json').exists()


def test_load_receives_only_normalized_documents(data, monkeypatch):
    from scripts import load_all

    (data / 'rag_docs/no-id.md').write_text(
        '---\nsource: src:apple\ndoc_type: prep\nlang: ko\ntitle: 손질\n---\n씻어요.'
    )
    load = Mock(return_value={})
    monkeypatch.setattr(load_all, 'load_all', load)
    conn = Mock(transaction=nullcontext)
    conn.execute.return_value.fetchone.return_value = (0, 0)
    report = p.run_pipeline(data_dir=data, start='load', end='load', conn=conn)
    assert not report.get('failed')
    assert [d.doc_key for d in load.call_args.kwargs['documents']] == ['apple.md']
