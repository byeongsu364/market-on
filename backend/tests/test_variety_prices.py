"""Offline variety routing, fallback, ingestion and text-only recognition."""

from contextlib import nullcontext
from datetime import date
from unittest.mock import Mock

import pytest
import yaml

from app.core.errors import AppError
from app.db.repositories import knowledge_repo, price_repo, store_repo
from app.knowledge import ontology
from app.services import price_service
from scripts import update_prices as collector
from scripts._common import DATA


def choices():
    entities = yaml.safe_load((DATA / 'ontology/items.yaml').read_text())['entities']
    parent = next(e for e in entities if e['id'] == 'item:apple')
    return [
        e | {'item_id': parent['id'], 'props': edge.get('props', {})}
        for edge in parent['relations']
        if edge['p'] == 'hasGrade'
        for e in entities
        if e['id'] == edge['o']
    ]


def test_variety_ontology():
    entities = yaml.safe_load((DATA / 'ontology/items.yaml').read_text())['entities']
    varieties = [e for e in entities if e['type'] == 'variety']
    assert len(varieties) == 7
    for item in (e for e in entities if e['type'] == 'item'):
        edges = [r for r in item['relations'] if r['p'] == 'hasGrade']
        defaults = [r for r in edges if r.get('props', {}).get('default')]
        assert len(defaults) == 1
        default = next(v for v in varieties if v['id'] == defaults[0]['o'])
        assert item['kamis'] == default['kamis']
    assert '황금사과' not in str(varieties)
    assert next(v for v in varieties if v['id'] == 'variety:green_onion-daepa')['labels'] == {}


@pytest.fixture
def prices(monkeypatch):
    monkeypatch.setattr(knowledge_repo, 'get_item', lambda *a: {'id': 'item:apple'})
    monkeypatch.setattr(
        store_repo, 'get_market', lambda *a: {'at_sgg_nm': '서울', 'at_mrkt_cd': None}
    )
    monkeypatch.setattr(price_repo, 'varieties', lambda *a: choices())
    monkeypatch.setattr(price_repo, 'observation_unit_id', lambda *a: None)
    monkeypatch.setattr(
        price_repo,
        'sale_units',
        lambda *a: [{'id': 'unit:piece', 'props': {'count': 1, 'default': True}}],
    )

    def rows(conn, query, params):
        variety = params[0]
        if variety.endswith('shinano-gold'):
            return []
        return [
            {
                'exmn_ymd': date(2026, 11, 20),
                'sgg_nm': '서울' if variety.endswith('fuji') else '부산',
                'market_type': 'traditional',
                'mrkt_cd': '0',
                'price': 20000 if variety.endswith('fuji') else 30000,
                'unit': '개',
                'unit_sz': '10',
            }
        ]

    monkeypatch.setattr(price_repo, 'fetch_rows', rows)


def test_default_explicit_fallback_and_contract(prices, monkeypatch):
    def get(**kw):
        return price_service.get_price(
            None,
            'item:apple',
            market_id='market:test',
            on_date=date(2026, 11, 24),
            seen_price=2500,
            **kw,
        )

    default = get()
    assert (default.variety_id, default.reference_price, default.diff_pct) == (
        'variety:apple-fuji',
        2000,
        25,
    )
    assert set(default.varieties[0].model_dump()) == {
        'variety_id',
        'name',
        'reference_price',
        'unit',
        'observed_on',
        'count',
        'default',
    }
    assert [v.reference_price for v in default.varieties] == [2000, 3000, None]
    assert default.varieties[2].count == 0
    hongro = get(variety_id='variety:apple-hongro')
    assert (hongro.reference_price, hongro.fallback, hongro.diff_pct) == (3000, 'national_avg', -17)
    old = price_service.get_price(
        None, 'item:apple', on_date=date(2026, 11, 29), variety_id='variety:apple-hongro'
    )
    assert old.fallback == 'last_valid'
    with pytest.raises(AppError) as exc:
        get(variety_id='variety:pear-shingo')
    assert exc.value.status_code == 422
    monkeypatch.setattr(price_repo, 'varieties', lambda *a: choices()[:1])
    assert get().varieties == []


def test_collection_parent_and_every_variety(monkeypatch):
    children = choices()
    monkeypatch.setattr(collector.at_price, 'require_key', lambda: None)
    monkeypatch.setattr(
        price_repo,
        'kamis_entities',
        lambda *a: [{'id': 'item:apple', 'type': 'item', 'kamis': children[0]['kamis']}, *children],
    )
    monkeypatch.setattr(price_repo, 'varieties', lambda *a: children)
    fetch = Mock(
        side_effect=lambda cat, item, variety, **kw: [
            {'exmn_ymd': '20261124', 'exmn_dd_prc': '20,000', 'vrty_cd': variety}
        ]
    )
    monkeypatch.setattr(collector.at_price, 'fetch_period_retail', fetch)
    saved = []
    monkeypatch.setattr(
        price_repo, 'upsert_observations', lambda conn, rows: (saved.extend(rows) or len(rows), 0)
    )
    collector.update_prices(None)
    assert fetch.call_count == 3
    assert {r['variety_id'] for r in saved} == {v['id'] for v in children}
    assert {r['item_id'] for r in saved} == {'item:apple'}


def test_backfill_option_without_api(monkeypatch):
    import sys

    monkeypatch.setattr(
        sys, 'argv', ['update_prices', '--backfill-varieties', '--item', 'item:apple']
    )
    monkeypatch.setattr(collector, 'connection', lambda: nullcontext('fake'))
    backfill = Mock(return_value=3)
    monkeypatch.setattr(price_repo, 'backfill_varieties', backfill)
    monkeypatch.setattr(
        collector.at_price, 'require_key', Mock(side_effect=AssertionError('no HTTP'))
    )
    collector.main()
    backfill.assert_called_once_with('fake', 'item:apple')


@pytest.mark.parametrize(
    ('text', 'expected'),
    [
        ('부사 3개 5,000원', 'variety:apple-fuji'),
        ('홍로', 'variety:apple-hongro'),
        ('3개 5,000원', None),
        ('신고배', None),
    ],
)
def test_price_tag_labels(monkeypatch, text, expected):
    monkeypatch.setattr(price_repo, 'varieties', lambda *a: choices())
    monkeypatch.setattr(
        knowledge_repo,
        'label_dictionary',
        lambda *a: (
            [
                (ontology.normalize(label), v['id'], label)
                for v in choices()
                for labels in v['labels'].values()
                for label in labels
            ]
            + [('신고배', 'variety:pear-shingo', '신고배')]
        ),
    )
    assert ontology.match_variety(None, 'item:apple', text) == expected
