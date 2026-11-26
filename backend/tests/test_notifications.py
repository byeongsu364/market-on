# FastAPI dependencies and pytest fixture imports are intentional.
# ruff: noqa: F811
"""Offline cryptographic round trips, signing, background isolation and authorization."""

import json
import os
import struct
from contextlib import contextmanager
from unittest.mock import Mock

import pytest
from app.core.config import settings
from app.services import notification_service as service
from app.services import web_push as push
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from scripts.generate_vapid_keys import generate_keys, main

from tests.test_auth_api import HEADER, approved, memory  # noqa: F401
from tests.test_merchant_api import merchant  # noqa: F401


def test_encrypt_roundtrip_and_vapid_signature(monkeypatch):
    receiver = ec.generate_private_key(ec.SECP256R1())
    auth = os.urandom(16)
    sub = {
        'p256dh': push.encode(push.public_bytes(receiver.public_key())),
        'auth': push.encode(auth),
    }
    payload = {'title': '마감세일', 'body': '대파 2,000원', 'url': '/s/store:a'}
    encrypted = push.encrypt(sub, payload)
    salt, rs, keylen = encrypted[:16], *struct.unpack('!IB', encrypted[16:21])
    sender = encrypted[21 : 21 + keylen]
    shared = receiver.exchange(
        ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), sender)
    )
    ikm = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=auth,
        info=b'WebPush: info\x00' + push.public_bytes(receiver.public_key()) + sender,
    ).derive(shared)

    def derive(info, size):
        return HKDF(algorithm=hashes.SHA256(), length=size, salt=salt, info=info).derive(ikm)

    plaintext = AESGCM(derive(b'Content-Encoding: aes128gcm\x00', 16)).decrypt(
        derive(b'Content-Encoding: nonce\x00', 12), encrypted[21 + keylen :], None
    )
    assert rs == 4096 and keylen == 65 and plaintext[-1:] == b'\x02'
    assert json.loads(plaintext[:-1]) == payload
    keys = generate_keys()
    for k, v in keys.items():
        monkeypatch.setattr(settings, k, v)
    monkeypatch.setattr(settings, 'VAPID_SUBJECT', 'mailto:ops@example.com')
    token = push.authorization('https://push.example.com/path').split('t=')[1].split(',')[0]
    _header, claims, signature = token.split('.')
    claims = json.loads(push.decode(claims))
    assert claims['aud'] == 'https://push.example.com'
    raw = push.decode(signature)
    public = ec.EllipticCurvePublicKey.from_encoded_point(
        ec.SECP256R1(), push.decode(keys['VAPID_PUBLIC_KEY'])
    )
    unsigned = '.'.join(token.split('.')[:2])
    public.verify(
        encode_dss_signature(int.from_bytes(raw[:32], 'big'), int.from_bytes(raw[32:], 'big')),
        unsigned.encode(),
        ec.ECDSA(hashes.SHA256()),
    )


def test_generator_never_outputs_keys(capsys):
    keys = main()
    output = capsys.readouterr().out
    assert all(v not in output for v in keys.values())


@pytest.mark.parametrize(
    'url',
    [
        'http://localhost/x',
        'https://127.0.0.1/x',
        'https://user:secret@example.com/x',
        'https://example.com:444/x',
    ],
)
def test_endpoint_rejects_local_and_credentials(url):
    with pytest.raises(ValueError):
        push.validate_endpoint(url)


def test_push_disabled_and_gone_cleanup(monkeypatch, no_real_push):
    monkeypatch.setattr(settings, 'VAPID_PRIVATE_KEY', '')
    service.deliver([{'user_id': 'u'}])
    no_real_push.assert_not_called()
    monkeypatch.setattr(push, 'enabled', lambda: True)
    conn = Mock()

    @contextmanager
    def connection():
        yield conn

    monkeypatch.setattr(service.pool, 'connection', connection)
    monkeypatch.setattr(
        service, 'rows', lambda *args: [{'id': 1, 'endpoint': 'https://push.example.com/x'}]
    )
    no_real_push.return_value = 410
    service.deliver([{'user_id': 'u', 'title': 't', 'body': 'b', 'url': '/shop'}])
    no_real_push.assert_called_once()
    assert 'delete from push_subscriptions' in conn.execute.call_args.args[0]


def test_customer_permissions_and_csrf(memory):
    client = memory['client']
    for path in ['/me/favorites', '/me/notifications', '/me/notifications/settings']:
        assert client.get(path).status_code == 401
    approved(memory)
    for path in ['/me/favorites', '/me/notifications', '/me/notifications/settings']:
        assert client.get(path).status_code == 403
    assert client.put('/me/favorites/store:a', json={'notify': True}).status_code == 403
    assert client.get('/push/public-key').status_code == 200


@pytest.mark.parametrize(
    'url', ['//evil.example/x', 'https://evil.example/x', '/\\evil.example/x', '/x\n']
)
def test_notification_same_origin(url):
    with pytest.raises(ValueError):
        service.create(Mock(), 'u', 'e', 'sale', 't', 'b', url)


def test_sale_request_schedules_background_delivery(merchant, monkeypatch):
    from tests.test_merchant_api import sale_payload

    dispatch = Mock()
    monkeypatch.setattr(service, 'dispatch_sale', dispatch)
    response = merchant['client'].post('/merchant/sales', headers=HEADER, json=sale_payload())
    assert response.status_code == 201
    dispatch.assert_called_once_with(response.json()['id'])


def test_sale_transaction_released_before_background(merchant, monkeypatch):
    from app.deps import get_db
    from app.main import app

    from tests.test_merchant_api import sale_payload

    events = []
    previous = app.dependency_overrides[get_db]

    def scoped_db():
        try:
            yield merchant['conn']
        finally:
            events.append('committed')

    app.dependency_overrides[get_db] = scoped_db
    monkeypatch.setattr(service, 'dispatch_sale', lambda sale_id: events.append('push'))
    try:
        response = merchant['client'].post('/merchant/sales', headers=HEADER, json=sale_payload())
        assert response.status_code == 201
        assert events == ['committed', 'push']
    finally:
        app.dependency_overrides[get_db] = previous


@pytest.mark.parametrize(('month', 'name'), [(12, '귤'), (1, '대파')])
def test_season_uses_monthly_ontology_and_settings(monkeypatch, month, name):
    conn = Mock()
    lookup = Mock(return_value=[{'name': name}])
    monkeypatch.setattr(service.knowledge_repo, 'in_season', lookup)
    recipient_query = Mock(return_value=[{'id': 'customer'}])
    monkeypatch.setattr(service, 'rows', recipient_query)
    create = Mock(side_effect=lambda *args: {'title': args[4]})
    monkeypatch.setattr(service, 'create', create)
    result = service.season_notice(conn, month, 2026)
    assert result == [{'title': f'{month}월 제철: {name}'}]
    lookup.assert_called_once_with(conn, month)
    assert 'coalesce(n.season,true)' in recipient_query.call_args.args[1]
    assert create.call_args.args[2] == f'season:2026:{month}'


def test_season_script_sends_after_commit(monkeypatch):
    from scripts import send_season_notice as script

    events = []

    @contextmanager
    def connection():
        yield 'test-connection'
        events.append('commit')

    monkeypatch.setattr(script.pool, 'connection', connection)
    build = Mock(return_value=[{'id': 1}])
    monkeypatch.setattr(script, 'season_notice', build)
    monkeypatch.setattr(script, 'deliver', lambda notices: events.append('push'))
    monkeypatch.setattr('sys.argv', ['send_season_notice', '--month', '12', '--year', '2026'])
    script.main()
    build.assert_called_once_with('test-connection', 12, 2026)
    assert events == ['commit', 'push']


def test_customer_map_marks_favorites_on_typed_response(memory, monkeypatch):
    from app.deps import optional_user
    from app.main import app
    from app.schemas.market import MarketMap, Store
    from app.services import market_service

    def store(sid):
        return Store(
            store_id=sid,
            name=sid,
            zone_id='',
            sells=[],
            map_x=0,
            map_y=0,
            hours='',
            highlight=False,
            active_sale=None,
        )

    monkeypatch.setattr(
        market_service,
        'market_map',
        lambda *args: MarketMap(
            market_id='m', zones=[], stores=[store('store:a'), store('store:b')]
        ),
    )
    monkeypatch.setattr(service, 'favorites', lambda *args: [{'store_id': 'store:a'}])
    app.dependency_overrides[optional_user] = lambda: {'id': 'customer', 'role': 'customer'}
    try:
        response = memory['client'].get('/markets/m/map')
        assert response.status_code == 200
        assert [s['favorite'] for s in response.json()['stores']] == [True, False]
    finally:
        app.dependency_overrides.pop(optional_user, None)


def test_encrypt_matches_rfc8291_appendix_a():
    """RFC 8291 부록 A 예시 값과 같은 암호문 (Claude 검수 2026-11-27)."""
    from unittest import mock

    from cryptography.hazmat.primitives.asymmetric import ec

    from app.services import web_push as w

    sender = ec.derive_private_key(
        int.from_bytes(w.decode('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'), 'big'),
        ec.SECP256R1(),
    )
    subscription = {
        'p256dh': 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
        'auth': 'BTBZMqHH6r4Tts7J_aSIgg',
    }
    expected = (
        'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6Tlz'
        'AC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
    )
    with (
        mock.patch.object(w.ec, 'generate_private_key', return_value=sender),
        mock.patch.object(w.os, 'urandom', return_value=w.decode('DGv6ra1nlYgDCS1FRnbzlw')),
        mock.patch.object(w.json, 'dumps', side_effect=lambda value, **kw: value),
    ):
        body = w.encrypt(subscription, 'When I grow up, I want to be a watermelon')
    assert w.encode(body) == expected
