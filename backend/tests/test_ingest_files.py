"""Validate repository sample inputs without requiring PostgreSQL."""

import csv
import io

import pytest

yaml = pytest.importorskip('yaml')
from app.knowledge.ingest import chunk_document
from scripts._common import DATA
from scripts.load_documents import read_document


def test_sample_formats_and_kamis():
    sources = yaml.safe_load((DATA / 'sources.yaml').read_text())
    entities = [
        e
        for path in sorted((DATA / 'ontology').glob('*.yaml'))
        for e in yaml.safe_load(path.read_text())['entities']
    ]
    # 기존 41개 + 귤 품목 1개 + 품종 2개
    assert (
        len([e for e in entities if e['type'] != 'recipe']) == 292
    )  # 047: 기존 54 + 새 명시 엔터티 238
    assert sum(e['type'] == 'category' for e in entities) == 6
    assert sum(e['type'] == 'store_category' for e in entities) == 8
    # 품목 KAMIS 코드는 aT 소매 품목코드표(신태빈 정리, 2026-11-20)에 실제로 있는 조합이어야 해요
    code_table = list(
        csv.DictReader(
            io.StringIO((DATA / 'kamis/aT_소매_품목코드표_20261120.csv').read_text('utf-8-sig'))
        )
    )
    at = __import__('json').loads((DATA / 'kamis/at_retail_items_20261127.json').read_text())[
        'items'
    ]
    at_codes = {
        (i['ctgry_cd'], i['item_cd'], v['vrty_cd'], g['grd_cd'], g['unit'], g['unit_sz'])
        for i in at
        for v in i['varieties']
        for g in v['grades']
    }
    generated = {
        e['id'] for e in yaml.safe_load((DATA / 'ontology/items_at.yaml').read_text())['entities']
    }
    known = {(r['부류코드'], r['품목코드'], r['품종코드']) for r in code_table}
    for entity in entities:
        if entity['type'] in ('item', 'variety'):
            kamis = entity['kamis']
            if entity.get('attrs', {}).get('mock'):
                assert kamis is None
                continue
            if entity['id'] == 'variety:mandarin-greenhouse':
                # 041 지정 코드: 저장된 aT 코드표에는 시설(02) 행이 없어요.
                assert kamis == {
                    'ctgry_cd': '400',
                    'item_cd': '415',
                    'vrty_cd': '02',
                    'grd_cd': '15',
                    'unit': '개',
                    'unit_sz': '10',
                }
                continue
            assert (kamis['ctgry_cd'], kamis['item_cd'], kamis['vrty_cd']) in known or entity[
                'id'
            ] in generated, entity['id']
            if entity['id'] in generated:
                assert (
                    tuple(
                        kamis[k]
                        for k in ('ctgry_cd', 'item_cd', 'vrty_cd', 'grd_cd', 'unit', 'unit_sz')
                    )
                    in at_codes
                )
                continue
            # 감귤은 상품(04) 대신 M과(15)로 조사돼요
            assert kamis['grd_cd'] == ('15' if kamis['item_cd'] == '415' else '04')
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
    # 식품안전나라 레시피는 scripts.import_recipes가 만든 파일 (받은 만큼 늘어남)
    imported = [doc for doc in docs if doc.doc_key.startswith('recipes/foodsafety-')]
    assert all(
        doc.doc_type == 'recipe' and doc.source_key == 'src:foodsafety-cookrcp01' and doc.entities
        for doc in imported
    )
    # 품목 6개 × (고르는 법·보관·손질·품종 특징) + 연습용 긴 레시피 1개
    assert len(docs) - len(imported) == 58  # 047: 11품목 × 원문 문서 3종
    for kind in ('criterion', 'storage', 'prep', 'story'):
        assert sum(doc.doc_type == kind for doc in docs) == (6 if kind == 'story' else 17)
    for doc in docs:
        assert doc.source_key in sources
        assert not doc.doc_key.startswith('/')
        # 판정 문구 금지 (검수 표시 줄은 팀이 검수 후 지움 — 있어도 없어도 됨)
        assert not any(word in doc.body for word in ('구매 추천', 'A등급', '신선해요'))
    long = next(doc for doc in docs if doc.doc_key == 'practice/long_recipe.md')
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

    from app.db.repositories import knowledge_repo as repo
    from scripts.load_ontology import load_ontology

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
    assert counts['added'] == 332 + len(
        list((DATA / 'rag_docs/recipes').glob('foodsafety-*.md'))
    )  # 047: 명시 엔터티 292개 + 자동 확인 포인트 40개
    assert saved['variety:apple-hongro']['type'] == 'variety'
    assert saved['item:mandarin']['name_ko'] == '귤'
    assert ('hasGrade', 'variety:mandarin-open', None, None, {'default': True}) in relations[
        'item:mandarin'
    ]
    assert ('inSeason', 'season:12', None, 42, None) in relations['item:mandarin']
    for key in ('skin', 'shape', 'stem', 'gloss'):
        criterion_id = f'crit:mandarin-{key}'
        assert saved[criterion_id]['source'] == 'src:nics-month-food-mandarin'
        assert ('hasCriterion', criterion_id, None, 42, None) in relations['item:mandarin']
    assert ('hasGrade', 'variety:apple-fuji', None, None, {'default': True}) in relations[
        'item:apple'
    ]
    assert ('hasGrade', 'variety:apple-hongro', None, None, None) in relations['item:apple']
    criterion = saved['crit:green_onion-leaf']
    assert criterion['type'] == 'criterion'
    assert criterion['name_ko'] == '잎 끝까지 탄력 있어 보이고 마른 잎이 섞여 있지 않아요'
    assert criterion['source'] == 'src:nics-month-food-green-onion'
    assert criterion['labels']['en'] == ['Healthy leaves']
    assert ('hasCriterion', 'crit:green_onion-leaf', None, 42, None) in relations[
        'item:green_onion'
    ]
    assert ('soldBy', 'unit:bunch', None, 42, {'factor_kg': 0.8, 'default': True}) in relations[
        'item:green_onion'
    ]
    assert len(prune.call_args.args[1]) == 40  # 047: 기존 24 + 원문 인용 16


def test_mandarin_catalog_and_documents():
    entities = yaml.safe_load((DATA / 'ontology/items.yaml').read_text())['entities']
    sources = yaml.safe_load((DATA / 'sources.yaml').read_text())
    assert sum(e['type'] == 'item' for e in entities) == 6
    assert len(sources) == 26  # 047: 공유 원문 출처 10개 추가
    item = next(e for e in entities if e['id'] == 'item:mandarin')
    assert item['labels'] == {'ko': ['귤', '감귤', '밀감'], 'en': ['mandarin', 'tangerine']}
    assert not item.get('vision')
    assert len(item['criteria']) == 4
    assert all(c['source'] in sources for c in item['criteria'])
    grades = [r for r in item['relations'] if r['p'] == 'hasGrade']
    assert [r['o'] for r in grades if r.get('props', {}).get('default')] == [
        'variety:mandarin-open'
    ]
    assert next(r for r in item['relations'] if r['p'] == 'inSeason')['o'] == 'season:12'
    for grade in grades:
        variety = next(e for e in entities if e['id'] == grade['o'])
        assert variety['attrs'] == {} and not variety.get('relations')
    root = DATA / 'rag_docs'
    docs = [read_document(p, root) for p in (root / 'mandarin').glob('*.md')]
    assert len(docs) == 4
    assert {d.doc_type for d in docs} == {'criterion', 'storage', 'prep', 'story'}
    assert all(
        d.entities == ['item:mandarin'] and d.source_key == 'src:nics-month-food-mandarin'
        for d in docs
    )
