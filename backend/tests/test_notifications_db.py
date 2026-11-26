# FastAPI dependencies and pytest fixture imports are intentional.
# ruff: noqa: F811
"""Integration tests use only the guarded marketon_test fixture."""

from datetime import timedelta
from unittest.mock import Mock
from uuid import uuid4

from app.db.repositories import knowledge_repo
from app.services import auth_service, stats_service
from app.services import notification_service as service

from tests.test_auth_api import HEADER
from tests.test_auth_db import auth_db  # noqa: F401
from tests.test_customer_reviews import signup
from tests.test_ingest_db import db, pytestmark  # noqa: F401


def test_favorites_settings_inbox_and_ownership(auth_db, monkeypatch):
    conn, client = auth_db
    assert signup(client, 'favorite_one').status_code == 201
    uid = client.get('/auth/me').json()['user']['id']
    assert client.get('/me/favorites').json() == []
    path = '/me/favorites/store:demo-A05'
    assert client.put(path, json={'notify': True}).status_code == 403
    assert client.put(path, headers=HEADER, json={'notify': True}).json()[0]['notify'] is True
    assert client.put(path, headers=HEADER, json={'notify': False}).json()[0]['notify'] is False
    assert client.get('/me/notifications/settings').json() == {'sales': True, 'season': True}
    assert (
        client.put(
            '/me/notifications/settings', headers=HEADER, json={'sales': False, 'season': True}
        ).status_code
        == 200
    )
    with conn.transaction():
        n = service.create(conn, uid, 'test:one', 'sale', '제목', '본문', '/shop')
        assert service.create(conn, uid, 'test:one', 'sale', '제목', '본문', '/shop') is None
    assert len(client.get('/me/notifications?unread=true').json()) == 1
    assert client.post(f'/me/notifications/{n["id"]}/read', headers=HEADER).status_code == 204
    assert client.get('/me/notifications?unread=true').json() == []
    assert client.post('/me/notifications/read-all', headers=HEADER).status_code == 204
    assert client.delete(path, headers=HEADER).json() == []
    assert signup(client, 'favorite_two').status_code == 201
    assert client.get('/me/notifications').json() == []
    assert client.post(f'/me/notifications/{n["id"]}/read', headers=HEADER).status_code == 404


def test_sale_recipient_filters_idempotence_and_stats(auth_db, monkeypatch, no_real_push):
    conn, _client = auth_db
    ids = []
    for i in range(4):
        uid = uuid4()
        ids.append(uid)
        conn.execute(
            "insert into users(id,login_id,password_hash,role,status) values(%s,%s,'unused','customer','approved')",
            (uid, f'notice_{i}'),
        )
    for i in range(3):
        conn.execute(
            'insert into favorites(user_id,store_id,notify) values(%s,%s,%s)',
            (ids[i], 'store:demo-A05', i != 1),
        )
    conn.execute('insert into notification_settings values(%s,false,true)', (ids[2],))
    instant = auth_service.now()
    sale = conn.execute(
        "insert into closing_sales(store_id,item_id,sale_price,starts_at,ends_at) values('store:demo-A05','item:green_onion',1000,%s,%s) returning id",
        (instant, instant + timedelta(minutes=1)),
    ).fetchone()[0]
    notices = service.sale_notice(conn, sale)
    assert [n['user_id'] for n in notices] == [ids[0]]
    assert '1,000원 마감세일' in notices[0]['body']
    assert service.sale_notice(conn, sale) == []
    assert stats_service.merchant(conn, {'store_id': 'store:demo-A05'}, 7)['favorites'] == 3
    conn.execute("update notifications set created_at=now()-interval '91 days'")
    service.cleanup(conn)
    assert conn.execute('select count(*) from notifications').fetchone()[0] == 0
    assert service.sale_notice(conn, sale) == []


def test_season_month_and_opt_out(auth_db, monkeypatch):
    conn, client = auth_db
    assert signup(client, 'season_one').status_code == 201
    uid = client.get('/auth/me').json()['user']['id']
    lookup = Mock(side_effect=lambda c, m: [{'name': '귤' if m == 12 else '대파'}])
    monkeypatch.setattr(knowledge_repo, 'in_season', lookup)
    assert service.season_notice(conn, 12, 2026)[0]['title'] == '12월 제철: 귤'
    assert service.season_notice(conn, 12, 2026) == []
    assert service.season_notice(conn, 1, 2027)[0]['title'] == '1월 제철: 대파'
    conn.execute('insert into notification_settings values(%s,true,false)', (uid,))
    assert service.season_notice(conn, 2, 2027) == []


def test_push_subscription_keys_and_account_ownership(auth_db, monkeypatch):
    import os
    from urllib.parse import urlsplit

    from app.services import web_push
    from cryptography.hazmat.primitives.asymmetric import ec

    conn, client = auth_db
    signup(client, 'push_first')
    monkeypatch.setattr(web_push, 'validate_endpoint', urlsplit)
    key = ec.generate_private_key(ec.SECP256R1())
    payload = {
        'endpoint': 'https://push.example.com/sub',
        'keys': {
            'p256dh': web_push.encode(web_push.public_bytes(key.public_key())),
            'auth': web_push.encode(os.urandom(16)),
        },
    }
    assert client.post('/me/push/subscribe', headers=HEADER, json=payload).status_code == 204
    assert client.post('/me/push/subscribe', headers=HEADER, json=payload).status_code == 204
    assert conn.execute('select count(*) from push_subscriptions').fetchone()[0] == 1
    signup(client, 'push_second')
    assert (
        client.request(
            'DELETE', '/me/push/subscribe', headers=HEADER, json={'endpoint': payload['endpoint']}
        ).status_code
        == 204
    )
    assert conn.execute('select count(*) from push_subscriptions').fetchone()[0] == 1
    assert client.post('/me/push/subscribe', headers=HEADER, json=payload).status_code == 204
    assert (
        client.request(
            'DELETE', '/me/push/subscribe', headers=HEADER, json={'endpoint': payload['endpoint']}
        ).status_code
        == 204
    )
    assert conn.execute('select count(*) from push_subscriptions').fetchone()[0] == 0
    payload['keys']['auth'] = 'invalid'
    assert client.post('/me/push/subscribe', headers=HEADER, json=payload).status_code == 422
