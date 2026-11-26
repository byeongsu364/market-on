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
    assert len(varieties) == 19
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
    monkeypatch.setattr(knowledge_repo, 'source_title', lambda c, key: key)
    monkeypatch.setattr(knowledge_repo, 'item_labels', lambda *a: [])
    monkeypatch.setattr(knowledge_repo, 'season_relations', lambda *a: [])
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
        'mock',
        'source',
        'name',
        'reference_price',
        'unit',
        'observed_on',
        'count',
        'default',
        'description',
        'description_source',
        'harvest',
        'synonyms',
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
    assert len(get().varieties) == 1


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
    assert {c.kwargs['grd_cd'] for c in fetch.call_args_list} == {'04'}
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


def test_mandarin_collection_targets_without_network(monkeypatch):
    entities = yaml.safe_load((DATA / 'ontology/items.yaml').read_text())['entities']
    parent = next(e for e in entities if e['id'] == 'item:mandarin')
    children = [
        e | {'item_id': parent['id']} for e in entities if e['id'].startswith('variety:mandarin-')
    ]
    monkeypatch.setattr(collector.at_price, 'require_key', lambda: None)
    monkeypatch.setattr(price_repo, 'kamis_entities', lambda *a: [parent])
    monkeypatch.setattr(price_repo, 'varieties', lambda *a: children)
    fetch = Mock(return_value=[])
    monkeypatch.setattr(collector.at_price, 'fetch_period_retail', fetch)
    monkeypatch.setattr(price_repo, 'upsert_observations', lambda *a: (0, 0))
    collector.update_prices(None, item_id=parent['id'])
    assert [call.args for call in fetch.call_args_list] == [
        ('400', '415', '01'),
        ('400', '415', '02'),
    ]


def test_variety_without_price(monkeypatch):
    from app.services import price_tag

    monkeypatch.setattr(price_tag, 'match_variety', lambda *a: 'variety:apple-fuji')
    assert price_tag.parse(None, '부사', 'item:apple') is None
    assert price_tag.read_variety(None, '부사', 'item:apple') == {
        'variety_id': 'variety:apple-fuji',
        'variety_text': '부사',
    }


def test_seed_and_remove_mock(monkeypatch):
    from scripts import seed_mock_varieties as script

    conn = Mock()
    conn.transaction.return_value = nullcontext()
    conn.execute.return_value.rowcount = 7
    assert script.seed(conn, remove=True) == {'deleted': 7, 'inserted': 0}
    assert "source='mock'" in conn.execute.call_args.args[0]
    # 기준 행은 사전 행 커서로 읽어요 (upsert_observations는 기본 튜플 행 연결을 그대로 씀)
    conn.cursor.return_value.execute.return_value.fetchall.return_value = [
        {
            'source': 'at_period_retail',
            'price': 1000,
            'item_id': 'item:pear',
            'variety_id': 'variety:pear-shingo',
            'exmn_ymd': date(2026, 11, 27),
        }
    ]
    saved = []
    monkeypatch.setattr(
        script, 'upsert_observations', lambda c, rows: (saved.extend(rows) or len(rows), 0)
    )
    script.seed(conn, today=date(2026, 11, 27))
    assert conn.cursor.call_args.kwargs['row_factory'] is script.dict_row
    assert all(r['source'] == 'mock' for r in saved)
    assert saved[0]['price'] == 850


def test_baseline_excludes_mock_by_default(monkeypatch):
    captured = []
    monkeypatch.setattr(
        price_repo, 'fetch_rows', lambda c, q, params: captured.append((q, params)) or []
    )
    price_repo.baseline(None, 'item:pear', on_date=date(2026, 11, 27))
    assert "p.source<>'mock' or %s" in captured[0][0]
    assert captured[0][1][4] is False


def test_explicit_mock_price_is_labeled(prices, monkeypatch):
    real_choices = choices()
    real_choices[1]['attrs'] = {'mock': True}
    monkeypatch.setattr(price_repo, 'varieties', lambda *a: real_choices)
    calls = []

    def mock_rows(conn, query, params):
        calls.append(params)
        return [
            {
                'source': 'mock',
                'exmn_ymd': date(2026, 11, 20),
                'sgg_nm': '서울',
                'market_type': 'traditional',
                'mrkt_cd': '0',
                'price': 25000,
                'unit': '개',
                'unit_sz': '10',
            }
        ]

    monkeypatch.setattr(price_repo, 'fetch_rows', mock_rows)
    result = price_service.get_price(
        None,
        'item:apple',
        variety_id='variety:apple-hongro',
        on_date=date(2026, 11, 24),
        _include_varieties=False,
    )
    assert calls[0][4] is True
    assert result.mock is True
    assert result.source == '예시 시세 · 실제 조사값 아님'


def test_history_dates_exclude_mock():
    conn = Mock()
    conn.execute.return_value = []
    price_repo.observation_dates(conn, 'item:pear', None, date(2026, 11, 1), date(2026, 11, 27))
    assert "p.source<>'mock'" in conn.execute.call_args.args[0]


def test_baseline_uses_national_rows_without_market(monkeypatch):
    """축산물처럼 시장 이름 없이 전국 평균 한 줄로만 조사된 행도 기준시세에 써요 (047 검수)."""
    row = {
        'exmn_ymd': date(2026, 11, 26),
        'market_type': 'unknown',
        'mrkt_cd': 'None',
        'mrkt_nm': None,
        'sgg_nm': '전국',
        'price': 4011,
        'unit': '구',
        'unit_sz': '10',
    }
    monkeypatch.setattr(price_repo, 'fetch_rows', lambda c, q, params: [dict(row)])
    result = price_repo.baseline(None, 'item:egg', on_date=date(2026, 11, 27), sgg_nm='동대문구')
    assert result['scope'] == 'national' and result['all']['avg'] == 4011
    monkeypatch.setattr(
        price_repo, 'fetch_rows', lambda c, q, params: [dict(row, mrkt_cd='0110212')]
    )
    assert price_repo.baseline(None, 'item:egg', on_date=date(2026, 11, 27)) is None
