"""Customer signup, review API and persistent constraints on the test DB."""

import pytest
from psycopg.errors import CheckViolation, UniqueViolation
from tests.test_auth_db import auth_db
from tests.test_ingest_db import db, pytestmark
from tests.test_auth_api import HEADER, PASSWORD
from app.core.config import settings


def signup(client, name='customer_one', **extra):
    return client.post(
        '/auth/signup',
        headers=HEADER,
        json=dict(login_id=name, password=PASSWORD, role='customer', **extra),
    )


def test_customer_signup_and_guards(auth_db, monkeypatch):
    conn, client = auth_db
    assert signup(client, store_id='store:demo-A05').status_code == 422
    monkeypatch.setattr(settings, 'CAPTCHA_ENABLED', True)
    assert signup(client).json()['error']['code'] == 'CAPTCHA_REQUIRED'
    from app.core import captcha

    monkeypatch.setattr(captcha, 'verify', lambda *args: True)
    assert signup(client, captcha_id='id', captcha_answer='1234').status_code == 201
    user = client.get('/auth/me').json()['user']
    assert user['role'] == 'customer' and user['status'] == 'approved'
    assert user['store'] is None and user['market'] is None
    assert (
        client.post(
            '/auth/login', headers=HEADER, json=dict(login_id='customer_one', password=PASSWORD)
        ).status_code
        == 200
    )
    for path in [
        '/merchant/store',
        '/admin/merchants?status=pending',
        '/market-admin/merchants?status=pending',
    ]:
        assert client.get(path).status_code == 403
    with pytest.raises(CheckViolation), conn.transaction():
        conn.execute('update users set store_id=%s where id=%s', ('store:demo-A05', user['id']))


def test_reviews_lifecycle(auth_db):
    conn, client = auth_db
    path = '/stores/store:demo-A05/reviews'
    assert client.get(path).json() == dict(average=None, count=0, items=[])
    assert (
        client.put(path + '/me', headers=HEADER, json=dict(rating=5, body='좋아요')).status_code
        == 401
    )
    assert (
        client.post(
            '/auth/signup',
            headers=HEADER,
            json=dict(login_id='review_merchant', password=PASSWORD, store_id='store:demo-A05'),
        ).status_code
        == 201
    )
    assert (
        client.put(path + '/me', headers=HEADER, json=dict(rating=5, body='좋아요')).status_code
        == 403
    )
    assert signup(client).status_code == 201
    assert client.put(path + '/me', json=dict(rating=5, body='좋아요')).status_code == 403
    for data in [
        dict(rating=0, body='좋아요'),
        dict(rating=6, body='좋아요'),
        dict(rating=1, body=''),
        dict(rating=1, body=' ' * 10),
        dict(rating=1, body='가' * 201),
    ]:
        assert client.put(path + '/me', headers=HEADER, json=data).status_code == 422
    for body in ['씨 발', '010 1234 5678', 'www.example.com', 'https://example.com']:
        result = client.put(path + '/me', headers=HEADER, json=dict(rating=5, body=body))
        assert result.status_code == 422 and result.json()['error']['code'] == 'REVIEW_BLOCKED'
    for rating in [5, 3]:
        result = client.put(path + '/me', headers=HEADER, json=dict(rating=rating, body='신선해요'))
        assert result.status_code == 200
        assert result.json()['count'] == 1 and result.json()['average'] == rating
    for rating, body in [(0, '글'), (6, '글'), (1, ''), (1, '가' * 201)]:
        with pytest.raises(CheckViolation), conn.transaction():
            conn.execute('update store_reviews set rating=%s,body=%s', (rating, body))
    item = result.json()['items'][0]
    assert item['author'] == 'cus***' and item['mine']
    uid = client.get('/auth/me').json()['user']['id']
    with pytest.raises(UniqueViolation), conn.transaction():
        conn.execute(
            'insert into store_reviews(store_id,user_id,rating,body) values(%s,%s,5,%s)',
            ('store:demo-A05', uid, '중복'),
        )
    assert signup(client, 'second_customer').status_code == 201
    assert (
        client.put(path + '/me', headers=HEADER, json=dict(rating=4, body='친절해요')).status_code
        == 200
    )
    result = client.get(path + '?limit=1&offset=1').json()
    assert result['average'] == 3.5 and result['count'] == 2 and not result['items'][0]['mine']
    for _ in range(9):
        assert (
            client.put(path + '/me', headers=HEADER, json=dict(rating=4, body='좋아요')).status_code
            == 200
        )
    result = client.put(path + '/me', headers=HEADER, json=dict(rating=4, body='좋아요'))
    assert result.status_code == 429 and result.json()['error']['code'] == 'REVIEW_RATE_LIMIT'
    assert client.delete(path + '/me', headers=HEADER).status_code == 204
    assert client.get(path).json()['count'] == 1
    assert (
        client.put(path + '/me', headers=HEADER, json=dict(rating=4, body='좋아요')).status_code
        == 429
    )
    conn.execute(
        "update review_daily_writes set day=day-1 where user_id=(select id from users where login_id='second_customer')"
    )
    assert (
        client.put(path + '/me', headers=HEADER, json=dict(rating=4, body='좋아요')).status_code
        == 200
    )
    conn.execute("update stores set active=false where id='store:demo-A05'")
    for method in ['get', 'put', 'delete']:
        args = dict(headers=HEADER)
        if method == 'put':
            args['json'] = dict(rating=4, body='좋아요')
        assert (
            getattr(client, method)(path + ('' if method == 'get' else '/me'), **args).status_code
            == 404
        )
