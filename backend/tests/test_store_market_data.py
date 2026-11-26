"""035 offline validation, location ownership and public contracts."""

from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from pydantic import ValidationError

from app.core.errors import AppError
from app.db.repositories import store_repo
from app.schemas.merchant import StoreLocation, StorePatch
from app.services import market_service
from tests.test_auth_api import memory, approved, HEADER


@pytest.mark.parametrize(
    'hour,expected', [(8, False), (9, True), (12, True), (20, False), (21, False)]
)
def test_open_now(hour, expected):
    assert (
        market_service.open_now(
            {'open': '09:00', 'close': '20:00'},
            datetime(2026, 11, 27, hour, tzinfo=ZoneInfo('Asia/Seoul')),
        )
        is expected
    )


def test_missing_hours_and_distance():
    assert market_service.open_now(None) is None
    assert market_service.open_now({}) is None
    assert market_service.distance(37, 127, SimpleNamespace(lat=37, lng=127)) == 0
    assert (
        110 < market_service.distance(37, 127, SimpleNamespace(lat=37.001, lng=127)) * 6371000 < 112
    )


@pytest.mark.parametrize('data', [{'payments': ['bitcoin']}, {'intro': 'a' * 81}])
def test_patch_validation(data):
    with pytest.raises(ValidationError):
        StorePatch(**data)


@pytest.mark.parametrize('data', [{'lat': 91, 'lng': 127}, {'lat': float('nan'), 'lng': 127}])
def test_location_validation(data):
    with pytest.raises(ValidationError):
        StoreLocation(**data)


def test_market_detail_and_missing(monkeypatch):
    monkeypatch.setattr(
        store_repo,
        'get_market',
        lambda c, mid: (
            dict(id=mid, name_ko='시장', lat=37, lng=127, address='주소') if mid == 'm' else None
        ),
    )
    monkeypatch.setattr(store_repo, 'market_extras', lambda *a: dict(store_count=2, requests=3))
    market = market_service.market_detail(None, 'm')
    assert (market.address, market.store_count, market.requests, market.amenities) == (
        '주소',
        2,
        3,
        None,
    )
    with pytest.raises(AppError) as error:
        market_service.market_detail(None, 'missing')
    assert error.value.status_code == 404


def test_merchant_data_and_location(memory, monkeypatch):
    approved(memory)
    client = memory['client']
    monkeypatch.setattr(store_repo, 'get_market', lambda *a: dict(lat=37, lng=127))
    writes = []

    # The fixture uses a Mock connection; exercise parameterized writes and reflected reads.
    def execute(query, params):
        writes.append((query, params))
        store = memory['stores']['store:a']
        if 'payments=' in query:
            store['payments'] = params[0]
        elif 'intro=' in query:
            store['intro'] = params[0]
        elif 'location_verified=true' in query:
            store.update(lat=params[0], lng=params[1], location_verified=True)

    memory['conn'].execute.side_effect = execute
    result = client.patch(
        '/merchant/store',
        headers=HEADER,
        json={'payments': ['card', 'onnuri'], 'intro': '매일 만나요'},
    )
    assert result.status_code == 200
    assert result.json()['payments'] == ['card', 'onnuri']
    assert result.json()['intro'] == '매일 만나요'
    assert (
        client.patch(
            '/merchant/store', headers=HEADER, json={'intro': 'https://example.com'}
        ).status_code
        == 422
    )
    assert (
        client.patch('/merchant/store', headers=HEADER, json={'intro': 'a' * 81}).status_code == 422
    )
    assert (
        client.patch('/merchant/store', headers=HEADER, json={'payments': ['invalid']}).status_code
        == 422
    )
    assert (
        client.put(
            '/merchant/store/location', headers=HEADER, json={'lat': 38, 'lng': 127}
        ).status_code
        == 422
    )
    assert client.put('/merchant/store/location', json={'lat': 37, 'lng': 127}).status_code == 403
    saved = client.put('/merchant/store/location', headers=HEADER, json={'lat': 37.001, 'lng': 127})
    assert saved.status_code == 200
    assert saved.json()['location_confirmed'] is True
    assert saved.json()['location'] == {'lat': 37.001, 'lng': 127}
    assert writes[-1][1][-1] == 'store:a'
    assert client.get('/auth/me').json()['user']['created_at']
    client.post('/auth/logout', headers=HEADER)
    assert (
        client.put(
            '/merchant/store/location', headers=HEADER, json={'lat': 37, 'lng': 127}
        ).status_code
        == 401
    )


@pytest.mark.parametrize(
    'role,status', [('merchant', 'pending'), ('customer', 'approved'), ('operator', 'approved')]
)
def test_location_requires_approved_merchant(memory, role, status):
    approved(memory)
    for user in memory['users'].values():
        user.update(role=role, status=status)
    assert (
        memory['client']
        .put('/merchant/store/location', headers=HEADER, json={'lat': 37, 'lng': 127})
        .status_code
        == 403
    )
