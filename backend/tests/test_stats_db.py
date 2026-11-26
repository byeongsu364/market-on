"""Real aggregates on the explicitly isolated marketon_test database."""

from datetime import datetime, timedelta
from uuid import uuid4
from psycopg.errors import CheckViolation
import pytest
from tests.test_ingest_db import db, pytestmark
from tests.test_auth_db import auth_db
from app.services import stats_service, auth_service
from app.db.repositories import stats_repo
from app.services.sale_service import SEOUL


def test_daily_views_directions_and_constraints(auth_db, monkeypatch):
    conn, _ = auth_db
    today = datetime(2026, 11, 27, 0, tzinfo=SEOUL)
    monkeypatch.setattr(stats_service, 'now', lambda: today)
    sid = 'store:demo-A05'
    conn.execute('delete from store_views')
    conn.execute(
        'insert into store_views(store_id,day,count) values(%s,%s,4),(%s,%s,99)',
        (sid, today.date(), 'store:demo-A08', today.date()),
    )
    sale = conn.execute(
        """insert into closing_sales(store_id,item_id,sale_price,starts_at,ends_at)
        values(%s,'item:green_onion',1000,%s,%s) returning id""",
        (sid, today, today + timedelta(hours=1)),
    ).fetchone()[0]
    conn.execute(
        'insert into store_views(store_id,sale_id,day,count) values(%s,%s,%s,3)',
        (sid, sale, today.date()),
    )
    stats_repo.directions(conn, sid, today.date())
    stats_repo.directions(conn, sid, today.date())
    result = stats_service.merchant(conn, {'store_id': sid}, 7)
    assert result['today'] == dict(views=7, directions=2)
    assert len(result['days']) == 7 and result['days'][0]['views'] == 0
    with pytest.raises(CheckViolation), conn.transaction():
        conn.execute('update store_directions set count=-1 where store_id=%s', (sid,))


def test_market_and_operator_aggregates(auth_db):
    conn, _ = auth_db
    day = auth_service.now().astimezone(SEOUL).date()
    conn.execute('delete from store_views')
    # Add a different market to prove the scope is enforced.
    conn.execute(
        "insert into markets(id,name_ko,status,source) values('market:stats-other','다른 시장','active','manual'),('market:stats-listed','요청 시장','listed','manual'),('market:stats-empty','빈 시장','listed','manual')"
    )
    conn.execute(
        "insert into stores(id,market_id,name_ko,active,source) values('store:stats-other','market:stats-other','다른 점포',true,'manual')"
    )
    for sid, offset, count in [
        ('store:demo-A05', 0, 3),
        ('store:demo-A05', 6, 4),
        ('store:demo-A05', 7, 100),
        ('store:stats-other', 0, 99),
    ]:
        conn.execute(
            'insert into store_views(store_id,day,count) values(%s,%s,%s)',
            (sid, day - timedelta(days=offset), count),
        )
    for login, sid, status in [
        ('stats_good', 'store:demo-A05', 'approved'),
        ('stats_wait', 'store:demo-A08', 'pending'),
        ('stats_foreign', 'store:stats-other', 'approved'),
    ]:
        conn.execute(
            "insert into users(id,login_id,password_hash,role,status,store_id) values(%s,%s,%s,'merchant',%s,%s)",
            (uuid4(), login, 'unused', status, sid),
        )
    manager = {'market_id': 'market:demo'}
    result = stats_service.market(conn, manager)
    assert result['views_week'] == 7
    assert result['merchants_approved'] == result['merchants_pending'] == 1
    assert (
        result['stores']
        == conn.execute(
            "select count(*) from stores where market_id='market:demo' and active"
        ).fetchone()[0]
    )
    assert [r['login_id'] for r in result['recent']] == ['stats_good']
    assert result['recent'][0]['last_sale_at'] is None and result['recent'][0]['sales_week'] == 0
    for offset in (0, 6, 7):
        conn.execute(
            "insert into market_demand(market_id,day,device_hash,kind) values('market:stats-listed',%s,%s,'request')",
            (day - timedelta(days=offset), str(offset)),
        )
    conn.execute(
        "insert into market_demand(market_id,day,device_hash,kind) values('market:stats-empty',%s,'near','nearby')",
        (day,),
    )
    listed = stats_service.markets(conn, 'listed')
    assert listed[0] == dict(
        market_id='market:stats-listed',
        name='요청 시장',
        requests_week=2,
        requests_total=3,
        application=None,
    )
    conn.execute(
        "insert into market_applications(market_id,manager_org,contact) values('market:stats-listed','상인회','test')"
    )
    assert stats_service.markets(conn, 'listed')[0]['application']['status'] == 'pending'
    active = stats_service.markets(conn, 'active')
    assert all(m['market_id'] not in ('market:stats-listed', 'market:stats-empty') for m in active)
    assert next(m for m in active if m['market_id'] == 'market:demo')['views_week'] == 7
