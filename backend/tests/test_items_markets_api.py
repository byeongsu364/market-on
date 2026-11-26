"""Offline contract-key checks; seeded layout is exercised without a live DB."""

from contextlib import nullcontext
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.db.repositories import knowledge_repo, sale_repo, store_repo, price_repo
from app.deps import get_db
from app.main import app
from scripts import seed_demo_market as seed

ITEM_KEYS = {
    'item_id',
    'name',
    'synonyms',
    'vision_labels',
    'criteria',
    'default_unit',
    'units',
    'labels_i18n',
}


@pytest.fixture
def public(monkeypatch):
    monkeypatch.setattr(price_repo, 'list_reports', lambda *a, **kw: [])
    monkeypatch.setattr(price_repo, 'store_confirmations', lambda *a: [])
    monkeypatch.setattr(price_repo, 'sale_units', lambda *a: [])
    markets, zones, stores, items = {}, {}, {}, {}
    for name, target in [
        ('upsert_market', markets),
        ('upsert_zone', zones),
        ('upsert_store', stores),
    ]:
        monkeypatch.setattr(
            store_repo, name, lambda c, _target=target, **v: _target.update({v['id']: v})
        )
    monkeypatch.setattr(seed.demo_repo, 'ensure_entity', lambda *a: None)
    monkeypatch.setattr(
        store_repo, 'set_store_items', lambda c, s, ids, source: items.update({s: ids})
    )

    class Conn:
        transaction = staticmethod(nullcontext)

    seed.seed_demo_market(Conn())
    seed.seed_demo_market(Conn())
    assert (len(markets), len(zones), len(stores)) == (1, 6, 24)
    monkeypatch.setattr(store_repo, 'get_market', lambda c, m: markets.get(m))
    monkeypatch.setattr(store_repo, 'list_markets', lambda c: list(markets.values()))
    monkeypatch.setattr(store_repo, 'list_zones', lambda c, m: list(reversed(zones.values())))
    monkeypatch.setattr(store_repo, 'list_stores', lambda c, m: list(stores.values()))
    monkeypatch.setattr(
        store_repo,
        'market_items',
        lambda c, m: [dict(store_id=s, item_id=i) for s, ids in items.items() for i in ids],
    )
    monkeypatch.setattr(
        sale_repo,
        'latest_active_by_store',
        lambda *a: [
            dict(
                store_id='store:demo-A05',
                sale_price=2000,
                regular_price=None,
                ends_at=datetime.now(UTC),
            )
        ],
    )
    monkeypatch.setattr(
        knowledge_repo,
        'get_item',
        lambda c, e: (
            dict(name_ko='대파', kamis={'unit': 'kg'}) if e == 'item:green_onion' else None
        ),
    )
    monkeypatch.setattr(
        knowledge_repo,
        'item_labels',
        lambda c, e: (
            [
                dict(label='대파', lang='ko', kind='preferred'),
                dict(label='파', lang='ko', kind='synonym'),
            ]
            if e.startswith('item:')
            else []
        ),
    )
    monkeypatch.setattr(
        knowledge_repo,
        'item_relations',
        lambda *a: (
            [
                dict(
                    predicate='hasCriterion',
                    object_id=f'crit:green_onion-{k}',
                    type='criterion',
                    name_ko=k,
                    source_title='팀 작성 초안 · 샘플',
                )
                for k in ('leaf', 'stem', 'root')
            ]
            + [dict(predicate='soldBy', object_id='unit:bunch', props={'default': True})]
        ),
    )
    app.dependency_overrides[get_db] = lambda: None
    try:
        with TestClient(app) as client:
            yield client, markets, stores
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_item_contract(public):
    c = public[0]
    r = c.get('/items/item:green_onion')
    assert r.status_code == 200
    item = r.json()
    assert set(item) == ITEM_KEYS
    assert item['default_unit'] == 'unit:bunch'
    assert len(item['criteria']) == 3
    assert all(
        set(v) == {'key', 'text', 'source'} and v['source'] == '팀 작성 초안 · 샘플'
        for v in item['criteria']
    )
    for eid in ('missing', 'cat:vegetable'):
        r = c.get(f'/items/{eid}')
        assert r.status_code == 404 and r.json()['error']['code'] == 'ITEM_NOT_FOUND'


def test_search_empty_and_normalized(public, monkeypatch):
    calls = []
    monkeypatch.setattr(
        knowledge_repo,
        'search_items',
        lambda c, q: calls.append(q) or [dict(entity_id='item:green_onion')],
    )
    c = public[0]
    for q in ('파', ' SCALLION ', 'apple'):
        assert set(c.get('/items/search', params={'q': q}).json()[0]) == ITEM_KEYS
    assert calls == ['파', 'scallion', 'apple']
    monkeypatch.setattr(knowledge_repo, 'catalog_ids', lambda c: ['item:green_onion'])
    for q in ('', ' \t '):
        assert set(c.get('/items/search', params={'q': q}).json()[0]) == ITEM_KEYS
    assert len(calls) == 3


def test_markets_contract(public, caplog):
    c, markets, stores = public
    markets['far'] = dict(id='far', name_ko='가', lat=38, lng=127)
    markets['missing'] = dict(id='missing', name_ko='나', lat=None, lng=127)
    result = c.get('/markets/nearby?lat=37.57&lng=126.99').json()
    assert [m['market_id'] for m in result] == ['market:demo', 'far']
    assert all(
        set(m) == {'market_id', 'name', 'status', 'lat', 'lng', 'distance_m'} for m in result
    )
    same = c.get('/markets/nearby?lat=38&lng=127').json()
    assert same[0]['market_id'] == 'far' and same[0]['distance_m'] == 0
    assert 0 <= result[0]['distance_m'] < 1000
    assert result[1]['distance_m'] > 1000
    assert c.get('/markets/nearby').json()[0]['distance_m'] is None
    assert c.get('/markets/nearby').json()[0]['market_id'] == 'far'
    stores['store:demo-A24']['map_x'] = None
    with caplog.at_level('INFO'):
        r = c.get('/markets/market:demo/map?item_id=item:green_onion')
    assert r.status_code == 200
    result = r.json()
    assert set(result) == {'market_id', 'zones', 'stores', 'layout', 'source_note'}
    assert [z['name'] for z in result['zones']] == [
        '청과',
        '채소',
        '수산',
        '정육',
        '반찬',
        '떡·분식',
    ]
    assert all(set(z) == {'id', 'name', 'x', 'y'} for z in result['zones'])
    assert len(result['stores']) == 23 and 'omitted 1 stores' in caplog.text
    assert [s['name'] for s in result['stores'] if s['highlight']] == [
        '점포 A-05',
        '점포 A-06',
        '점포 A-07',
    ]
    for i, s in enumerate(result['stores']):
        assert set(s) == {
            'source',
            'items_basis',
            'guessed_item_ids',
            'store_id',
            'name',
            'zone_id',
            'sells',
            'map_x',
            'map_y',
            'hours',
            'highlight',
            'active_sale',
            'price',
        }
        z = result['zones'][i // 4]
        assert s['map_x'] == z['x'] + 8 + (i % 2) * 80
        assert s['map_y'] == z['y'] + 40 + (i % 4 // 2) * 60
        assert s['sells'] == (
            ['item:green_onion', 'item:onion']
            if 4 <= i < 7
            else [f'item:{seed.ITEMS[1 + i % 4][0]}']
        )
        assert s['hours'] == '09:00–20:00'
    assert set(result['stores'][4]['active_sale']) == {'sale_price', 'regular_price', 'ends_at'}
    assert result['stores'][0]['active_sale'] is None
    r = c.get('/markets/absent/map')
    assert r.status_code == 404 and r.json()['error']['code'] == 'MARKET_NOT_FOUND'


def test_item_language_and_unit_fallbacks(public, monkeypatch):
    c = public[0]
    monkeypatch.setattr(knowledge_repo, 'item_relations', lambda *a: [])
    monkeypatch.setattr(knowledge_repo, 'item_labels', lambda *a: [])
    result = c.get('/items/item:green_onion?lang=ja').json()
    assert result['name'] == '대파' and result['default_unit'] == 'unit:kg'
    assert result['units'] == ['unit:kg'] and result['labels_i18n'] == {}
    monkeypatch.setattr(
        knowledge_repo,
        'item_relations',
        lambda *a: [
            dict(predicate='soldBy', object_id='unit:each', props={}),
            dict(predicate='soldBy', object_id='unit:kg', props={'default': True}),
        ],
    )
    result = c.get('/items/item:green_onion').json()
    assert result['default_unit'] == 'unit:kg' and result['units'] == ['unit:each', 'unit:kg']


def test_map_missing_hours_and_no_item(public):
    c, _, stores = public
    stores['store:demo-A01']['hours'] = None
    result = c.get('/markets/market:demo/map').json()
    assert result['stores'][0]['hours'] == ''
    assert not any(s['highlight'] for s in result['stores'])
