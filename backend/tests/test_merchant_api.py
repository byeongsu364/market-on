"""Offline ownership, sale lifecycle, Seoul date validation and counters."""

from datetime import datetime, timedelta, timezone
import pytest
from app.services import merchant_service, sale_service
from tests.test_auth_api import memory, approved, HEADER


def sale_payload(**changes):
    return (
        dict(
            item_id='item:onion',
            sale_price=2000,
            regular_price=3000,
            ends_at='2026-11-24T20:00:00+09:00',
        )
        | changes
    )


@pytest.fixture
def merchant(memory, monkeypatch):
    instant = datetime(2026, 11, 24, 10, tzinfo=timezone.utc)  # 19:00 Seoul
    monkeypatch.setattr(merchant_service, 'now', lambda: instant)
    monkeypatch.setattr(sale_service, 'now', lambda: instant)
    approved(memory)
    return memory


def test_sale_lifecycle_and_ownership(merchant):
    client = merchant['client']
    r = client.post('/merchant/sales', headers=HEADER, json=sale_payload(store_id='store:b'))
    assert r.status_code == 201 and r.json()['store_id'] == 'store:a'
    sale_id = r.json()['id']
    assert len(client.get('/sales/active').json()) == 1
    assert len(client.get('/merchant/sales?status=active').json()) == 1
    merchant['sales'][99] = merchant['sales'][sale_id] | dict(id=99, store_id='store:b')
    for action in ('end', 'repost'):
        response = client.post(
            f'/merchant/sales/99/{action}',
            headers=HEADER,
            json={'ends_at': '2026-11-24T21:00:00+09:00'},
        )
        assert response.status_code == 404
    assert client.post(f'/merchant/sales/{sale_id}/end', headers=HEADER).status_code == 200
    assert all(s['id'] != sale_id for s in client.get('/sales/active').json())
    repost = client.post(
        f'/merchant/sales/{sale_id}/repost',
        headers=HEADER,
        json={'ends_at': '2026-11-24T22:00:00+09:00'},
    )
    assert repost.status_code == 201 and repost.json()['id'] != sale_id
    assert repost.json()['sale_price'] == 2000
    merchant['items']['store:a'] = []
    assert (
        client.post(
            f'/merchant/sales/{sale_id}/repost',
            headers=HEADER,
            json={'ends_at': '2026-11-24T22:00:00+09:00'},
        ).json()['error']['code']
        == 'ITEM_NOT_SOLD'
    )


@pytest.mark.parametrize(
    'changes,code',
    [
        ({'item_id': 'item:apple'}, 'ITEM_NOT_SOLD'),
        ({'ends_at': '2026-11-24T19:00:00+09:00'}, 'INVALID_ENDS_AT'),
        ({'ends_at': '2026-11-25T00:00:01+09:00'}, 'INVALID_ENDS_AT'),
        ({'regular_price': 2000}, 'INVALID_PRICE'),
        ({'regular_price': 1000}, 'INVALID_PRICE'),
        ({'unit_id': 'item:onion'}, 'INVALID_UNIT'),
        ({'sale_price': 0}, 'VALIDATION_ERROR'),
        ({'note': 'a' * 41}, 'VALIDATION_ERROR'),
        ({'ends_at': '2026-11-24T20:00:00'}, 'VALIDATION_ERROR'),
    ],
)
def test_sale_validation(merchant, changes, code):
    r = merchant['client'].post('/merchant/sales', headers=HEADER, json=sale_payload(**changes))
    assert r.status_code == 422 and r.json()['error']['code'] == code


def test_midnight_and_optional_regular_price(merchant):
    r = merchant['client'].post(
        '/merchant/sales',
        headers=HEADER,
        json=sale_payload(ends_at='2026-11-25T00:00:00+09:00', regular_price=None),
    )
    assert r.status_code == 201


def test_store_patch_poster_and_daily_views(merchant, monkeypatch):
    client = merchant['client']
    assert client.patch('/merchant/store', json={}).status_code == 403
    r = client.patch(
        '/merchant/store',
        headers=HEADER,
        json=dict(
            store_id='store:b',
            item_ids=['item:onion', 'item:apple'],
            hours={'open': '08:00', 'close': '21:00'},
        ),
    )
    assert r.status_code == 200 and r.json()['store_id'] == 'store:a'
    assert merchant['stores']['store:b']['hours'] is None
    assert (
        client.patch('/merchant/store', headers=HEADER, json={'item_ids': ['bad']}).status_code
        == 422
    )
    assert client.get('/merchant/poster').json()['url'].endswith('/s/store:a')
    assert client.get('/merchant/store').json()['today_views'] == 0
    for _ in range(2):
        assert client.get('/stores/store:a').status_code == 200
    assert client.get('/merchant/store').json()['today_views'] == 2
    assert client.post('/sales/999/view', headers=HEADER).status_code == 404
    sale = client.post('/merchant/sales', headers=HEADER, json=sale_payload()).json()
    assert client.post(f'/sales/{sale["id"]}/view', headers=HEADER).status_code == 204
    assert client.get('/merchant/store').json()['today_views'] == 2
    tomorrow = datetime(2026, 11, 25, 1, tzinfo=timezone.utc)
    monkeypatch.setattr(merchant_service, 'now', lambda: tomorrow)
    monkeypatch.setattr(sale_service, 'now', lambda: tomorrow)
    assert client.get('/merchant/store').json()['today_views'] == 0
    client.get('/stores/store:a')
    assert client.get('/merchant/store').json()['today_views'] == 1


def test_seed_help_never_connects(monkeypatch):
    from scripts import seed_demo_market
    from unittest.mock import Mock

    connect = Mock(side_effect=AssertionError('help must not connect'))
    monkeypatch.setattr(seed_demo_market, 'connection', connect)
    monkeypatch.setattr('sys.argv', ['seed_demo_market', '--help'])
    with pytest.raises(SystemExit) as exc:
        seed_demo_market.main()
    assert exc.value.code == 0
    connect.assert_not_called()
