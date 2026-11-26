"""Offline checks for customer auth, review policy and request contracts."""

from datetime import datetime, timezone
import pytest
from tests.test_auth_api import memory, HEADER, PASSWORD
from app.core.config import settings
from app.core.errors import AppError
from app.db.repositories import user_repo, review_repo
from app.services import moderation, review_service
from app.schemas.merchant import Signup


@pytest.mark.parametrize(
    'body',
    [
        '씨 . 발',
        '병!신',
        '010-1234-5678',
        '０１０ １２３４ ５６７８',
        'https://example.com',
        'www.example.com',
    ],
)
def test_blocked(body):
    with pytest.raises(AppError) as error:
        moderation.check(body)
    assert error.value.code == 'REVIEW_BLOCKED'
    assert error.value.message == '이 표현은 쓸 수 없어요.'


def test_signup_contract():
    assert Signup(login_id='buyer', password=PASSWORD, role='customer').store_id is None
    for data in [
        dict(role='customer', store_id='x'),
        dict(role='customer', store_id=None),
        dict(role='merchant'),
    ]:
        with pytest.raises(ValueError):
            Signup(login_id='buyer', password=PASSWORD, **data)


@pytest.fixture
def customer_memory(memory, monkeypatch):
    original = user_repo.create

    def create(*args, **kwargs):
        user = original(*args, **kwargs)
        if user['role'] == 'customer':
            user['status'] = 'approved'
        return user

    monkeypatch.setattr(user_repo, 'create', create)
    records, counts = {}, {}

    def consume(conn, uid, day):
        key = (uid, day)
        if counts.get(key, 0) >= 10:
            return False
        counts[key] = counts.get(key, 0) + 1
        return True

    def upsert(conn, sid, uid, rating, body):
        key = (sid, uid)
        old = records.get(key)
        instant = review_service.now()
        records[key] = dict(
            id=old['id'] if old else len(records) + 1,
            rating=rating,
            body=body,
            created_at=old['created_at'] if old else instant,
            updated_at=instant,
        )

    def listing(conn, sid, uid, limit, offset):
        all_items = [
            r | dict(author=memory['users'][owner]['login_id'][:3] + '***', mine=owner == uid)
            for (store, owner), r in records.items()
            if store == sid
        ]
        all_items.sort(key=lambda r: (r['updated_at'], r['id']), reverse=True)
        return dict(
            average=round(sum(r['rating'] for r in all_items) / len(all_items), 1)
            if all_items
            else None,
            count=len(all_items),
            items=all_items[offset : offset + limit],
        )

    monkeypatch.setattr(review_repo, 'consume', consume)
    monkeypatch.setattr(review_repo, 'upsert', upsert)
    monkeypatch.setattr(review_repo, 'listing', listing)
    monkeypatch.setattr(review_repo, 'delete', lambda c, s, u: records.pop((s, u), None))
    return memory


def test_customer_auth_captcha_guards(customer_memory, monkeypatch):
    client = customer_memory['client']
    data = dict(login_id='buyer_one', password=PASSWORD, role='customer')
    assert (
        client.post(
            '/auth/signup', headers=HEADER, json=data | dict(store_id='store:a')
        ).status_code
        == 422
    )
    monkeypatch.setattr(settings, 'CAPTCHA_ENABLED', True)
    assert (
        client.post('/auth/signup', headers=HEADER, json=data).json()['error']['code']
        == 'CAPTCHA_REQUIRED'
    )
    from app.core import captcha

    monkeypatch.setattr(captcha, 'verify', lambda *a: False)
    assert (
        client.post(
            '/auth/signup', headers=HEADER, json=data | dict(captcha_id='x', captcha_answer='x')
        ).json()['error']['code']
        == 'CAPTCHA_INVALID'
    )
    monkeypatch.setattr(captcha, 'verify', lambda *a: True)
    response = client.post(
        '/auth/signup', headers=HEADER, json=data | dict(captcha_id='x', captcha_answer='x')
    )
    assert response.status_code == 201 and response.json()['user']['status'] == 'approved'
    assert client.get('/auth/me').json()['user']['role'] == 'customer'
    assert client.post('/auth/login', headers=HEADER, json=data).status_code == 200
    for path in ['/merchant/store', '/admin/merchants', '/market-admin/merchants']:
        assert client.get(path).status_code == 403


def test_review_flow_and_seoul_budget(customer_memory, monkeypatch):
    client = customer_memory['client']
    path = '/stores/store:a/reviews'
    payload = dict(rating=5, body='신선해요')
    assert client.get(path).json() == dict(average=None, count=0, items=[])
    for method in ['put', 'delete']:
        args = dict(headers=HEADER)
        if method == 'put':
            args['json'] = payload
        assert getattr(client, method)(path + '/me', **args).status_code == 401
    client.post(
        '/auth/signup',
        headers=HEADER,
        json=dict(login_id='merchant_one', password=PASSWORD, store_id='store:a'),
    )
    assert client.put(path + '/me', headers=HEADER, json=payload).status_code == 403
    client.post(
        '/auth/signup',
        headers=HEADER,
        json=dict(login_id='buyer_one', password=PASSWORD, role='customer'),
    )
    assert client.put(path + '/me', json=payload).status_code == 403
    for data in [
        payload | dict(rating=0),
        payload | dict(rating=6),
        payload | dict(rating=True),
        payload | dict(body=''),
        payload | dict(body=' ' * 3),
        payload | dict(body='가' * 201),
    ]:
        assert client.put(path + '/me', headers=HEADER, json=data).status_code == 422
    assert (
        client.put(path + '/me', headers=HEADER, json=payload | dict(body='씨 발')).json()['error'][
            'code'
        ]
        == 'REVIEW_BLOCKED'
    )
    monkeypatch.setattr(
        review_service, 'now', lambda: datetime(2026, 11, 25, 14, 59, tzinfo=timezone.utc)
    )
    for _ in range(10):
        assert client.put(path + '/me', headers=HEADER, json=payload).status_code == 200
    result = client.get(path).json()
    assert result['count'] == 1 and result['average'] == 5
    assert result['items'][0]['author'] == 'buy***' and result['items'][0]['mine']
    assert client.put(path + '/me', headers=HEADER, json=payload).status_code == 429
    assert client.delete(path + '/me', headers=HEADER).status_code == 204
    assert client.put(path + '/me', headers=HEADER, json=payload).status_code == 429
    monkeypatch.setattr(
        review_service, 'now', lambda: datetime(2026, 11, 25, 15, 0, tzinfo=timezone.utc)
    )
    assert client.put(path + '/me', headers=HEADER, json=payload).status_code == 200
    customer_memory['stores']['store:a']['active'] = False
    assert client.get(path).status_code == 404
    assert client.put(path + '/me', headers=HEADER, json=payload).status_code == 404
    assert client.delete(path + '/me', headers=HEADER).status_code == 404
