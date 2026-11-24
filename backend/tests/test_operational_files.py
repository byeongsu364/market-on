"""Offline operational configuration and reference-safe pruning checks."""

from contextlib import nullcontext
from unittest.mock import Mock
from pathlib import Path
import pytest
from app.core.config import Settings
from app.db.repositories import knowledge_repo as repo


def test_media_default():
    config = Settings(_env_file=None)
    assert config.MEDIA_DIR == Path(__file__).resolve().parents[1] / 'storage'
    assert config.MEDIA_DIR.is_absolute()
    assert {
        'DATA_GO_KR_KEY',
        'FOODSAFETY_KEY',
        'NAVER_MAP_CLIENT_ID',
        'NAVER_MAP_CLIENT_SECRET',
    } <= Settings.model_fields.keys()


@pytest.mark.parametrize(
    'child,column',
    [
        ('store_items', 'item_id'),
        ('price_observations', 'variety_id'),
        ('closing_sales', 'unit_id'),
    ],
)
def test_prune_keeps_referenced_entity(child, column, capsys):
    conn = Mock()
    conn.execute.side_effect = [
        Mock(fetchall=lambda: [('public', child, column)]),
        Mock(fetchone=lambda: ('item:protected',)),
        Mock(fetchone=lambda: (1,)),
    ]
    assert repo._prune_unreferenced(conn, 'entities', 'id', ['item:protected']) == 0
    assert conn.execute.call_count == 3
    assert f'{child}.{column}' in capsys.readouterr().err


def test_prune_keeps_referenced_source(capsys):
    conn = Mock()
    conn.execute.side_effect = [
        Mock(fetchall=lambda: [('public', 'documents', 'source_id')]),
        Mock(fetchone=lambda: (42,)),
        Mock(fetchone=lambda: (1,)),
    ]
    assert repo._prune_unreferenced(conn, 'sources', 'source_key', ['src:protected']) == 0
    assert 'src:protected' in capsys.readouterr().err


@pytest.mark.parametrize('prune', [False, True])
def test_load_all_prune_order(monkeypatch, tmp_path, prune):
    from scripts import load_all as loader

    events = []
    (tmp_path / 'sources.yaml').write_text('{}')
    for name in ('load_sources', 'load_ontology', 'load_documents'):
        monkeypatch.setattr(
            loader, name, lambda *a, _name=name, **kw: events.append((_name, kw)) or {}
        )
    monkeypatch.setattr(loader, 'ontology_ids', lambda directory: {'item:kept'})
    monkeypatch.setattr(
        repo, 'prune_entities', lambda *a: events.append(('prune_entities', {})) or 0
    )
    monkeypatch.setattr(repo, 'prune_sources', lambda *a: events.append(('prune_sources', {})) or 0)
    loader.load_all(Mock(transaction=nullcontext), data_dir=tmp_path, embed=False, prune=prune)
    assert [e[0] for e in events] == ['load_sources', 'load_ontology', 'load_documents'] + (
        ['prune_entities', 'prune_sources'] if prune else []
    )
    assert events[1][1]['cleanup'] is not prune
    assert events[2][1]['prune'] is prune


@pytest.mark.parametrize(
    'se_cd,name,expected',
    [
        ('02', '경동', 'wholesale'),
        ('01', '서울-유통', 'large_retail'),
        ('01', '역전', 'traditional'),
        ('01', '복조리', 'unknown'),
    ],
)
def test_market_type(se_cd, name, expected):
    from app.utils.market_type import classify_market_type

    assert classify_market_type(se_cd, name) == expected


def test_prune_deletes_unreferenced_entity_and_invalidates_cache(monkeypatch):
    conn = Mock()
    conn.execute.side_effect = [
        Mock(fetchall=lambda: [('public', 'store_items', 'item_id')]),
        Mock(fetchone=lambda: ('item:removed',)),
        Mock(fetchone=lambda: None),
        Mock(),
        Mock(),
    ]
    invalidate = Mock()
    monkeypatch.setattr(repo, 'invalidate_cache_for_entity', invalidate)
    assert repo._prune_unreferenced(conn, 'entities', 'id', ['item:removed']) == 1
    invalidate.assert_called_once_with(conn, 'item:removed')
    assert conn.execute.call_count == 5


def test_prune_chunk_only_reference_retags_and_deletes(monkeypatch):
    conn = Mock()
    conn.execute.side_effect = [
        Mock(fetchall=lambda: [('public', 'chunk_entities', 'entity_id')]),
        Mock(fetchone=lambda: ('item:removed',)),
        Mock(),
        Mock(),
    ]
    monkeypatch.setattr(repo, 'invalidate_cache_for_entity', Mock())
    assert repo._prune_unreferenced(conn, 'entities', 'id', ['item:removed']) == 1
    assert 'retag:' in conn.execute.call_args_list[2].args[0]
