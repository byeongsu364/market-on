"""Role constraints and aggregates; only the isolated marketon_test fixture may run these."""

import pytest
from psycopg.errors import CheckViolation
from tests.test_auth_db import auth_db
from tests.test_ingest_db import db, pytestmark
from tests.test_auth_api import PASSWORD
from app.services import auth_service, market_admin_service


def test_market_admin_constraints_and_summary(auth_db):
    conn, client = auth_db
    user = auth_service.create_market_admin(conn, 'db_manager', PASSWORD, 'market:demo')
    assert user['status'] == 'approved' and user['approved_at'] is not None
    # Multiple managers are valid; each role has exactly its own scope column.
    auth_service.create_market_admin(conn, 'db_manager_two', PASSWORD, 'market:demo')
    for role, store, market in [
        ('merchant', None, None),
        ('merchant', 'store:demo-A05', 'market:demo'),
        ('operator', None, 'market:demo'),
        ('operator', 'store:demo-A05', None),
        ('market_admin', None, None),
        ('market_admin', 'store:demo-A05', 'market:demo'),
    ]:
        with pytest.raises(CheckViolation), conn.transaction():
            conn.execute(
                'update users set role=%s,store_id=%s,market_id=%s where id=%s',
                (role, store, market, user['id']),
            )
    result = market_admin_service.market(conn, user)
    assert result['market_id'] == 'market:demo'
    assert result['stores_total'] > 0 and result['merchants_pending'] == 0


def test_summary_counts_only_this_market_and_seven_store_days(auth_db):
    conn, _ = auth_db
    user = auth_service.create_market_admin(conn, 'db_view_manager', PASSWORD, 'market:demo')
    conn.execute("""insert into store_views(store_id,day,count) values
        ('store:demo-A05',(now() at time zone 'Asia/Seoul')::date,3),
        ('store:demo-A05',(now() at time zone 'Asia/Seoul')::date-6,4),
        ('store:demo-A05',(now() at time zone 'Asia/Seoul')::date-7,100)
        on conflict(store_id,(coalesce(sale_id,0)),day) do update set count=excluded.count""")
    assert market_admin_service.market(conn, user)['views_7d'] == 7
