"""Offline contracts for review metadata and bounded graph traversal."""

from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.db.repositories import ask_repo, ontology_repo
from app.deps import get_db
from app.knowledge.citation import attach_citations
from app.knowledge.fact_check import extract_numbers
from app.main import app


def test_original_number_spellings():
    assert extract_numbers('0℃, 90~95%, 한두 달, 0℃') == ['0℃', '90~95%', '한두 달']


@pytest.mark.parametrize(
    'status,marker,expected',
    [
        ('draft', '', True),
        ('rejected', '', True),
        ('reviewed', '', False),
        ('reviewed', '> 초안 · 검수 전', True),
    ],
)
def test_review_citations(monkeypatch, status, marker, expected):
    monkeypatch.setattr(
        ask_repo,
        'sources',
        lambda *args: [
            {
                'title': '자료',
                'publisher': None,
                'url': None,
                'license': None,
                'body': marker,
                'review_status': status,
            }
        ],
    )
    result = attach_citations(None, [SimpleNamespace(chunk_id=1)])
    assert result[0]['draft'] is expected
    assert 'review_status' not in result[0]


def test_frontmatter_review_and_varieties(tmp_path):
    from scripts.load_documents import read_document

    path = tmp_path / 'sample.md'
    path.write_text(
        '---\nsource: src:test\ndoc_type: storage\nlang: ko\ntitle: 자료\n'
        'review_status: reviewed\nvarieties: [variety:apple-fuji]\n---\n0℃'
    )
    doc = read_document(path, tmp_path)
    assert doc.review_status == 'reviewed'
    assert doc.varieties == ['variety:apple-fuji']


def test_graph_depth_and_limit(monkeypatch):
    records = (
        [{'id': 'item:test', 'type': 'item'}]
        + [{'id': f'store:{i}', 'type': 'store'} for i in range(250)]
        + [{'id': 'market:test', 'type': 'market'}]
    )
    monkeypatch.setattr(
        ontology_repo, 'nodes', lambda conn, ids: [r for r in records if r['id'] in ids]
    )

    def adjacent(conn, frontier):
        if frontier == ['item:test']:
            return [{'subj': 'item:test', 'pred': 'sells', 'obj': f'store:{i}'} for i in range(250)]
        return [{'subj': frontier[0], 'pred': 'contains', 'obj': 'market:test'}]

    monkeypatch.setattr(ontology_repo, 'adjacent', adjacent)
    limited = ontology_repo.graph(None, 'item:test', 2)
    assert len(limited['nodes']) <= 200 and len(limited['edges']) <= 200
    records = records[:2] + records[-1:]
    monkeypatch.setattr(
        ontology_repo,
        'adjacent',
        lambda conn, ids: [
            {'subj': 'item:test', 'pred': 'sells', 'obj': 'store:0'}
            if ids == ['item:test']
            else {'subj': 'store:0', 'pred': 'contains', 'obj': 'market:test'}
        ],
    )
    assert len(ontology_repo.graph(None, 'item:test', 1)['nodes']) == 2
    assert len(ontology_repo.graph(None, 'item:test', 2)['nodes']) == 3


def test_graph_public_api(monkeypatch):
    graph = Mock(return_value={'nodes': [], 'edges': []})
    monkeypatch.setattr(ontology_repo, 'graph', graph)
    app.dependency_overrides[get_db] = lambda: None
    try:
        with TestClient(app) as client:
            assert client.get('/ontology/items/item:test/graph').json() == {
                'nodes': [],
                'edges': [],
            }
            assert graph.call_args.args == (None, 'item:test', 1)
            assert client.get('/ontology/items/item:test/graph?depth=2').status_code == 200
            for depth in (0, 3):
                assert (
                    client.get(f'/ontology/items/item:test/graph?depth={depth}').status_code == 422
                )
            graph.return_value = None
            assert client.get('/ontology/items/item:missing/graph').status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize(
    'body,explicit,expected',
    [
        ('후지 0℃ 90~95% 한두 달', [], 'variety:fuji'),
        ('후지와 홍로', [], None),
        ('이름 없는 보관 문서', [], None),
        ('이름 없는 보관 문서', ['variety:fuji'], 'variety:fuji'),
        ('후지 보관', ['variety:fuji', 'variety:hongro'], 'variety:fuji'),
        ('후지와 홍로', ['variety:fuji', 'variety:hongro'], None),
    ],
)
def test_ingestion_metadata(monkeypatch, body, explicit, expected):
    from contextlib import nullcontext

    from app.db.repositories import knowledge_repo as repo
    from app.knowledge.ingest import upsert_document
    from app.schemas.knowledge import Document

    saved = []
    monkeypatch.setattr(repo, 'lock_document', lambda *a: None)
    monkeypatch.setattr(repo, 'find_document', lambda *a: None)
    monkeypatch.setattr(repo, 'entity_names', lambda *a: ['사과'])
    monkeypatch.setattr(repo, 'document_varieties', lambda *a: {'variety:fuji', 'variety:hongro'})
    monkeypatch.setattr(
        repo,
        'ko_variety_labels',
        lambda *a: [('후지', 'variety:fuji', '후지'), ('홍로', 'variety:hongro', '홍로')],
    )
    monkeypatch.setattr(repo, 'label_dictionary', lambda *a: [])
    monkeypatch.setattr(repo, 'insert_document', lambda *a: 1)
    monkeypatch.setattr(
        repo, 'insert_chunk', lambda conn, did, doc, chunk, digest: saved.append(chunk) or 1
    )
    monkeypatch.setattr(repo, 'invalidate_cache_for_entity', lambda *a: None)
    doc = Document(
        'sample',
        'src:test',
        'storage',
        'ko',
        '보관',
        body,
        entities=['item:apple'],
        varieties=explicit,
        review_status='rejected',
    )
    upsert_document(SimpleNamespace(transaction=nullcontext), doc)
    assert saved[0].variety_id == expected
    assert saved[0].numbers == extract_numbers(body)


def test_sql_intent_mapping_matches_python():
    import re
    from pathlib import Path

    from app.knowledge.intents import DOC_TYPE_TO_INTENT

    migration = (Path(__file__).parents[1] / 'migrations/0021_onto_views.sql').read_text()
    case = migration.split('case c.doc_type', 1)[1].split('end as intent', 1)[0]
    assert dict(re.findall(r"when '([^']+)' then '([^']+)'", case)) == DOC_TYPE_TO_INTENT
