"""Validate repository sample inputs without requiring PostgreSQL."""

import csv
import io
import pytest

yaml = pytest.importorskip('yaml')
from scripts.load_documents import read_document
from scripts._common import DATA
from app.knowledge.ingest import chunk_document


def test_sample_formats_and_kamis():
    sources = yaml.safe_load((DATA / 'sources.yaml').read_text())
    entities = [
        e
        for path in sorted((DATA / 'ontology').glob('*.yaml'))
        for e in yaml.safe_load(path.read_text())['entities']
    ]
    # 기존 엔터티 16개 + 품종 7개
    assert len(entities) == 23
    assert sum(e['type'] == 'category' for e in entities) == 2
    assert sum(e['type'] == 'store_category' for e in entities) == 6
    # 품목 KAMIS 코드는 aT 소매 품목코드표(신태빈 정리, 2026-11-20)에 실제로 있는 조합이어야 해요
    code_table = list(
        csv.DictReader(
            io.StringIO((DATA / 'kamis/aT_소매_품목코드표_20261120.csv').read_text('utf-8-sig'))
        )
    )
    known = {(r['부류코드'], r['품목코드'], r['품종코드']) for r in code_table}
    for entity in entities:
        if entity['type'] in ('item', 'variety'):
            kamis = entity['kamis']
            assert (kamis['ctgry_cd'], kamis['item_cd'], kamis['vrty_cd']) in known, entity['id']
            assert kamis['grd_cd'] == '04'
            code_row = next(
                r
                for r in code_table
                if (r['부류코드'], r['품목코드'], r['품종코드'])
                == (kamis['ctgry_cd'], kamis['item_cd'], kamis['vrty_cd'])
            )
            assert kamis['unit_sz'] + kamis['unit'] == code_row['조사단위(대표)']
        else:
            assert entity.get('kamis') is None
    directory = DATA / 'rag_docs'
    docs = [read_document(path, directory) for path in directory.rglob('*.md')]
    # 품목 5개 × (고르는 법·보관·손질·제철) + 연습용 긴 레시피 1개
    assert len(docs) == 21
    for kind in ('criterion', 'storage', 'prep', 'season'):
        assert sum(doc.doc_type == kind for doc in docs) == 5
    for doc in docs:
        assert doc.source_key in sources
        assert not doc.doc_key.startswith('/')
        # 판정 문구 금지 (검수 표시 줄은 팀이 검수 후 지움 — 있어도 없어도 됨)
        assert not any(word in doc.body for word in ('구매 추천', 'A등급', '신선해요'))
    long = next(doc for doc in docs if doc.doc_type == 'recipe')
    assert len(long.body) >= 1500 and long.body.count('## ') >= 3
    assert len(chunk_document(long)) > 3


def test_frontmatter_diagnostics(tmp_path):
    path = tmp_path / 'bad.md'
    path.write_text('body without frontmatter')
    with pytest.raises(ValueError, match='bad.md:'):
        read_document(path, tmp_path)


def test_frontmatter_metadata(tmp_path):
    from datetime import date

    path = tmp_path / 'metadata.md'
    path.write_text(
        '---\nsource: src:team-draft\ndoc_type: guide\nlang: ko\ntitle: 안내\nmarket_id: market:sample\npublished: 2026-11-22\n---\n샘플 · 검수 전'
    )
    doc = read_document(path, tmp_path)
    assert doc.market_id == 'market:sample'
    assert doc.published == date(2026, 11, 22)


def test_criterion_expansion_without_db(monkeypatch):
    from contextlib import nullcontext
    from unittest.mock import Mock
    from scripts.load_ontology import load_ontology
    from app.db.repositories import knowledge_repo as repo

    saved = {}
    relations = {}

    def upsert(conn, entity, edges):
        saved[entity['id']] = entity
        return 'added'

    monkeypatch.setattr(repo, 'entity_ids', lambda conn: set())
    monkeypatch.setattr(repo, 'source_id', lambda conn, key: 42)
    monkeypatch.setattr(repo, 'upsert_entity', upsert)
    monkeypatch.setattr(
        repo, 'replace_relations', lambda conn, eid, edges: relations.update({eid: edges})
    )
    prune = Mock(return_value=0)
    monkeypatch.setattr(repo, 'prune_generated_criteria', prune)
    conn = Mock(transaction=nullcontext)
    counts = load_ontology(conn)
    assert counts['added'] == 26  # 품종 7개 + 자동 확인 포인트 3개 포함
    assert saved['variety:apple-hongro']['type'] == 'variety'
    assert ('hasGrade', 'variety:apple-fuji', None, None, {'default': True}) in relations[
        'item:apple'
    ]
    assert ('hasGrade', 'variety:apple-hongro', None, None, None) in relations['item:apple']
    criterion = saved['crit:green_onion-leaf']
    assert criterion['type'] == 'criterion'
    assert criterion['name_ko'] == '잎 끝이 마르지 않고 누런 잎이 없어요'
    assert criterion['source'] == 'src:team-draft'
    assert criterion['labels']['en'] == ['Healthy leaves']
    assert ('hasCriterion', 'crit:green_onion-leaf', None, 42, None) in relations[
        'item:green_onion'
    ]
    assert ('soldBy', 'unit:bunch', None, 42, {'factor_kg': 0.8, 'default': True}) in relations[
        'item:green_onion'
    ]
    assert len(prune.call_args.args[1]) == 3
