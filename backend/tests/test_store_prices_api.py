"""Offline price endpoint ownership, security, ordering and contract checks."""

from datetime import UTC, datetime
from types import SimpleNamespace
import pytest
from app.db.repositories import price_repo
from app.services import item_service, store_price_service
from tests.test_auth_api import memory, approved, HEADER
from tests.test_items_markets_api import public


@pytest.fixture
def prices(memory, monkeypatch):
    confirmations = []
    get_item = lambda c, i: SimpleNamespace(
        item_id=i, name='양파', default_unit='unit:kg', units=['unit:kg']
    )
    monkeypatch.setattr(item_service, 'get_item', get_item)
    monkeypatch.setattr(store_price_service, 'get_item', get_item)
    monkeypatch.setattr(price_repo, 'list_reports', lambda *a, **kw: [])
    monkeypatch.setattr(
        price_repo, 'sale_units', lambda *a: [dict(id='unit:kg', props={'default': True})]
    )
    monkeypatch.setattr(
        price_repo,
        'store_confirmations',
        lambda c, s, i=None: [
            r
            for r in reversed(confirmations)
            if r['store_id'] == s and (not i or r['item_id'] == i)
        ],
    )

    def save(c, s, i, u, p, uid):
        row = dict(
            store_id=s,
            item_id=i,
            unit_id=u,
            price=p,
            confirmed_by=uid,
            confirmed_at=datetime.now(UTC),
        )
        confirmations.append(row)
        return {k: row[k] for k in ('price', 'confirmed_at')}

    monkeypatch.setattr(price_repo, 'confirm_store_price', save)
    return memory, confirmations


def test_prices_auth_ownership_and_contract(prices):
    state, confirmations = prices
    client = state['client']
    payload = dict(item_id='item:onion', price=1800)
    assert client.get('/merchant/prices').status_code == 401
    assert client.post('/merchant/prices/confirm', headers=HEADER, json=payload).status_code == 401
    approved(state)
    assert client.post('/merchant/prices/confirm', json=payload).status_code == 403
    for change in (
        dict(item_id='item:apple'),
        dict(unit='unit:bunch'),
        dict(price=9),
        dict(price=10000001),
    ):
        assert (
            client.post(
                '/merchant/prices/confirm', headers=HEADER, json=payload | change
            ).status_code
            == 422
        )
    response = client.post(
        '/merchant/prices/confirm', headers=HEADER, json=payload | dict(store_id='store:b')
    )
    assert response.status_code == 200
    assert set(response.json()) == {'price', 'confirmed_at'}
    assert confirmations[0]['store_id'] == 'store:a'
    row = client.get('/merchant/prices').json()[0]
    assert set(row) == {'item_id', 'name', 'unit', 'customers', 'my_confirmation'}
    assert row['customers'] is None and row['my_confirmation']['price'] == 1800
    assert set(row['my_confirmation']) == {'price', 'confirmed_at'}


def test_map_price_order_unit_and_keys(public, monkeypatch):
    client = public[0]
    monkeypatch.setattr(
        price_repo,
        'list_reports',
        lambda *a, **kw: [
            dict(
                id=1,
                store_id='store:demo-A06',
                device_hash=d,
                price=5000,
                quantity=1,
                unit_id='unit:kg',
                reported_at=datetime.now(UTC),
            )
            for d in 'abc'
        ],
    )
    monkeypatch.setattr(
        price_repo,
        'sale_units',
        lambda *a: [dict(id='unit:kg', props={}), dict(id='unit:bunch', props={'factor_kg': 0.8})],
    )
    response = client.get('/markets/market:demo/map?item_id=item:green_onion&unit=unit:bunch')
    assert response.status_code == 200
    stores = response.json()['stores']
    assert stores[0]['store_id'] == 'store:demo-A06'
    price = stores[0]['price']
    assert price['price'] == 4000 and price['unit'] == 'unit:bunch'
    assert set(price) == {
        'price',
        'unit',
        'source',
        'reporters',
        'latest_at',
        'stale',
        'merchant_confirmed',
        'observed_on',
    }
    assert all(s['price'] is None for s in client.get('/markets/market:demo/map').json()['stores'])
