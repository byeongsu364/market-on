"""Offline demand, onboarding and loader fixtures; no external traffic or DB."""

from contextlib import nullcontext
from datetime import date
from uuid import uuid4
import pytest
from tests.test_auth_api import memory, operator, HEADER, PASSWORD
from app.db.repositories import (
    market_request_repo as repo,
    store_repo,
    user_repo,
    market_admin_repo,
)
from app.services import market_service
from scripts import load_markets as loader

DEMAND_KEYS = {'market_id', 'name', 'status', 'nearby_7d', 'requests_7d', 'low'}
APPLICATION_KEYS = {
    'id',
    'market_id',
    'manager_org',
    'contact',
    'store_count',
    'note',
    'admin_user_id',
    'status',
    'created_at',
    'reviewed_by',
    'reviewed_at',
    'demand',
}


@pytest.fixture
def requests(memory, monkeypatch):
    markets = {
        mid: dict(id=mid, name_ko=mid, lat=37.57, lng=126.99, status=status)
        for mid, status in [('listed', 'listed'), ('active', 'active')]
    }
    records, entries = set(), {}
    original = user_repo.create

    def create(c, lid, digest, *, role='merchant', store_id=None, market_id=None, status=None):
        user = original(c, lid, digest, role, store_id)
        user.update(market_id=market_id, status=status or user['status'])
        return user

    monkeypatch.setattr(user_repo, 'create', create)
    monkeypatch.setattr(store_repo, 'get_market', lambda c, mid: markets.get(mid))
    monkeypatch.setattr(store_repo, 'list_markets', lambda c: list(markets.values()))
    monkeypatch.setattr(repo, 'lock_market', lambda c, mid: markets.get(mid))
    monkeypatch.setattr(
        repo, 'search', lambda c, q: [m for m in markets.values() if q in m['name_ko']][:20]
    )
    monkeypatch.setattr(
        repo, 'record', lambda c, mid, digest, kind: records.add((mid, date.today(), digest, kind))
    )
    monkeypatch.setattr(
        repo,
        'demand',
        lambda c, mid: [
            dict(kind=kind, count=len({r[2] for r in records if r[0] == mid and r[3] == kind}))
            for kind in ('nearby', 'request')
        ],
    )
    monkeypatch.setattr(
        repo,
        'pending',
        lambda c, mid: any(
            v['market_id'] == mid and v['status'] == 'pending' for v in entries.values()
        ),
    )

    def save(c, data, uid):
        value = data.model_dump(exclude={'login_id', 'password'}) | dict(
            id=len(entries) + 1,
            admin_user_id=uid,
            status='pending',
            created_at='2026-11-24T10:00:00+09:00',
            reviewed_by=None,
            reviewed_at=None,
        )
        entries[value['id']] = value
        return value

    monkeypatch.setattr(repo, 'create', save)
    monkeypatch.setattr(repo, 'get', lambda c, aid, lock=False: entries.get(aid))
    monkeypatch.setattr(
        repo,
        'applications',
        lambda c, status: [v for v in entries.values() if v['status'] == status],
    )

    def review(c, aid, status, reviewer):
        entries[aid].update(
            status=status, reviewed_by=reviewer, reviewed_at='2026-11-24T11:00:00+09:00'
        )
        return entries[aid]

    monkeypatch.setattr(repo, 'review', review)
    monkeypatch.setattr(repo, 'activate', lambda c, mid: markets[mid].update(status='active'))
    monkeypatch.setattr(market_admin_repo, 'summary', lambda c, mid: dict(market_id=mid))
    return memory | dict(markets=markets, records=records, entries=entries)


def payload(**changes):
    return (
        dict(
            market_id='listed',
            manager_org='상인회',
            contact='02-123-4567',
            login_id='manager',
            password=PASSWORD,
        )
        | changes
    )


def test_nearby_requests_privacy_and_contract(requests, monkeypatch):
    c = requests['client']
    assert c.get('/markets/nearby?lat=37.57&lng=126.99').status_code == 200
    assert not requests['records']
    device = {'X-Device-Id': str(uuid4())}
    for _ in range(2):
        nearby = c.get('/markets/nearby?lat=37.57&lng=126.99', headers=device).json()
        assert {v['status'] for v in nearby} == {'listed', 'active'}
        assert set(nearby[0]) == {'market_id', 'name', 'status', 'lat', 'lng', 'distance_m'}
    assert len(requests['records']) == 1
    assert c.post('/markets/listed/requests', headers=device).status_code == 403
    assert c.post('/markets/listed/requests', headers=HEADER).status_code == 422
    for _ in range(2):
        response = c.post('/markets/listed/requests', headers=HEADER | device)
        assert response.status_code == 201
        assert response.json() == dict(requested=True, requests_7d=None)
    assert len(requests['records']) == 2
    assert (
        c.post('/markets/active/requests', headers=HEADER | device).json()['error']['code']
        == 'MARKET_ACTIVE'
    )
    value = c.get('/markets/listed/demand').json()
    assert set(value) == DEMAND_KEYS and value['low'] and value['nearby_7d'] is None
    for _ in range(4):
        c.post('/markets/listed/requests', headers=HEADER | {'X-Device-Id': str(uuid4())})
    assert c.get('/markets/listed/demand').json()['requests_7d'] == 5
    assert len(c.get('/markets/search?q=listed').json()) == 1

    def fail(*args):
        raise RuntimeError('fixture failure')

    monkeypatch.setattr(repo, 'record', fail)
    assert c.get('/markets/nearby?lat=37.57&lng=126.99', headers=device).status_code == 200


@pytest.mark.parametrize('decision', ['approve', 'reject'])
def test_join_pending_login_review_and_contract(requests, decision):
    c = requests['client']
    assert c.post('/join', json=payload()).status_code == 403
    assert c.post('/join', headers=HEADER, json=payload(market_id='active')).status_code == 409
    for values in [
        dict(login_id='bad!'),
        dict(password='short'),
        dict(contact=' ' * 3),
        dict(note='x' * 201),
        dict(manager_org='개인'),
    ]:
        assert c.post('/join', headers=HEADER, json=payload(**values)).status_code == 422
    response = c.post('/join', headers=HEADER, json=payload())
    assert response.status_code == 201
    application = response.json()
    assert set(application) == APPLICATION_KEYS and set(application['demand']) == DEMAND_KEYS
    assert (
        c.post('/join', headers=HEADER, json=payload(login_id='another')).json()['error']['code']
        == 'APPLICATION_PENDING'
    )
    login = c.post('/auth/login', headers=HEADER, json=dict(login_id='manager', password=PASSWORD))
    assert login.status_code == 200 and login.json()['user']['status'] == 'pending'
    assert c.get('/market-admin/market').status_code == 403
    assert c.get('/admin/applications').status_code == 403
    operator(requests)
    assert set(c.get('/admin/applications').json()[0]) == APPLICATION_KEYS
    path = f'/admin/applications/{application["id"]}/{decision}'
    assert c.post(path).status_code == 403
    assert c.post(path, headers=HEADER).status_code == 200
    assert c.post(path, headers=HEADER).status_code == 409
    user = next(v for v in requests['users'].values() if v['login_id'] == 'manager')
    assert user['status'] == ('approved' if decision == 'approve' else 'rejected')
    assert requests['markets']['listed']['status'] == (
        'active' if decision == 'approve' else 'listed'
    )
    c.post('/auth/login', headers=HEADER, json=dict(login_id='manager', password=PASSWORD))
    assert c.get('/market-admin/market').status_code == (200 if decision == 'approve' else 403)


def test_loader_fixture_pagination_and_stable_upsert(monkeypatch):
    from unittest.mock import Mock

    rows = [
        dict(
            mrktNm='시장',
            rdnmadr='서울 종로구',
            latitude='37.57',
            longitude='126.99',
            storNumber='25',
        ),
        dict(mrktNm='좌표 없음', rdnmadr='서울', latitude='', longitude=''),
        dict(mrktNm='다른 시도', rdnmadr='부산', latitude='35', longitude='129'),
    ]
    monkeypatch.setattr(loader.settings, 'DATA_GO_KR_KEY', 'fixture-key')
    responses = [
        dict(response=dict(header=dict(resultCode='00'), body=dict(items=rows[:2], totalCount=3))),
        dict(response=dict(header=dict(resultCode='00'), body=dict(items=rows[2:], totalCount=3))),
    ]
    calls = []

    def get(url, params):
        calls.append(params.copy())
        return Mock(json=lambda: responses[params['pageNo'] - 1])

    monkeypatch.setattr(loader.http, 'get_sync', get)
    fetched = loader.fetch_rows()
    assert fetched == rows and [v['pageNo'] for v in calls] == [1, 2]
    saved = {}

    def save(c, value):
        saved[value['id']] = value | dict(status=saved.get(value['id'], {}).get('status', 'listed'))

    monkeypatch.setattr(repo, 'upsert_listed', save)
    conn = Mock(transaction=nullcontext)
    assert loader.load_markets(conn, fetched, '서울') == dict(processed=1, skipped=1)
    mid = next(iter(saved))
    assert mid.startswith('market:std-')
    assert saved[mid]['store_count'] == 25 and saved[mid]['status'] == 'listed'
    saved[mid]['status'] = 'active'
    loader.load_markets(conn, fetched, '서울')
    assert list(saved) == [mid] and saved[mid]['status'] == 'active'
    csv_rows = [
        {
            '시장명': '시장',
            '소재지도로명주소': '서울 종로구',
            '위도': '37.57',
            '경도': '126.99',
            '점포수': '25',
        }
    ]
    assert loader.prepare(csv_rows)[0] == loader.prepare(rows[:1])[0]
