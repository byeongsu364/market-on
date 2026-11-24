"""Offline guest report validation, privacy and contract checks."""

from contextlib import nullcontext
from hashlib import sha256
from unittest.mock import Mock
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, settings
from app.db.repositories import knowledge_repo, media_repo, price_repo, store_repo
from app.deps import get_db
from app.main import app

DEVICE = '11111111-1111-1111-1111-111111111111'
HEADERS = {'X-Requested-With': 'market-on', 'X-Device-Id': DEVICE}
BODY = {
    'item_id': 'item:green_onion',
    'market_id': 'market:test',
    'price': 3000,
    'method': 'manual',
}


@pytest.fixture
def api(monkeypatch):
    conn = Mock(transaction=nullcontext)
    monkeypatch.setattr(knowledge_repo, 'get_item', lambda c, i: i == BODY['item_id'])
    monkeypatch.setattr(knowledge_repo, 'valid_unit', lambda c, i: i == 'unit:bunch')
    monkeypatch.setattr(store_repo, 'get_market', lambda c, i: i == BODY['market_id'])
    monkeypatch.setattr(store_repo, 'get_store', lambda c, i: {'market_id': 'other'})
    monkeypatch.setattr(media_repo, 'get_media', lambda c, i: {'kind': 'photo'})
    monkeypatch.setattr(price_repo, 'lock_device', Mock())
    monkeypatch.setattr(price_repo, 'hourly_report_count', lambda *a: 0)
    save = Mock(return_value={'id': 7, 'updated': False})
    monkeypatch.setattr(price_repo, 'save_recent_report', save)
    app.dependency_overrides[get_db] = lambda: conn
    try:
        with TestClient(app) as client:
            yield client, save, conn
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_contract_privacy_and_photo(api):
    client, save, _ = api
    result = client.post('/price-reports', json=BODY, headers=HEADERS)
    assert result.status_code == 201
    assert result.json() == {'id': 7, 'updated': False}
    values = save.call_args.args[1]
    assert (
        values['device_hash'] == sha256((DEVICE + settings.DEVICE_HASH_SALT).encode()).hexdigest()
    )
    assert DEVICE not in str(values)
    assert 'unit' not in values and values['unit_id'] is None
    save.return_value = {'id': 7, 'updated': True}
    result = client.post(
        '/price-reports',
        json=BODY
        | {'method': 'price_tag_photo', 'media_id': DEVICE, 'unit': 'unit:bunch', 'quantity': 3},
        headers=HEADERS,
    )
    assert result.status_code == 201 and result.json() == {'id': 7, 'updated': True}


@pytest.mark.parametrize(
    ('changes', 'status'),
    [
        ({'price': 9}, 422),
        ({'price': 10000001}, 422),
        ({'price': True}, 422),
        ({'item_id': 'cat:vegetable'}, 422),
        ({'market_id': 'missing'}, 422),
        ({'store_id': 'store:other'}, 422),
        ({'unit': 'item:green_onion'}, 422),
        ({'quantity': 0}, 422),
        ({'quantity': -1}, 422),
        ({'method': 'price_tag_photo'}, 422),
        ({'method': 'other'}, 422),
        ({'media_id': 'invalid'}, 422),
    ],
)
def test_invalid(api, changes, status):
    assert api[0].post('/price-reports', json=BODY | changes, headers=HEADERS).status_code == status
    api[1].assert_not_called()


@pytest.mark.parametrize(
    ('headers', 'status'),
    [
        ({}, 403),
        ({'X-Device-Id': DEVICE}, 403),
        ({'X-Requested-With': 'market-on'}, 422),
        (HEADERS | {'X-Device-Id': 'bad'}, 422),
    ],
)
def test_headers(api, headers, status):
    assert api[0].post('/price-reports', json=BODY, headers=headers).status_code == status


@pytest.mark.parametrize('media', [None, {'kind': 'audio'}])
def test_invalid_media(api, monkeypatch, media):
    monkeypatch.setattr(media_repo, 'get_media', lambda *a: media)
    assert (
        api[0].post('/price-reports', json=BODY | {'media_id': DEVICE}, headers=HEADERS).status_code
        == 422
    )


def test_limit(api, monkeypatch):
    monkeypatch.setattr(price_repo, 'hourly_report_count', lambda *a: 30)
    r = api[0].post('/price-reports', json=BODY, headers=HEADERS)
    assert r.status_code == 429 and r.json()['error']['code'] == 'TOO_MANY_REPORTS'
    api[1].assert_not_called()


def test_fixed_salt_warning(caplog):
    first = Settings(_env_file=None, DEVICE_HASH_SALT='')
    second = Settings(_env_file=None, DEVICE_HASH_SALT='')
    assert first.DEVICE_HASH_SALT == second.DEVICE_HASH_SALT
    assert 'DEVICE_HASH_SALT' in caplog.text


@pytest.mark.parametrize('recent', [None, (7,)])
def test_repository_update_or_insert(monkeypatch, recent):
    conn = Mock()
    conn.execute.return_value.fetchone.return_value = recent
    insert = Mock(return_value=8)
    monkeypatch.setattr(price_repo, 'insert_report', insert)
    values = BODY | {
        'device_hash': 'hashed',
        'store_id': None,
        'unit_id': None,
        'quantity': None,
        'media_id': UUID(DEVICE),
    }
    assert price_repo.save_recent_report(conn, values) == {
        'id': 7 if recent else 8,
        'updated': bool(recent),
    }
    if recent:
        insert.assert_not_called()
        assert 'update price_reports' in conn.execute.call_args.args[0]
    else:
        insert.assert_called_once_with(conn, **values)


def test_request_contract_keys():
    from app.schemas.price_report import PriceReportRequest

    assert set(PriceReportRequest.model_fields) == {
        'item_id',
        'market_id',
        'store_id',
        'unit',
        'quantity',
        'price',
        'method',
        'media_id',
    }
