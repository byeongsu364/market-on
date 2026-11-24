"""Offline market isolation and shared approval regression checks."""

from urllib.parse import urlparse, parse_qs
from tests.test_auth_api import memory, signup, operator, HEADER, PASSWORD
from app.db.repositories import user_repo, market_admin_repo
from app.services import auth_service
import pytest


@pytest.fixture
def manager(memory, monkeypatch):
    original = user_repo.create

    def create(conn, login_id, digest, *, role='merchant', store_id=None, market_id=None):
        user = original(conn, login_id, digest, role, store_id)
        user['market_id'] = market_id
        if role == 'market_admin':
            user['status'] = 'approved'
        return user

    monkeypatch.setattr(user_repo, 'create', create)
    monkeypatch.setattr(
        user_repo,
        'scoped_merchants',
        lambda c, status, mid: [
            u
            for u in memory['users'].values()
            if u['role'] == 'merchant'
            and u['status'] == status
            and memory['stores'][u['store_id']]['market_id'] == mid
        ],
    )
    monkeypatch.setattr(
        user_repo,
        'list_market_admins',
        lambda c: [u for u in memory['users'].values() if u['role'] == 'market_admin'],
    )
    monkeypatch.setattr(
        market_admin_repo,
        'summary',
        lambda c, mid: dict(
            market_id=mid,
            name='시장',
            stores_total=2,
            merchants_approved=0,
            merchants_pending=1,
            views_7d=7,
        ),
    )
    return memory


def login_manager(memory):
    auth_service.create_market_admin(memory['conn'], 'manager', PASSWORD, 'market:test')
    return memory['client'].post(
        '/auth/login', headers=HEADER, json=dict(login_id='manager', password=PASSWORD)
    )


def test_scope_contract_approval_and_revoke(manager):
    client = manager['client']
    first = signup(manager).json()['user']['id']
    second = signup(manager, 'second_user').json()['user']['id']
    manager['stores']['store:b']['market_id'] = 'market:other'
    foreign = signup(manager, 'foreign_user', 'store:b').json()['user']['id']
    response = login_manager(manager)
    assert response.json()['user']['market'] == {'market_id': 'market:test', 'name': '시장'}
    assert client.get('/auth/me').json() == response.json()
    listed = client.get('/market-admin/merchants').json()
    assert {u['id'] for u in listed} == {first, second}
    assert set(listed[0]) == {'id', 'login_id', 'status', 'created_at', 'store'}
    assert set(listed[0]['store']) == {'store_id', 'name'}
    assert (
        client.post(f'/market-admin/merchants/{foreign}/approve', headers=HEADER).status_code == 404
    )
    assert client.post(f'/market-admin/merchants/{first}/approve').status_code == 403
    assert (
        client.post(f'/market-admin/merchants/{first}/approve', headers=HEADER).status_code == 200
    )
    assert (
        client.post(f'/market-admin/merchants/{second}/approve', headers=HEADER).json()['error'][
            'code'
        ]
        == 'STORE_TAKEN'
    )
    user = next(u for u in manager['users'].values() if str(u['id']) == first)
    _, token = auth_service.session(manager['conn'], user)
    assert (
        client.post(f'/market-admin/merchants/{first}/disable', headers=HEADER).status_code == 200
    )
    from app.core.security import token_hash

    assert token_hash(token) not in manager['sessions']
    assert (
        client.post(f'/market-admin/merchants/{second}/reject', headers=HEADER).json()['user'][
            'status'
        ]
        == 'rejected'
    )
    poster = client.get('/market-admin/poster').json()
    assert set(poster) == {'market_name', 'url'}
    assert parse_qs(urlparse(poster['url']).query) == {'market': ['market:test']}
    assert set(client.get('/market-admin/market').json()) == {
        'market_id',
        'name',
        'stores_total',
        'merchants_approved',
        'merchants_pending',
        'views_7d',
    }


def test_role_access_and_operator_disable(manager):
    client = manager['client']
    signup(manager)
    assert client.get('/market-admin/market').status_code == 403
    login_manager(manager)
    operator(manager)
    assert client.get('/market-admin/market').status_code == 403
    admins = client.get('/admin/market-admins').json()
    assert len(admins) == 1 and admins[0]['market']['market_id'] == 'market:test'
    uid = admins[0]['id']
    assert client.post(f'/admin/market-admins/{uid}/disable').status_code == 403
    assert client.post(f'/admin/market-admins/{uid}/disable', headers=HEADER).status_code == 200
    assert not any(str(s['user_id']) == uid for s in manager['sessions'].values())
    client.post('/auth/login', headers=HEADER, json=dict(login_id='manager', password=PASSWORD))
    assert client.get('/market-admin/market').status_code == 403
