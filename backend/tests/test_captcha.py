"""자동입력 방지 문자(캡차): 발급, 한 번만 확인, 회원가입·입점신청·로그인 적용."""

import base64
import time

import pytest

from app.core import captcha
from app.core.config import settings
from tests.test_auth_api import HEADER, PASSWORD, memory  # noqa: F401 (fixture)


@pytest.fixture
def fixed_answer(monkeypatch):
    monkeypatch.setattr(captcha._rng, 'choice', lambda seq: '7')
    return '77777'


@pytest.fixture
def captcha_on(monkeypatch):
    monkeypatch.setattr(settings, 'CAPTCHA_ENABLED', True)


def test_issue_image_has_no_readable_text(fixed_answer):
    issued = captcha.issue()
    assert issued['expires_in'] == 300 and len(issued['captcha_id']) >= 20
    assert issued['image'].startswith('data:image/svg+xml;base64,')
    svg = base64.b64decode(issued['image'].split(',', 1)[1]).decode()
    assert svg.startswith('<svg') and '<text' not in svg and '<script' not in svg
    assert fixed_answer not in svg


def test_verify_once_only(fixed_answer):
    first = captcha.issue()
    assert captcha.verify(first['captcha_id'], ' 77777 ')
    assert not captcha.verify(first['captcha_id'], '77777')  # 재사용 불가
    second = captcha.issue()
    assert not captcha.verify(second['captcha_id'], '12345')
    assert not captcha.verify(second['captcha_id'], '77777')  # 틀리면 바로 폐기
    assert not captcha.verify('없는-id', '77777')
    assert not captcha.verify(None, None)


def test_expired(fixed_answer, monkeypatch):
    issued = captcha.issue()
    later = time.monotonic() + captcha.TTL_SECONDS + 1
    monkeypatch.setattr(captcha.time, 'monotonic', lambda: later)
    assert not captcha.verify(issued['captcha_id'], fixed_answer)


def test_store_is_bounded(monkeypatch):
    monkeypatch.setattr(captcha, '_MAX', 5)
    for _ in range(20):
        captcha.issue()
    assert len(captcha._store) <= 5


def test_captcha_endpoint_no_store(memory):  # noqa: F811
    response = memory['client'].get('/auth/captcha')
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'
    assert set(response.json()) == {'captcha_id', 'image', 'expires_in'}


def test_signup_requires_captcha(memory, captcha_on, fixed_answer):  # noqa: F811
    client = memory['client']
    body = dict(login_id='merchant_a', password=PASSWORD, store_id='store:a')
    missing = client.post('/auth/signup', headers=HEADER, json=body)
    assert missing.status_code == 400
    assert missing.json()['error']['code'] == 'CAPTCHA_REQUIRED'
    issued = client.get('/auth/captcha').json()
    wrong = client.post(
        '/auth/signup',
        headers=HEADER,
        json=body | dict(captcha_id=issued['captcha_id'], captcha_answer='00000'),
    )
    assert wrong.json()['error']['code'] == 'CAPTCHA_INVALID'
    assert not memory['users']  # 계정이 만들어지지 않음
    issued = client.get('/auth/captcha').json()
    ok = client.post(
        '/auth/signup',
        headers=HEADER,
        json=body | dict(captcha_id=issued['captcha_id'], captcha_answer=fixed_answer),
    )
    assert ok.status_code == 201


def test_login_captcha_after_two_failures(memory, captcha_on, fixed_answer):  # noqa: F811
    client = memory['client']
    settings.CAPTCHA_ENABLED = False
    client.post(
        '/auth/signup',
        headers=HEADER,
        json=dict(login_id='merchant_a', password=PASSWORD, store_id='store:a'),
    )
    settings.CAPTCHA_ENABLED = True
    user = next(iter(memory['users'].values()))

    def login(lid, password, **extra):
        return client.post(
            '/auth/login', headers=HEADER, json=dict(login_id=lid, password=password) | extra
        )

    # 처음 두 번은 캡차 없이
    assert login('merchant_a', 'incorrect').status_code == 401
    assert login('merchant_a', 'incorrect').status_code == 401
    # 그다음부터는 맞는 비밀번호라도 캡차가 있어야 해요. 실패 횟수는 늘지 않아요.
    blocked = login('merchant_a', PASSWORD)
    assert blocked.status_code == 400
    assert blocked.json()['error']['code'] == 'CAPTCHA_REQUIRED'
    assert user['failed_logins'] == 2
    issued = client.get('/auth/captcha').json()
    ok = login('merchant_a', PASSWORD, captcha_id=issued['captcha_id'], captcha_answer=fixed_answer)
    assert ok.status_code == 200 and user['failed_logins'] == 0


def test_login_captcha_same_for_unknown_id(memory, captcha_on):  # noqa: F811
    """캡차 요구 여부로 아이디 존재를 알 수 없어야 해요."""
    client = memory['client']
    settings.CAPTCHA_ENABLED = False
    client.post(
        '/auth/signup',
        headers=HEADER,
        json=dict(login_id='merchant_a', password=PASSWORD, store_id='store:a'),
    )
    settings.CAPTCHA_ENABLED = True

    def codes(lid):
        return [
            client.post(
                '/auth/login', headers=HEADER, json=dict(login_id=lid, password='incorrect')
            ).json()['error']['code']
            for _ in range(4)
        ]

    assert codes('merchant_a') == codes('nobody_here')
    assert codes('nobody_here')[-1] == 'CAPTCHA_REQUIRED'


def test_join_requires_captcha(memory, captcha_on):  # noqa: F811
    response = memory['client'].post(
        '/join',
        headers=HEADER,
        json=dict(
            login_id='manager_a',
            password=PASSWORD,
            market_id='market:test',
            manager_org='상인회',
            contact='010-0000-0000',
        ),
    )
    assert response.status_code == 400
    assert response.json()['error']['code'] == 'CAPTCHA_REQUIRED'
