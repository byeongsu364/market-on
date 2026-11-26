"""Document-backed storage facts bypass models and embeddings."""

from pathlib import Path
from unittest.mock import Mock

import pytest
import yaml

from app.db.repositories import knowledge_repo
from app.schemas.ask import AskRequest
from app.services import ask_service

DATA = Path(__file__).resolve().parents[2] / 'data'


@pytest.fixture
def catalog(monkeypatch):
    facts = {
        e['id']: e for e in yaml.safe_load((DATA / 'ontology/items.yaml').read_text())['entities']
    }
    sources = yaml.safe_load((DATA / 'sources.yaml').read_text())

    def relations(conn, item_id):
        return [
            dict(
                object_value=r['v'],
                **{k: sources[r['source']][k] for k in ('title', 'publisher', 'url', 'license')},
            )
            for r in facts[item_id].get('relations', [])
            if r['p'] == 'storedAs'
        ]

    monkeypatch.setattr(knowledge_repo, 'storage_relations', relations)
    monkeypatch.setattr(knowledge_repo, 'get_item', lambda c, i: facts.get(i))
    return facts, sources


def test_storage_values_and_sources(catalog):
    facts, sources = catalog
    edges = [
        (e['id'], r) for e in facts.values() for r in e.get('relations', []) if r['p'] == 'storedAs'
    ]
    assert len(edges) == 4
    for item_id, edge in edges:
        assert edge['source'] in sources
        document = (DATA / 'rag_docs' / item_id.split(':')[1] / 'storage.md').read_text()
        # 출처는 문서 frontmatter 또는 문서 끝 '출처:' 줄에 있는 것만 (원문 대조 2026-11-27)
        title = sources[edge['source']]['title'].split(' (')[0].strip("'")
        assert f'source: {edge["source"]}' in document or title in document
        for number in [edge['v']['label'].split(' ')[0], edge['v'].get('period_label')]:
            if number:
                assert number in document
    assert [r['source'] for i, r in edges if i in ('item:apple', 'item:pear')] == [
        'src:rda-fruit-veg-storage-2023',
        'src:rda-fruit-veg-storage-2023',
    ]
    assert facts['item:apple']['relations'][0]['v']['temp_c'] == [0, 0]
    assert facts['item:pear']['relations'][0]['v']['humidity_pct'] == [90, 95]
    assert facts['item:sweet_persimmon']['relations'][0]['v']['temp_c'] == [0, 2]


@pytest.mark.parametrize(
    'question', ['사과 몇 도?', '사과 온도', '사과 며칠', '사과 얼마나', '사과 보관 기간']
)
def test_storage_without_models(catalog, monkeypatch, question):
    forbidden = Mock(side_effect=AssertionError('model or retrieval called'))
    monkeypatch.setattr(ask_service.ask_llm, 'classify', forbidden)
    monkeypatch.setattr(ask_service.ask_llm, 'generate', forbidden)
    monkeypatch.setattr(ask_service, 'get_embedder', forbidden)
    monkeypatch.setattr(ask_service.retriever, 'search', forbidden)
    monkeypatch.setattr(ask_service.answer_cache, 'cache_key', forbidden)
    result = ask_service.ask(
        None, AskRequest(question=question, item_id='item:apple'), 'd', consume=False
    )
    assert result.kind == 'answer' and result.model is None
    assert '0℃' in result.answer and '90~95%' in result.answer and '한두 달' not in result.answer
    assert len(result.citations) == 1
    forbidden.assert_not_called()


def test_missing_storage_uses_rag(catalog, monkeypatch):
    monkeypatch.setattr(ask_service.answer_cache, 'cache_key', lambda *a: 'key')
    monkeypatch.setattr(ask_service.answer_cache, 'get_cached_answer', lambda *a: None)
    search = Mock(return_value=[])
    monkeypatch.setattr(ask_service.retriever, 'search', search)
    result = ask_service.ask(
        None,
        AskRequest(question='양파 몇 도?', item_id='item:onion'),
        'd',
        consume=False,
        embedder=object(),
    )
    assert result.kind == 'no_evidence'
    search.assert_called_once()
