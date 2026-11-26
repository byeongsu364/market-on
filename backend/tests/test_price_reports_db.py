"""Report persistence integration, restricted to marketon_test by shared fixture."""

from datetime import UTC, datetime, timedelta
from hashlib import sha256
from pathlib import Path

from fastapi.testclient import TestClient
from psycopg import Rollback

from app.core.config import settings
from app.db.repositories import media_repo, store_repo
from app.deps import get_db
from app.main import app
from scripts.load_ontology import load_ontology
from scripts.load_sources import load_sources
from tests.test_ingest_db import db as database_fixture
from tests.test_ingest_db import pytestmark as database_marks
from tests.test_price_reports import BODY, DEVICE, HEADERS

db = database_fixture
pytestmark = database_marks


def test_report_windows_limit_and_privacy(db):
    data = Path(__file__).resolve().parents[2] / 'data'
    with db.transaction():
        load_sources(db, data / 'sources.yaml')
        load_ontology(db, data / 'ontology')
        store_repo.upsert_market(db, id=BODY['market_id'], name_ko='시험', source='manual')
        photo = media_repo.insert_media(db, kind='photo', path='test.jpg')
        store_repo.upsert_store(
            db,
            id='store:test-report',
            market_id=BODY['market_id'],
            name_ko='시험 점포',
            source='manual',
        )
        app.dependency_overrides[get_db] = lambda: db
        try:
            with TestClient(app) as client:
                first = client.post('/price-reports', json=BODY, headers=HEADERS)
                assert first.status_code == 201
                rid = first.json()['id']
                second = client.post('/price-reports', json=BODY | {'price': 4000}, headers=HEADERS)
                assert second.json() == {'id': rid, 'updated': True, 'held': False}
                row = db.execute(
                    'select device_hash,price from price_reports where id=%s', (rid,)
                ).fetchone()
                digest = sha256((DEVICE + settings.DEVICE_HASH_SALT).encode()).hexdigest()
                assert row == (digest, 4000) and DEVICE not in str(row)
                # The stored report is now outside the correction window.
                db.execute(
                    "update price_reports set reported_at=clock_timestamp()-interval '11 minutes' where id=%s",
                    (rid,),
                )
                third = client.post('/price-reports', json=BODY, headers=HEADERS)
                assert third.status_code == 201 and third.json()['updated'] is False
                assert third.json()['id'] != rid
                # 점포를 나중에 고르면 같은 기기의 시장 단위 제보를 그 점포 제보로 바꿈.
                fourth = client.post(
                    '/price-reports',
                    json=BODY
                    | {
                        'store_id': 'store:test-report',
                        'method': 'price_tag_photo',
                        'media_id': str(photo),
                        'unit': 'unit:bunch',
                        'quantity': 3,
                    },
                    headers=HEADERS,
                )
                assert fourth.status_code == 201
                assert fourth.json() == {'id': third.json()['id'], 'updated': True, 'held': False}
                assert (
                    db.execute(
                        'select store_id from price_reports where id=%s', (third.json()['id'],)
                    ).fetchone()[0]
                    == 'store:test-report'
                )
                # 점포 제보가 있으면 시장 단위 재제출은 새 행 (점포 제보를 덮지 않음).
                fifth = client.post('/price-reports', json=BODY, headers=HEADERS)
                assert fifth.status_code == 201 and fifth.json()['updated'] is False
                for _ in range(27):
                    db.execute(
                        """insert into price_reports(market_id,item_id,price,method,device_hash,reported_at)
                        values(%s,%s,3000,'manual',%s,%s)""",
                        (
                            BODY['market_id'],
                            BODY['item_id'],
                            digest,
                            datetime.now(UTC) - timedelta(minutes=20),
                        ),
                    )
                limited = client.post('/price-reports', json=BODY, headers=HEADERS)
                assert limited.status_code == 429
                assert limited.json()['error']['code'] == 'TOO_MANY_REPORTS'
                db.execute(
                    "update price_reports set reported_at=clock_timestamp()-interval '61 minutes' where device_hash=%s",
                    (digest,),
                )
                assert client.post('/price-reports', json=BODY, headers=HEADERS).status_code == 201
        finally:
            app.dependency_overrides.pop(get_db, None)
        raise Rollback()


def test_trust_storage_and_ontology_projection(db, monkeypatch):
    from types import SimpleNamespace
    from app.db.repositories import price_repo
    from app.knowledge import storage
    from app.services import price_report_service, store_price_service
    from app.schemas.price_report import PriceReportRequest

    data = Path(__file__).resolve().parents[2] / 'data'
    with db.transaction():
        load_sources(db, data / 'sources.yaml')
        load_ontology(db, data / 'ontology')
        store_repo.upsert_market(db, id=BODY['market_id'], name_ko='시험', source='manual')
        store_repo.upsert_store(
            db, id='store:trust', market_id=BODY['market_id'], name_ko='시험', source='manual'
        )
        assert (
            db.execute(
                "select count(*) from entity_relations r join sources s on s.id=r.source_id where predicate='storedAs'"
            ).fetchone()[0]
            == 4
        )
        assert '0℃' in storage.storage_statements(db, 'item:apple', '사과')[0][0]
        monkeypatch.setattr(
            price_report_service.price_service,
            'get_price',
            lambda *a, **kw: SimpleNamespace(unit='unit:bunch', reference_price=1000),
        )
        payload = BODY | dict(store_id='store:trust', unit='unit:bunch', quantity=1, price=1000)
        for device in ('a', 'b'):
            price_report_service.submit(db, PriceReportRequest(**payload), device)
        store = store_repo.get_store(db, 'store:trust')
        assert store_price_service.store_price(db, store, BODY['item_id'], with_pending=True) == (
            None,
            None,
            2,
        )
        held = price_report_service.submit(
            db, PriceReportRequest(**(payload | dict(price=3010))), 'c'
        )
        assert held['held']
        assert (
            db.execute(
                "select props->>'status' from onto_node where id=%s", (f'report:{held["id"]}',)
            ).fetchone()[0]
            == 'held'
        )
        assert (
            store_price_service.store_price(db, store, BODY['item_id'], with_pending=True)[2] == 2
        )
        assert not db.execute(
            "select id from onto_node where props->>'origin'='제보' and props->>'store_id'='store:trust'"
        ).fetchall()
        corrected = price_report_service.submit(db, PriceReportRequest(**payload), 'c')
        assert corrected['updated'] and not corrected['held']
        customer, shown, pending = store_price_service.store_price(
            db, store, BODY['item_id'], with_pending=True
        )
        assert shown == customer and shown['reporters'] == 3 and pending == 0
        projection = db.execute(
            "select props from onto_node where props->>'origin'='제보' and props->>'store_id'='store:trust'"
        ).fetchone()[0]
        assert projection['price'] == 1000 and projection['reporters'] == 3
        assert 'device_hash' not in projection
        assert (
            db.execute(
                "select count(*) from onto_edge where obj='price:report:store:trust:item:green_onion' and pred='hasPrice'"
            ).fetchone()[0]
            == 2
        )
        raise Rollback()
