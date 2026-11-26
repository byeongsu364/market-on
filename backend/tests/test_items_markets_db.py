"""Actual ontology search and map SQL, restricted to marketon_test."""

from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from psycopg import Rollback

from app.db.repositories import sale_repo, store_repo
from app.deps import get_db
from app.main import app
from scripts.load_ontology import load_ontology
from scripts.load_sources import load_sources
from scripts.seed_demo_market import seed_demo_market
from tests.test_ingest_db import db, pytestmark
from tests.test_items_markets_api import ITEM_KEYS


def test_public_sql_contract(db):
    data = Path(__file__).resolve().parents[2] / 'data'
    with db.transaction():
        load_sources(db, data / 'sources.yaml')
        load_ontology(db, data / 'ontology')
        seed_demo_market(db)
        seed_demo_market(db)
        app.dependency_overrides[get_db] = lambda: db
        try:
            with TestClient(app) as c:
                item = c.get('/items/item:green_onion').json()
                assert set(item) == ITEM_KEYS
                assert item['default_unit'] == 'unit:bunch' and len(item['criteria']) == 4
                assert all(v['source'] == '이달의 식재료 - 움파(대파)' for v in item['criteria'])
                for q, eid in [
                    ('파', 'item:green_onion'),
                    ('scallion', 'item:green_onion'),
                    ('apple', 'item:apple'),
                ]:
                    result = c.get('/items/search', params={'q': q}).json()
                    assert result[0]['item_id'] == eid
                    assert len({v['item_id'] for v in result}) == len(result) <= 10
                    assert all(set(v) == ITEM_KEYS for v in result)
                empty = c.get('/items/search?q=').json()
                assert empty and all(
                    set(v) == ITEM_KEYS for v in empty
                )  # 빈 검색어 = 전체 목록 (직접 입력용)
                instant = datetime.now(UTC)
                # Use Seoul midnight to satisfy the operational same-day constraint.
                from zoneinfo import ZoneInfo

                midnight = (instant.astimezone(ZoneInfo('Asia/Seoul')) + timedelta(days=1)).replace(
                    hour=0, minute=0, second=0, microsecond=0
                )
                values = dict(
                    item_id='item:onion', sale_price=2000, starts_at=instant, ends_at=midnight
                )
                old = sale_repo.create(db, 'store:demo-A05', values)
                latest = sale_repo.create(db, 'store:demo-A05', values | {'sale_price': 1500})
                # Same created_at (transaction clock) must break ties by id.
                assert latest['id'] > old['id']
                ended = sale_repo.create(db, 'store:demo-A05', values | {'sale_price': 1000})
                sale_repo.end(db, ended['id'], 'store:demo-A05')
                result = c.get('/markets/market:demo/map?item_id=item:green_onion').json()
                assert len(result['zones']) == 6 and len(result['stores']) == 24
                assert len([s for s in result['stores'] if s['highlight']]) == 3
                store = next(s for s in result['stores'] if s['store_id'] == 'store:demo-A05')
                assert store['active_sale']['sale_price'] == 1500
                store_repo.upsert_market(
                    db, id='market:no-coordinates', name_ko='없음', source='manual'
                )
                assert 'market:no-coordinates' not in [
                    m['market_id'] for m in c.get('/markets/nearby').json()
                ]
        finally:
            app.dependency_overrides.pop(get_db, None)
        raise Rollback()


def test_market_item_counts_active_only(db):
    data = Path(__file__).resolve().parents[2] / 'data'
    with db.transaction():
        load_sources(db, data / 'sources.yaml')
        load_ontology(db, data / 'ontology')
        seed_demo_market(db)
        before = store_repo.market_item_counts(db, 'market:demo')
        assert before == sorted(before, key=lambda row: (row['name'], row['item_id']))
        onion = next(row for row in before if row['item_id'] == 'item:green_onion')
        assert onion['store_count'] == 3
        store_repo.upsert_store(
            db,
            id='store:demo-A05',
            market_id='market:demo',
            name_ko='점포 A-05',
            source='manual',
            active=False,
        )
        after = store_repo.market_item_counts(db, 'market:demo')
        assert (
            next(row for row in after if row['item_id'] == 'item:green_onion')['store_count'] == 2
        )
        raise Rollback()
