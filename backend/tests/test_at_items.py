"""047 고정 입력 생성, 원문 인용, 업종·조사 단위 연결 검증."""

import json
import os
import shutil
from collections import Counter

import pytest
import yaml

from app.services.price_service import baseline_unit
from scripts.build_at_items import DATA, SLUGS, build
from scripts.load_market_stores import prepare
from scripts.pipeline import month_food_sources


def generated():
    return yaml.safe_load((DATA / 'ontology/items_at.yaml').read_text())['entities']


def test_all_items_varieties_units_and_categories():
    entities = generated()
    by_id = {e['id']: e for e in entities}
    old = yaml.safe_load((DATA / 'ontology/items.yaml').read_text())['entities']
    assert len(by_id) == len(entities) == 238
    assert not set(by_id) & {e['id'] for e in old}
    assert len(SLUGS) == len(set(SLUGS.values())) == 95
    items = [e for e in entities if e['type'] == 'item']
    assert len(items) == 89
    assert Counter(next(r['o'] for r in e['relations'] if r['p'] == 'isA') for e in items) == {
        'cat:grain': 8,
        'cat:vegetable': 35,
        'cat:special': 4,
        'cat:fruit': 9,
        'cat:livestock': 7,
        'cat:seafood': 26,
    }
    ids = set(by_id) | {e['id'] for e in old}
    for item in items:
        grades = [r for r in item['relations'] if r['p'] == 'hasGrade']
        default = [r for r in grades if r.get('props', {}).get('default')]
        assert len(default) == 1
        assert item['kamis'] == by_id[default[0]['o']]['kamis']
        assert all(by_id[r['o']]['kamis'] for r in grades)
        units = [r for r in item['relations'] if r['p'] == 'soldBy']
        assert sum(bool(r['props'].get('default')) for r in units) == 1
        assert all(r['o'] in ids for r in units)


def test_quotes_sources_and_documents_are_only_mapped_items():
    mapping = json.loads((DATA / 'kamis/month_food_map_20261127.json').read_text())['items']
    sources = month_food_sources(DATA / 'sources.yaml')
    documented = 0
    for item in (e for e in generated() if e['type'] == 'item'):
        code = item['kamis']
        food = mapping.get(f'{code["ctgry_cd"]}-{code["item_cd"]}')
        folder = DATA / 'rag_docs' / item['id'].removeprefix('item:')
        if not food:
            assert not item.get('criteria') and not folder.exists()
            assert not any(r['p'] == 'inSeason' for r in item['relations'])
            continue
        documented += 1
        raw = json.loads((DATA / f'raw/nics/{food["fdmtSn"]}.json').read_text())['response'][
            'body'
        ]['stdInfo']
        assert item['attrs']['criteria_style'] == 'source_quote'
        assert 1 <= len(item['criteria']) <= 4
        for criterion in item['criteria']:
            assert criterion['text'] in raw['prchCheatDtl']
            assert sources[criterion['source']]['sn'] == food['fdmtSn']
        for path in folder.glob('*.md'):
            body = path.read_text().split('---\n', 2)[-1]
            assert body.startswith('> 원문 옮김 · 검수 전 (자동 생성 2026-11-27)')
            for line in body.splitlines():
                if line.startswith('- '):
                    assert any(line[2:] in raw.get(k, '') for k in ('prchCheatDtl', 'cstdyMthDtl'))
                    assert not any(
                        word in line for word in ('영양', '효능', '효과', '비타민', '건강')
                    )
    assert documented == 11


def test_regeneration_is_byte_identical(tmp_path):
    for name in ('kamis', 'ontology', 'raw/nics', 'rag_docs'):
        shutil.copytree(DATA / name, tmp_path / name)
    shutil.copy2(DATA / 'sources.yaml', tmp_path / 'sources.yaml')

    def snapshot():
        return {
            str(p.relative_to(tmp_path)): p.read_bytes() for p in tmp_path.rglob('*') if p.is_file()
        }

    before = snapshot()
    build(tmp_path)
    assert snapshot() == before
    build(tmp_path)
    assert snapshot() == before


def test_store_rules_cover_95_preserve_original_six():
    config = yaml.safe_load((DATA / 'markets/gyeongdong.yaml').read_text())
    rows = [
        {
            'bizesId': str(n),
            'bizesNm': f'점포{n}',
            'indsSclsNm': industry,
            'bldNm': '경동시장',
            'lat': 37.58,
            'lon': 127.04,
        }
        for n, industry in enumerate(config['industries'])
    ]
    _, _, stores, guesses, _ = prepare(config, rows)
    rules = yaml.safe_load((DATA / 'ontology/item_store_categories.yaml').read_text())[
        'item_store_categories'
    ]
    assert len(rules) == len({r['item'] for r in rules}) == 95
    for store in stores:
        assert guesses[store['id']] == sorted(
            r['item'] for r in rules if r['store_category'] == store['store_category_id']
        )
    old = {
        e['id']
        for e in yaml.safe_load((DATA / 'ontology/items.yaml').read_text())['entities']
        if e['type'] == 'item'
    }
    assert all(
        (set(guesses[s['id']]) & old)
        == (old if s['store_category_id'] == 'store_category:produce' else set())
        for s in stores
    )


@pytest.mark.parametrize(
    ('unit', 'size', 'uid', 'props'),
    [
        ('g', '100', 'unit:g100', {'factor_kg': 0.1}),
        ('포기', '1', 'unit:head', {'count': 1}),
        ('마리', '1', 'unit:fish', {'count': 1}),
        ('손', '1', 'unit:pair', {'count': 2}),
        ('장', '10', 'unit:sheet10', {'count': 10}),
        ('구', '10', 'unit:egg10', {'count': 10}),
        ('L', '1', 'unit:liter', {'volume_l': 1}),
        ('kg', '5', 'unit:kg5', {'factor_kg': 5}),
    ],
)
def test_survey_baseline_stays_in_sale_unit(monkeypatch, unit, size, uid, props):
    from app.db.repositories import price_repo

    monkeypatch.setattr(price_repo, 'observation_unit_id', lambda *a: uid)
    assert baseline_unit(None, {'unit': unit, 'unit_sz': size}, {'id': uid, 'props': props}) == (
        uid,
        1,
    )


@pytest.mark.skipif(not os.getenv('TEST_DATABASE_URL'), reason='test DB required')
def test_database_generated_units_and_counts(db):  # noqa: F811 -- imported fixture
    from app.db.repositories.price_repo import observation_unit_id
    from scripts.load_ontology import load_ontology
    from scripts.load_sources import load_sources

    load_sources(db)
    load_ontology(db)
    assert db.execute("select count(*) from entities where type='item'").fetchone()[0] == 95
    assert (
        db.execute(
            "select count(*) from entity_relations where predicate='hasCriterion'"
        ).fetchone()[0]
        == 40
    )
    for entity in generated():
        if entity['type'] == 'unit':
            attrs = entity['attrs']
            assert (
                observation_unit_id(db, attrs['observation_unit'], attrs['observation_size'])
                == entity['id']
            )


from tests.test_ingest_db import db  # noqa: F401 -- guarded marketon_test fixture
