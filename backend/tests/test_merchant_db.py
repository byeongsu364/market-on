"""Closing-sale constraints, expression counters and repeatable demo data."""

from datetime import timedelta
import pytest
from psycopg.errors import CheckViolation, ForeignKeyViolation
from tests.test_auth_db import auth_db
from tests.test_ingest_db import db, pytestmark
from tests.test_auth_api import HEADER, PASSWORD
from app.db.repositories import sale_repo, view_repo
from app.services import auth_service
from app.services.sale_service import SEOUL
from scripts.seed_demo_market import seed_demo_market


def test_seed_twice(auth_db):
    conn, _ = auth_db

    def counts():
        return [
            conn.execute(f'select count(*) from {table}').fetchone()[0]
            for table in ('markets', 'zones', 'stores', 'store_items', 'entities')
        ]

    first = counts()
    seed_demo_market(conn)
    assert counts() == first
    assert (
        conn.execute("select count(*) from stores where market_id='market:demo'").fetchone()[0]
        == 24
    )
    assert (
        conn.execute("select count(*) from zones where market_id='market:demo'").fetchone()[0] == 6
    )
    assert (
        conn.execute(
            "select count(*) from store_items where store_id in ('store:demo-A05','store:demo-A06','store:demo-A07') and item_id in ('item:onion','item:green_onion')"
        ).fetchone()[0]
        == 6
    )


def test_sale_lifecycle_and_views(auth_db):
    conn, client = auth_db
    response = client.post(
        '/auth/signup',
        headers=HEADER,
        json=dict(login_id='sale_merchant', password=PASSWORD, store_id='store:demo-A05'),
    )
    uid = response.json()['user']['id']
    conn.execute("update users set status='approved' where id=%s", (uid,))
    instant = auth_service.now()
    # Midnight is always valid, including runs late in the Seoul day.
    end = conn.execute(
        "select ((now() at time zone 'Asia/Seoul')::date+1)::timestamp at time zone 'Asia/Seoul'"
    ).fetchone()[0]
    payload = dict(
        item_id='item:onion', sale_price=2000, regular_price=3000, ends_at=end.isoformat()
    )
    response = client.post('/merchant/sales', headers=HEADER, json=payload)
    assert response.status_code == 201
    sid = response.json()['id']
    other = sale_repo.create(
        conn,
        'store:demo-A06',
        dict(item_id='item:onion', sale_price=2000, starts_at=instant, ends_at=end),
    )
    assert client.post(f'/merchant/sales/{other["id"]}/end', headers=HEADER).status_code == 404
    assert client.post(f'/merchant/sales/{sid}/end', headers=HEADER).status_code == 200
    assert all(s['id'] != sid for s in client.get('/sales/active').json())
    assert (
        client.post(
            f'/merchant/sales/{sid}/repost', headers=HEADER, json={'ends_at': end.isoformat()}
        ).status_code
        == 201
    )
    for _ in range(2):
        assert client.get('/stores/store:demo-A05').status_code == 200
    assert client.get('/merchant/store').json()['today_views'] == 2
    assert client.post(f'/sales/{sid}/view', headers=HEADER).status_code == 204
    day = instant.astimezone(SEOUL).date()
    assert view_repo.today(conn, 'store:demo-A05', day) == 2
    assert view_repo.today(conn, 'store:demo-A05', day + timedelta(days=1)) == 0
    assert conn.execute('select count from store_views where sale_id=%s', (sid,)).fetchone()[0] == 1
    with pytest.raises(CheckViolation), conn.transaction():
        conn.execute('update closing_sales set regular_price=sale_price where id=%s', (sid,))
    with pytest.raises(CheckViolation), conn.transaction():
        conn.execute(
            "update closing_sales set ends_at=starts_at+interval '2 days' where id=%s", (sid,)
        )
    with pytest.raises(ForeignKeyViolation), conn.transaction():
        conn.execute("delete from entities where id='item:onion'")
    conn.execute('delete from closing_sales where id=%s', (sid,))
    assert not conn.execute('select 1 from store_views where sale_id=%s', (sid,)).fetchone()
    assert conn.execute("select to_regclass('public.today_picks')").fetchone()[0] is None
