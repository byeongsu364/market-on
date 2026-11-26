"""Offline price contract checks."""

from datetime import date, timedelta
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.db.repositories import knowledge_repo, price_repo, store_repo
from app.deps import get_db
from app.main import app
from app.services import price_service

TODAY = date(2026, 11, 24)
QUERY = {'item_id': 'item:green_onion', 'market_id': 'market:test', 'unit': 'unit:bunch'}


def row(days=0, region='서울', kind='traditional', price=2500, code='0', **kw):
    return {
        'exmn_ymd': TODAY - timedelta(days=days),
        'sgg_nm': region,
        'market_type': kind,
        'price': price,
        'mrkt_cd': code,
        'mrkt_nm': '조사처',
        'unit': 'kg',
        'unit_sz': '1',
    } | kw


@pytest.fixture
def api(monkeypatch):
    class Clock(date):
        @classmethod
        def today(cls):
            return TODAY

    monkeypatch.setattr(price_service, 'date', Clock)
    monkeypatch.setattr(price_repo, 'varieties', lambda *a: [])
    monkeypatch.setattr(knowledge_repo, 'get_item', lambda *a: {'id': QUERY['item_id']})
    monkeypatch.setattr(
        store_repo,
        'get_market',
        lambda *a: {'name_ko': '시험 시장', 'at_sgg_nm': '서울', 'at_mrkt_cd': None},
    )
    monkeypatch.setattr(price_repo, 'fetch_rows', lambda *a: [row()])
    monkeypatch.setattr(price_repo, 'observation_unit_id', lambda *a: None)
    monkeypatch.setattr(
        price_repo,
        'sale_units',
        lambda *a: [
            {'id': 'unit:bunch', 'name_ko': '단', 'props': {'default': True, 'factor_kg': 0.8}}
        ],
    )
    app.dependency_overrides[get_db] = lambda: None
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_contract(api, monkeypatch):
    monkeypatch.setattr(
        price_repo, 'fetch_rows', lambda *a: [row(), row(kind='large_retail', price=3000, code='1')]
    )
    response = api.get('/price', params=QUERY | {'seen_price': 1800})
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        'item_id',
        'variety_id',
        'variety_name',
        'varieties',
        'unit',
        'reference_price',
        'seen_price',
        'diff_pct',
        'region',
        'observed_on',
        'fallback',
        'source',
        'by_market_type',
    }
    assert body['unit'] == 'unit:bunch' and body['reference_price'] == 2000
    assert body['seen_price'] == 1800 and body['diff_pct'] == -10
    assert body['region'] == '서울' and body['observed_on'] == TODAY.isoformat()
    assert body['fallback'] is None
    assert body['source'] == 'aT 기간별 소매가격 · 2026-11-24 조사'
    assert body['by_market_type'] == {
        'traditional': {'price': 2000, 'count': 1},
        'large_retail': {'price': 2400, 'count': 1},
    }
    body = api.get('/price', params=QUERY).json()
    assert 'seen_price' not in body and body['diff_pct'] is None
    assert api.get('/price/item:green_onion').status_code == 404


@pytest.mark.parametrize(
    ('rows', 'fallback', 'region', 'reference'),
    [
        ([row()], None, '서울', 2000),
        ([row(kind='large_retail')], 'region_avg', '서울', 2000),
        (
            [row(region='부산'), row(region='부산', kind='large_retail', price=5000)],
            'national_avg',
            '전국',
            2000,
        ),
        ([row(region='부산', kind='large_retail')], 'national_avg', '전국', 2000),
        ([row(days=8)], 'last_valid', '서울', 2000),
        ([row(days=8, kind='large_retail')], 'last_valid', '서울', 2000),
        ([row(days=14, region='부산')], 'last_valid', '전국', 2000),
        ([row(days=7)], None, '서울', 2000),
        ([row(days=2), row(days=1, price=3000), row(days=-1, price=9000)], None, '서울', 2400),
        ([row(days=2), row(region='부산', price=9000)], None, '서울', 2000),
    ],
)
def test_fallbacks(api, monkeypatch, rows, fallback, region, reference):
    monkeypatch.setattr(price_repo, 'fetch_rows', lambda *a: rows)
    body = api.get('/price', params=QUERY).json()
    assert body['fallback'] == fallback and body['region'] == region
    assert body['reference_price'] == reference


@pytest.mark.parametrize('rows', [[], [row(days=15)], [row(days=-1)]])
def test_price_not_found(api, monkeypatch, rows):
    monkeypatch.setattr(price_repo, 'fetch_rows', lambda *a: rows)
    response = api.get('/price', params=QUERY)
    assert response.status_code == 404 and response.json()['error']['code'] == 'PRICE_NOT_FOUND'


def test_entity_errors(api, monkeypatch):
    baseline = Mock(side_effect=AssertionError('check entities first'))
    monkeypatch.setattr(price_repo, 'baseline', baseline)
    monkeypatch.setattr(store_repo, 'get_market', lambda *a: None)
    response = api.get('/price', params=QUERY)
    assert response.status_code == 404 and response.json()['error']['code'] == 'MARKET_NOT_FOUND'
    monkeypatch.setattr(knowledge_repo, 'get_item', lambda *a: None)
    response = api.get('/price', params=QUERY)
    assert response.status_code == 404 and response.json()['error']['code'] == 'ITEM_NOT_FOUND'
    baseline.assert_not_called()


@pytest.mark.parametrize('value', [0, -1, 'bad', 'NaN', 'Infinity'])
def test_invalid_seen(api, value):
    assert api.get('/price', params=QUERY | {'seen_price': value}).status_code == 422


@pytest.mark.parametrize('key', ['item_id', 'market_id', 'unit'])
def test_required_query(api, key):
    assert api.get('/price', params={k: v for k, v in QUERY.items() if k != key}).status_code == 422


@pytest.mark.parametrize(('seen', 'diff'), [(2011, 1), (1989, -1), (2200, 10), (1800, -10)])
def test_rounding(api, seen, diff):
    assert api.get('/price', params=QUERY | {'seen_price': seen}).json()['diff_pct'] == diff


def test_this_market(api, monkeypatch):
    monkeypatch.setattr(
        store_repo,
        'get_market',
        lambda *a: {'name_ko': '경동시장', 'at_sgg_nm': '서울', 'at_mrkt_cd': '0'},
    )
    assert api.get('/price', params=QUERY).json()['this_market'] == {
        'price': 2000,
        'name': '경동시장',
    }
    monkeypatch.setattr(price_repo, 'fetch_rows', lambda *a: [row(code='other')])
    assert 'this_market' not in api.get('/price', params=QUERY).json()


def test_apple(api, monkeypatch):
    monkeypatch.setattr(price_repo, 'fetch_rows', lambda *a: [row(unit='개', unit_sz='10')])
    body = api.get(
        '/price', params=QUERY | {'item_id': 'item:apple', 'unit': 'unit:missing'}
    ).json()
    assert body['unit'] == '10개' and body['reference_price'] == 2500
    assert set(body['by_market_type']) == {'traditional'}


def test_grams_unknown_unit(api, monkeypatch):
    monkeypatch.setattr(price_repo, 'fetch_rows', lambda *a: [row(unit='g', unit_sz='100')])
    assert api.get('/price', params=QUERY).json()['reference_price'] == 20000
    monkeypatch.setattr(price_repo, 'observation_unit_id', lambda *a: 'unit:kg')
    monkeypatch.setattr(price_repo, 'fetch_rows', lambda *a: [row()])
    body = api.get('/price', params=QUERY | {'unit': 'unit:missing'}).json()
    assert body['unit'] == 'unit:kg' and body['reference_price'] == 2500


def test_no_region(api, monkeypatch):
    monkeypatch.setattr(
        store_repo,
        'get_market',
        lambda *a: {'name_ko': '가상', 'at_sgg_nm': None, 'at_mrkt_cd': None},
    )
    body = api.get('/price', params=QUERY).json()
    assert body['region'] == '전국' and body['fallback'] == 'national_avg'


def test_observation_unit_id(monkeypatch):
    query = Mock(return_value=[{'id': 'unit:piece'}])
    monkeypatch.setattr(price_repo, 'fetch_rows', query)
    assert price_repo.observation_unit_id(None, '개', '1') == 'unit:piece'
    assert query.call_args.args[2] == ('unit:piece',)
    query.reset_mock()
    assert price_repo.observation_unit_id(None, '개', '10') is None
    query.assert_not_called()
    query.return_value = []
    assert price_repo.observation_unit_id(None, 'kg', '1') is None


def test_seed_market_metadata(monkeypatch):
    from contextlib import nullcontext

    from scripts import seed_demo_market as seed

    conn = Mock()
    conn.transaction.side_effect = nullcontext
    monkeypatch.setattr(seed.demo_repo, 'ensure_entity', Mock())
    market = Mock()
    monkeypatch.setattr(seed.store_repo, 'upsert_market', market)
    for method in ('upsert_zone', 'upsert_store', 'set_store_items'):
        monkeypatch.setattr(seed.store_repo, method, Mock())
    assert seed.seed_demo_market(conn) == {'markets': 1, 'zones': 6, 'stores': 24}
    assert market.call_args.kwargs['at_sgg_nm'] == '서울'
    assert market.call_args.kwargs['at_mrkt_cd'] is None


def test_other_item_variety_422(api):
    response = api.get('/price', params=QUERY | {'variety_id': 'variety:apple-fuji'})
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'INVALID_VARIETY'
