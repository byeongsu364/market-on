"""Offline API flows exercise the real services/security with in-memory repositories."""

from contextlib import nullcontext
from datetime import timedelta
from uuid import uuid4

import pytest
from app.core import security
from app.db.repositories import (
    merchant_repo,
    sale_repo,
    session_repo,
    store_repo,
    user_repo,
    view_repo,
)
from app.deps import get_db
from app.main import app
from app.services import auth_service
from fastapi.testclient import TestClient

HEADER = {'X-Requested-With': 'market-on'}
PASSWORD = 'merchant-password'


@pytest.fixture
def memory(monkeypatch):
    from app.services import notification_service

    monkeypatch.setattr(notification_service, 'dispatch_sale', lambda sale_id: None)
    variety_links = {}
    monkeypatch.setattr(merchant_repo, 'varieties', lambda c, sid: variety_links.get(sid, {}))
    monkeypatch.setattr(
        merchant_repo, 'set_varieties', lambda c, sid, values: variety_links.update({sid: values})
    )
    from unittest.mock import Mock

    conn = Mock(transaction=nullcontext)
    users, sessions, sales, views = {}, {}, {}, {}
    stores = {
        key: {'id': key, 'name_ko': key, 'market_id': 'market:test', 'active': True, 'hours': None}
        for key in ('store:a', 'store:b')
    }
    items = {key: ['item:onion'] for key in stores}

    def create(c, login_id, password_hash, role='merchant', store_id=None):
        from psycopg.errors import UniqueViolation

        if any(u['login_id'] == login_id for u in users.values()):
            raise UniqueViolation()
        user = {
            'id': uuid4(),
            'login_id': login_id,
            'password_hash': password_hash,
            'role': role,
            'status': 'approved' if role == 'operator' else 'pending',
            'store_id': store_id,
            'failed_logins': 0,
            'locked_until': None,
            'created_at': auth_service.now(),
        }
        users[user['id']] = user
        return user

    monkeypatch.setattr(user_repo, 'create', create)
    monkeypatch.setattr(user_repo, 'get', lambda c, uid, **kw: users.get(uid))
    monkeypatch.setattr(
        user_repo,
        'by_login',
        lambda c, lid, **kw: next((u for u in users.values() if u['login_id'] == lid), None),
    )
    monkeypatch.setattr(user_repo, 'lock_store', lambda c, sid: sid in stores)
    monkeypatch.setattr(
        user_repo,
        'store_taken',
        lambda c, sid, exclude=None: any(
            u['store_id'] == sid and u['status'] == 'approved' and u['id'] != exclude
            for u in users.values()
        ),
    )
    monkeypatch.setattr(
        user_repo,
        'login_result',
        lambda c, uid, n, locked: users[uid].update(failed_logins=n, locked_until=locked),
    )

    def status(c, uid, status, operator):
        users[uid]['status'] = status
        return users[uid]

    monkeypatch.setattr(user_repo, 'set_status', status)
    monkeypatch.setattr(
        user_repo,
        'list_merchants',
        lambda c, s: [u for u in users.values() if u['role'] == 'merchant' and u['status'] == s],
    )
    monkeypatch.setattr(
        session_repo,
        'create',
        lambda c, digest, uid, expires: sessions.update(
            {digest: {'user_id': uid, 'expires_at': expires}}
        ),
    )
    monkeypatch.setattr(
        session_repo,
        'get',
        lambda c, digest, now: (
            sessions.get(digest)
            if digest in sessions and sessions[digest]['expires_at'] > now
            else None
        ),
    )
    monkeypatch.setattr(session_repo, 'delete', lambda c, digest: sessions.pop(digest, None))

    def drop_sessions(c, uid, before=None):
        for digest in [
            d
            for d, s in sessions.items()
            if s['user_id'] == uid and (before is None or s['expires_at'] <= before)
        ]:
            sessions.pop(digest)

    monkeypatch.setattr(session_repo, 'delete_for_user', lambda c, uid: drop_sessions(c, uid))
    monkeypatch.setattr(session_repo, 'purge_expired', drop_sessions)
    monkeypatch.setattr(auth_service, '_unknown_logins', {})
    monkeypatch.setattr(store_repo, 'get_store', lambda c, sid: stores.get(sid))
    monkeypatch.setattr(store_repo, 'get_market', lambda c, mid: {'name_ko': '시장'})
    monkeypatch.setattr(
        store_repo, 'set_store_items', lambda c, sid, ids, source: items.update({sid: ids})
    )
    monkeypatch.setattr(
        merchant_repo, 'items', lambda c, sid: [{'item_id': i, 'name_ko': i} for i in items[sid]]
    )
    monkeypatch.setattr(
        merchant_repo, 'valid_items', lambda c, ids: set(ids) & {'item:onion', 'item:apple'}
    )
    monkeypatch.setattr(merchant_repo, 'valid_unit', lambda c, uid: uid == 'unit:bunch')
    monkeypatch.setattr(
        merchant_repo, 'update_hours', lambda c, sid, h: stores[sid].update(hours=h)
    )

    def increment(c, sid, day, sale_id=None):
        key = (sid, sale_id, day)
        views[key] = views.get(key, 0) + 1
        return views[key]

    monkeypatch.setattr(view_repo, 'increment', increment)
    monkeypatch.setattr(view_repo, 'today', lambda c, sid, day: views.get((sid, None, day), 0))

    def sale_create(c, sid, values):
        sale = values | {
            'id': len(sales) + 1,
            'store_id': sid,
            'status': 'active',
            'created_at': auth_service.now(),
        }
        sales[sale['id']] = sale
        return sale

    monkeypatch.setattr(sale_repo, 'create', sale_create)
    monkeypatch.setattr(
        sale_repo,
        'get',
        lambda c, i, sid: sales.get(i) if i in sales and sales[i]['store_id'] == sid else None,
    )

    def end(c, i, sid):
        sale = sale_repo.get(c, i, sid)
        if sale:
            sale['status'] = 'ended'
        return sale

    monkeypatch.setattr(sale_repo, 'end', end)
    monkeypatch.setattr(
        sale_repo,
        'active',
        lambda c, now, market_id=None, item_id=None, store_id=None: [
            s
            for s in sales.values()
            if s['status'] == 'active'
            and s['starts_at'] <= now <= s['ends_at']
            and (not store_id or s['store_id'] == store_id)
            and (not item_id or s['item_id'] == item_id)
        ],
    )
    monkeypatch.setattr(sale_repo, 'public_get', lambda c, i: sales.get(i))
    monkeypatch.setattr(
        sale_repo,
        'list_store',
        lambda c, sid, status, now: [
            s for s in sales.values() if s['store_id'] == sid and s['status'] == status
        ],
    )
    from app.schemas.item import Item
    from app.services import item_service

    monkeypatch.setattr(
        item_service,
        'get_item',
        lambda c, iid: Item(
            item_id=iid,
            name=iid,
            synonyms=[],
            vision_labels=[],
            criteria=[],
            default_unit='unit:kg',
            units=['unit:kg'],
            labels_i18n={},
        ),
    )
    original_active = sale_repo.active
    monkeypatch.setattr(
        sale_repo,
        'active',
        lambda *args, **kwargs: [
            s | {'store_name': stores[s['store_id']]['name_ko'], 'item_name': s['item_id']}
            for s in original_active(*args, **kwargs)
        ],
    )
    app.dependency_overrides[get_db] = lambda: conn
    with TestClient(app) as client:
        yield {
            'client': client,
            'conn': conn,
            'users': users,
            'sessions': sessions,
            'sales': sales,
            'views': views,
            'stores': stores,
            'items': items,
        }
    app.dependency_overrides.pop(get_db, None)


def signup(memory, lid='merchant_a', sid='store:a'):
    return memory['client'].post(
        '/auth/signup',
        headers=HEADER,
        json={'login_id': lid, 'password': PASSWORD, 'store_id': sid},
    )


def operator(memory):
    user = auth_service.create_operator(memory['conn'], 'admin', PASSWORD)
    client = memory['client']
    client.post('/auth/login', headers=HEADER, json={'login_id': 'admin', 'password': PASSWORD})
    return user


def approved(memory):
    signup(memory)
    user = next(u for u in memory['users'].values() if u['login_id'] == 'merchant_a')
    user['status'] = 'approved'
    return user


def test_pending_approval_store_taken_and_disable(memory):
    client = memory['client']
    first = signup(memory)
    assert first.status_code == 201 and first.json()['user']['status'] == 'pending'
    first_id = first.json()['user']['id']
    merchant_cookie = client.cookies.get('mo_session')
    assert client.get('/merchant/store').status_code == 403
    second = signup(memory, 'merchant_two')
    second_id = second.json()['user']['id']
    operator(memory)
    assert len(client.get('/admin/merchants').json()) == 2
    assert client.post(f'/admin/merchants/{first_id}/approve', headers=HEADER).status_code == 200
    assert (
        client.post(f'/admin/merchants/{second_id}/approve', headers=HEADER).json()['error']['code']
        == 'STORE_TAKEN'
    )
    operator_cookie = client.cookies.get('mo_session')
    client.cookies.set('mo_session', merchant_cookie, domain='testserver.local', path='/')
    assert client.get('/merchant/store').status_code == 200
    assert client.get('/admin/merchants').status_code == 403
    assert signup(memory, 'third_merchant').json()['error']['code'] == 'STORE_TAKEN'
    client.cookies.set('mo_session', operator_cookie, domain='testserver.local', path='/')
    assert (
        client.post(f'/admin/merchants/{second_id}/reject', headers=HEADER).json()['user']['status']
        == 'rejected'
    )
    assert client.post(f'/admin/merchants/{first_id}/disable', headers=HEADER).status_code == 200
    client.cookies.set('mo_session', merchant_cookie, domain='testserver.local', path='/')
    # 비활성 즉시 기존 로그인(쿠키)도 끊김
    assert client.get('/merchant/store').status_code == 401
    assert client.get('/auth/me').status_code == 401


def test_cookie_digest_expiry_logout_and_no_secrets(memory):
    client = memory['client']
    response = signup(memory)
    cookie = response.headers['set-cookie']
    assert (
        'HttpOnly' in cookie
        and 'SameSite=lax' in cookie
        and 'Max-Age=2592000' in cookie
        and 'Path=/' in cookie
    )
    token = client.cookies.get('mo_session')
    assert token not in memory['sessions'] and security.token_hash(token) in memory['sessions']
    assert PASSWORD not in response.text and 'password_hash' not in response.text
    assert client.get('/auth/me').status_code == 200
    memory['sessions'][security.token_hash(token)]['expires_at'] = auth_service.now() - timedelta(
        seconds=1
    )
    assert client.get('/auth/me').status_code == 401
    client.post(
        '/auth/login', headers=HEADER, json={'login_id': 'MERCHANT_A', 'password': PASSWORD}
    )
    assert client.post('/auth/logout', headers=HEADER).status_code == 204
    assert client.get('/auth/me').status_code == 401


def test_login_lock_reset_and_indistinguishable_failure(memory, monkeypatch):
    client = memory['client']
    signup(memory)

    def login(lid, password):
        return client.post(
            '/auth/login', headers=HEADER, json={'login_id': lid, 'password': password}
        )

    unknown = login('unknown_id', 'incorrect').json()
    assert login('merchant_a', 'incorrect').json() == unknown
    assert login('merchant_a', PASSWORD).status_code == 200
    user = next(iter(memory['users'].values()))
    assert user['failed_logins'] == 0
    for _ in range(4):
        assert login('merchant_a', 'incorrect').status_code == 401
    assert login('merchant_a', 'incorrect').json()['error']['code'] == 'ACCOUNT_LOCKED'
    assert login('merchant_a', PASSWORD).status_code == 423
    after_lock = user['locked_until'] + timedelta(seconds=1)
    monkeypatch.setattr(auth_service, 'now', lambda: after_lock)
    assert login('merchant_a', PASSWORD).status_code == 200
    assert user['failed_logins'] == 0 and user['locked_until'] is None


@pytest.mark.parametrize(
    'path',
    [
        '/auth/signup',
        '/auth/login',
        '/auth/logout',
        '/merchant/sales',
        '/sales/1/view',
        '/admin/merchants/00000000-0000-0000-0000-000000000000/approve',
    ],
)
def test_csrf(memory, path):
    assert memory['client'].post(path, json={}).status_code == 403


def test_validation_never_echoes_password(memory):
    client = memory['client']
    r = client.post('/auth/signup', headers=HEADER, json={'login_id': None, 'password': PASSWORD})
    assert r.status_code == 422 and PASSWORD not in r.text and 'error' in r.json()
    assert signup(memory, 'bad id').json()['error']['code'] == 'INVALID_LOGIN_ID'
    assert (
        client.post(
            '/auth/signup',
            headers=HEADER,
            json={'login_id': 'valid_id', 'password': 'short', 'store_id': 'store:a'},
        ).json()['error']['code']
        == 'INVALID_PASSWORD'
    )


def test_openapi_tags_and_secure_cookie(memory, monkeypatch):
    from app.core.config import settings

    assert {'auth', 'merchant', 'admin', 'sales'} <= {tag['name'] for tag in app.openapi()['tags']}
    monkeypatch.setattr(settings, 'COOKIE_SECURE', True)
    assert 'Secure' in signup(memory).headers['set-cookie']


def test_unknown_id_locks_like_real_account(memory):
    """잠금 응답으로 아이디 존재 여부를 알아낼 수 없어야 함."""
    client = memory['client']
    signup(memory)

    def codes(lid):
        return [
            client.post(
                '/auth/login', headers=HEADER, json={'login_id': lid, 'password': 'incorrect'}
            ).json()['error']['code']
            for _ in range(6)
        ]

    assert codes('merchant_a') == codes('nobody_here')
    assert codes('nobody_here')[-1] == 'ACCOUNT_LOCKED'


def test_password_length_limits(memory, monkeypatch):
    client = memory['client']
    too_long = 'a' * 129
    r = client.post(
        '/auth/signup',
        headers=HEADER,
        json={'login_id': 'long_pw', 'password': too_long, 'store_id': 'store:a'},
    )
    assert r.json()['error']['code'] == 'INVALID_PASSWORD' and too_long not in r.text
    signup(memory)
    calls = []

    class Spy:
        def verify(self, *args):
            calls.append(args)
            return True

    monkeypatch.setattr(security, '_hasher', Spy())
    r = client.post(
        '/auth/login', headers=HEADER, json={'login_id': 'merchant_a', 'password': 'a' * 10_000}
    )
    assert r.status_code == 401 and calls == []  # 해시 계산 없이 바로 거절


def test_reject_revokes_sessions(memory):
    client = memory['client']
    user_id = signup(memory).json()['user']['id']
    merchant_cookie = client.cookies.get('mo_session')
    operator(memory)
    assert client.post(f'/admin/merchants/{user_id}/reject', headers=HEADER).status_code == 200
    client.cookies.set('mo_session', merchant_cookie, domain='testserver.local', path='/')
    assert client.get('/auth/me').status_code == 401


def test_cors_wildcard_rejected():
    from app.core.config import Settings
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        Settings(CORS_ORIGINS=['*'])
