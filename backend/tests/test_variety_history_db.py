"""036 persistence and constraints, exclusively marketon_test."""

from datetime import datetime, timezone

import pytest
from psycopg.errors import CheckViolation, ForeignKeyViolation, UniqueViolation

from tests.test_ingest_db import db, pytestmark
from tests.test_auth_db import auth_db
from app.db.repositories import merchant_repo, price_repo
from app.services import merchant_service, market_service, item_service, sale_service
from app.schemas.merchant import StorePatch


def test_ingest_search_store_map_and_sale(auth_db):
    conn, _ = auth_db
    from scripts.load_sources import load_sources
    from scripts.load_ontology import load_ontology

    load_sources(conn)
    load_ontology(conn)
    assert (
        conn.execute(
            "select count(*) from entities where type='variety' and attrs ? 'description'"
        ).fetchone()[0]
        == 2
    )
    assert (
        conn.execute(
            "select count(*) from entities e join sources s on s.source_key=e.attrs->>'description_source'"
        ).fetchone()[0]
        == 2
    )
    found = item_service.search(conn, '부사')
    assert found[0].item_id == 'item:apple' and found[0].variety_id == 'variety:apple-fuji'
    user = {'store_id': 'store:demo-A05'}
    selections = {'item:apple': ['variety:apple-fuji', 'variety:apple-hongro']}
    updated = merchant_service.patch_store(
        conn, user, StorePatch(item_ids=['item:apple'], varieties=selections)
    )
    assert updated['varieties'] == selections
    view = market_service.market_map(conn, 'market:demo', 'item:apple')
    store = next(s for s in view.stores if s.store_id == user['store_id'])
    assert store.varieties == selections['item:apple']
    end = (
        datetime.now(timezone.utc)
        .astimezone(sale_service.SEOUL)
        .replace(hour=23, minute=59, second=59)
    )
    sale = merchant_service.create_sale(
        conn,
        user,
        dict(item_id='item:apple', variety_id='variety:apple-fuji', sale_price=1000, ends_at=end),
    )
    public = next(s for s in sale_service.active(conn) if s['id'] == sale['id'])
    assert public['variety_name'] == '후지'
    for table, values in [
        ('store_item_varieties', "('store:demo-A05','item:apple','variety:pear-shingo')")
    ]:
        with pytest.raises(CheckViolation), conn.transaction():
            conn.execute(f'insert into {table} values {values}')
    with pytest.raises(ForeignKeyViolation), conn.transaction():
        conn.execute(
            "insert into store_item_varieties values('store:demo-A05','item:pear','variety:pear-shingo')"
        )
    with pytest.raises(UniqueViolation), conn.transaction():
        conn.execute(
            "insert into store_item_varieties values('store:demo-A05','item:apple','variety:apple-fuji')"
        )
    with pytest.raises(CheckViolation), conn.transaction():
        conn.execute(
            "update closing_sales set variety_id='variety:pear-shingo' where id=%s", (sale['id'],)
        )
    merchant_service.patch_store(conn, user, StorePatch(item_ids=['item:onion']))
    assert merchant_repo.varieties(conn, user['store_id']) == {}


def test_weekly_observation_sql(auth_db):
    from datetime import date
    from scripts.load_sources import load_sources
    from scripts.load_ontology import load_ontology
    from app.services import price_service

    conn, _ = auth_db
    load_sources(conn)
    load_ontology(conn)
    for day, price, region, kind, code in [
        ('2026-11-22', 20000, '서울', 'traditional', 'a'),
        ('2026-11-23', 30000, '서울', 'traditional', 'a'),
        ('2026-11-23', 90000, '서울', 'large_retail', 'b'),
        ('2026-11-23', 90000, '부산', 'traditional', 'c'),
    ]:
        price_repo.upsert_observations(
            conn,
            [
                dict(
                    source='036-test',
                    exmn_ymd=day,
                    se_cd='01',
                    item_cd='411',
                    vrty_cd='05',
                    grd_cd='04',
                    item_nm='사과',
                    vrty_nm='후지',
                    grd_nm='상품',
                    sgg_nm=region,
                    mrkt_cd=code,
                    mrkt_nm='조사처',
                    market_type=kind,
                    unit='개',
                    unit_sz='10',
                    price=price,
                    item_id='item:apple',
                    variety_id='variety:apple-fuji',
                )
            ],
        )
    result = price_service.get_history(
        conn,
        'item:apple',
        variety_id='variety:apple-fuji',
        market_id='market:demo',
        weeks=3,
        on_date=date(2026, 11, 23),
    )
    assert [p['price'] for p in result['points']] == [None, 2000, 3000]
