"""marketon_test 전용 가격 수집·기준시세·prune 검증."""

from datetime import date
import json
from pathlib import Path
import pytest
from psycopg import Rollback
from tests.test_ingest_db import db, pytestmark
from app.db.repositories import price_repo, knowledge_repo, store_repo
from app.clients import at_price
from scripts.update_prices import update_prices


@pytest.fixture
def prices(db, monkeypatch):
    from scripts.load_sources import load_sources
    from scripts.load_ontology import load_ontology

    with db.transaction():
        load_sources(db)
        load_ontology(db)
        monkeypatch.setattr(at_price.settings, 'DATA_GO_KR_KEY', 'fixture-only')
        rows = json.loads(
            (Path(__file__).parent / 'fixtures/at_period_retail_green_onion.json').read_text()
        )['response']['body']['items']['item']
        monkeypatch.setattr(at_price, 'fetch_period_retail', lambda *a, **kw: rows)
        yield db
        raise Rollback()


def test_update_baseline_and_route(prices, monkeypatch):
    conn = prices
    assert (
        update_prices(conn, end=date(2026, 11, 22), item_id='item:green_onion')['item:green_onion'][
            'added'
        ]
        == 8
    )
    assert (
        update_prices(conn, end=date(2026, 11, 22), item_id='item:green_onion')['item:green_onion'][
            'added'
        ]
        == 0
    )
    national = price_repo.baseline(conn, 'item:green_onion', on_date=date(2026, 11, 22))
    assert national['exmn_ymd'] == date(2026, 11, 20)
    assert national['traditional']['avg'] == pytest.approx(8300 / 3)
    assert national['large_retail']['avg'] == pytest.approx(7000 / 3)
    regional = price_repo.baseline(
        conn, 'item:green_onion', on_date=date(2026, 11, 22), sgg_nm='서울', market_at_cd='0'
    )
    assert regional['scope'] == 'region' and regional['this_market']['price'] == 2500
    assert (
        price_repo.baseline(
            conn, 'item:green_onion', on_date=date(2026, 11, 22), sgg_nm='없는 지역'
        )['scope']
        == 'national'
    )
    assert price_repo.baseline(conn, 'item:green_onion', on_date=date(2026, 12, 10)) is None
    conn.execute("update price_observations set exmn_ymd='2026-11-21' where se_cd='02'")
    assert price_repo.baseline(conn, 'item:green_onion', on_date=date(2026, 11, 22))[
        'exmn_ymd'
    ] == date(2026, 11, 20)
    from fastapi.testclient import TestClient
    from app.main import app
    from app.deps import get_db

    from app.services import price_service
    from scripts.seed_demo_market import seed_demo_market

    class Today(date):
        @classmethod
        def today(cls):
            return date(2026, 11, 22)

    monkeypatch.setattr(price_service, 'date', Today)
    seed_demo_market(conn)
    assert store_repo.get_market(conn, 'market:demo')['at_sgg_nm'] == '서울'
    assert store_repo.get_market(conn, 'market:demo')['at_mrkt_cd'] is None
    app.dependency_overrides[get_db] = lambda: conn
    try:
        with TestClient(app) as client:
            result = client.get(
                '/price',
                params={
                    'item_id': 'item:green_onion',
                    'market_id': 'market:demo',
                    'unit': 'unit:bunch',
                    'seen_price': 2000,
                },
            )
        assert result.status_code == 200 and result.json()['unit'] == 'unit:bunch'
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_prune_chunk_tags_and_protected_inbound(prices, capsys):
    conn = prices
    conn.execute(
        "insert into entities(id,type,name_ko) values('item:tag-only','item','태그'),('item:linked','item','관계')"
    )
    source = conn.execute('select id from sources limit 1').fetchone()[0]
    did = conn.execute(
        "insert into documents(source_id,doc_key,doc_type,title,lang,body,content_hash) values(%s,'tag-only','guide','태그','ko','태그','tag-only') returning id",
        (source,),
    ).fetchone()[0]
    cid = conn.execute(
        "insert into chunks(document_id,chunk_index,content,doc_type,lang,content_hash) values(%s,0,'태그','guide','ko','tag-only') returning id",
        (did,),
    ).fetchone()[0]
    conn.execute("insert into chunk_entities values(%s,'item:tag-only')", (cid,))
    conn.execute(
        "insert into entity_relations(subject_id,predicate,object_id) values('item:green_onion','isA','item:linked')"
    )
    assert (
        knowledge_repo.prune_entities(
            conn, knowledge_repo.entity_ids(conn) - {'item:tag-only', 'item:linked'}
        )
        == 1
    )
    assert (
        conn.execute('select content_hash from documents where id=%s', (did,)).fetchone()[0]
        == f'retag:{did}'
    )
    assert 'entity_relations.object_id' in capsys.readouterr().err
    store_repo.upsert_market(conn, id='market:prune-price', name_ko='검증', source='manual')
    store_repo.upsert_store(
        conn,
        id='store:prune-price',
        market_id='market:prune-price',
        name_ko='검증',
        source='manual',
    )
    store_repo.set_store_items(conn, 'store:prune-price', ['item:onion'], 'manual')
    assert (
        knowledge_repo.prune_entities(conn, knowledge_repo.entity_ids(conn) - {'item:onion'}) == 0
    )
    assert 'store_items.item_id' in capsys.readouterr().err
