"""Integration price reads and writes use only the marketon_test fixture."""

from datetime import UTC, datetime
from pathlib import Path

from app.db.repositories import price_repo, user_repo
from scripts.load_ontology import load_ontology
from scripts.load_sources import load_sources
from tests.test_auth_db import auth_db
from tests.test_ingest_db import db, pytestmark
from tests.test_auth_api import HEADER, PASSWORD


def test_confirmation_and_map(auth_db):
    conn, client = auth_db
    # auth_db의 최소 시드에는 판매 단위 관계가 없어 실제 온톨로지를 올림
    data = Path(__file__).resolve().parents[2] / 'data'
    load_sources(conn, data / 'sources.yaml')
    load_ontology(conn, data / 'ontology')
    result = client.post(
        '/auth/signup',
        headers=HEADER,
        json=dict(login_id='price_merchant', password=PASSWORD, store_id='store:demo-A05'),
    )
    uid = result.json()['user']['id']
    user_repo.set_status(conn, uid, 'approved', None)
    client.post(
        '/auth/login', headers=HEADER, json=dict(login_id='price_merchant', password=PASSWORD)
    )
    payload = dict(item_id='item:green_onion', price=1800)
    assert client.post('/merchant/prices/confirm', json=payload).status_code == 403
    assert (
        client.post(
            '/merchant/prices/confirm', headers=HEADER, json=payload | dict(item_id='item:apple')
        ).status_code
        == 422
    )
    assert client.post('/merchant/prices/confirm', headers=HEADER, json=payload).status_code == 200
    rows = client.get('/merchant/prices').json()
    assert (
        next(r for r in rows if r['item_id'] == payload['item_id'])['my_confirmation']['price']
        == 1800
    )
    path = '/markets/market:demo/map?item_id=item:green_onion'
    stores = client.get(path).json()['stores']
    assert stores[0]['store_id'] == 'store:demo-A05'
    assert stores[0]['price']['source'] == 'merchant'
    price_repo.insert_report(
        conn,
        market_id='market:demo',
        store_id='store:demo-A05',
        item_id=payload['item_id'],
        unit_id=stores[0]['price']['unit'],
        price=1900,
        quantity=1,
        method='manual',
        device_hash='a' * 64,
        reported_at=datetime.now(UTC),
    )
    price = client.get(path).json()['stores'][0]['price']
    assert price['merchant_confirmed'] and price['source'] == 'customers'
    assert all(s['price'] is None for s in client.get('/markets/market:demo/map').json()['stores'])
