"""035 SQL constraints, source reloading and seven-day counts; test DB only."""

from pathlib import Path

import pytest
import yaml
from psycopg import Rollback
from psycopg.errors import CheckViolation

from app.db.repositories import store_repo
from app.services import market_service
from scripts.load_market_stores import load_market_stores
from scripts.load_sources import load_sources
from scripts.load_ontology import load_ontology
from tests.test_ingest_db import db, pytestmark
from tests.test_market_stores import fixture_rows


def test_loader_preserves_confirmed_location_and_details(db):
    data = Path(__file__).resolve().parents[2] / 'data'
    with db.transaction():
        load_sources(db, data / 'sources.yaml')
        load_ontology(db, data / 'ontology')
        config = yaml.safe_load((data / 'markets/gyeongdong.yaml').read_text())
        rows = fixture_rows()
        load_market_stores(db, config, rows)
        store = store_repo.get_store(db, 'store:gd-0')
        assert (store['lat'], store['lng'], store['location_verified']) == (37.58, 127.04, False)
        db.execute(
            "update stores set lat=37.581,lng=127.041,location_verified=true,payments=ARRAY['card'],intro='소개' where id='store:gd-0'"
        )
        rows[0].update(lat=37.582, lon=127.042)
        rows[1].update(lat=37.583, lon=127.043)
        load_market_stores(db, config, rows)
        confirmed = store_repo.get_store(db, 'store:gd-0')
        assert (confirmed['lat'], confirmed['lng'], confirmed['location_verified']) == (
            37.581,
            127.041,
            True,
        )
        assert (confirmed['payments'], confirmed['intro']) == (['card'], '소개')
        assert store_repo.get_store(db, 'store:gd-1')['lat'] == 37.583
        assert store_repo.get_market(db, config['market']['id'])['amenities'] is None
        for query in [
            "update stores set payments=ARRAY['invalid'] where id='store:gd-0'",
            "update stores set intro=repeat('가',81) where id='store:gd-0'",
        ]:
            with pytest.raises(CheckViolation), db.transaction():
                db.execute(query)
        raise Rollback()


def test_market_counts_use_active_stores_and_seven_days(db):
    with db.transaction():
        store_repo.upsert_market(
            db, id='market:035', name_ko='테스트', lat=37, lng=127, source='manual'
        )
        for sid, active in [('a', True), ('b', False)]:
            store_repo.upsert_store(
                db,
                id=f'store:035-{sid}',
                market_id='market:035',
                name_ko=sid,
                source='manual',
                active=active,
            )
        for days, kind in [(0, 'request'), (6, 'request'), (7, 'request'), (0, 'nearby')]:
            db.execute(
                "insert into market_demand(market_id, day, device_hash, kind) values('market:035', (now() at time zone 'Asia/Seoul')::date-%s, %s, %s)",
                (days, f'{days}-{kind}', kind),
            )
        result = market_service.market_detail(db, 'market:035')
        assert (result.store_count, result.requests, result.amenities) == (1, 2, None)
        raise Rollback()
