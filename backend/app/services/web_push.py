"""RFC 8291 aes128gcm and RFC 8292 ES256 VAPID, without a push SDK."""

import base64
import ipaddress
import json
import os
import socket
import struct
import time
from urllib.parse import urlsplit

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.core.config import settings


def encode(value):
    return base64.urlsafe_b64encode(value).rstrip(b'=').decode()


def decode(value):
    return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))


def public_bytes(key):
    return key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )


def enabled():
    return bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY and settings.VAPID_SUBJECT)


def validate_endpoint(endpoint):
    url = urlsplit(endpoint)
    if (
        url.scheme != 'https'
        or not url.hostname
        or url.username
        or url.password
        or url.fragment
        or url.port not in (None, 443)
    ):
        raise ValueError('Invalid push endpoint')
    addresses = socket.getaddrinfo(url.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('Push endpoint must be public')
    return url


def encrypt(subscription, payload):
    receiver = decode(subscription['p256dh'])
    auth = decode(subscription['auth'])
    if len(auth) != 16:
        raise ValueError('Invalid auth secret')
    ephemeral = ec.generate_private_key(ec.SECP256R1())
    sender = public_bytes(ephemeral.public_key())
    shared = ephemeral.exchange(
        ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), receiver)
    )
    ikm = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=auth,
        info=b'WebPush: info\x00' + receiver + sender,
    ).derive(shared)
    salt = os.urandom(16)

    def derive(info, size):
        return HKDF(algorithm=hashes.SHA256(), length=size, salt=salt, info=info).derive(ikm)

    plaintext = json.dumps(payload, ensure_ascii=False).encode() + b'\x02'
    if len(plaintext) + 16 > 4096:
        raise ValueError('Push payload too large')
    ciphertext = AESGCM(derive(b'Content-Encoding: aes128gcm\x00', 16)).encrypt(
        derive(b'Content-Encoding: nonce\x00', 12), plaintext, None
    )
    return salt + struct.pack('!IB', 4096, len(sender)) + sender + ciphertext


def authorization(endpoint):
    url = urlsplit(endpoint)
    header = encode(b'{"typ":"JWT","alg":"ES256"}')
    claims = encode(
        json.dumps(
            {
                'aud': f'{url.scheme}://{url.netloc}',
                'exp': int(time.time()) + 3600,
                'sub': settings.VAPID_SUBJECT,
            }
        ).encode()
    )
    unsigned = f'{header}.{claims}'
    private = ec.derive_private_key(
        int.from_bytes(decode(settings.VAPID_PRIVATE_KEY), 'big'), ec.SECP256R1()
    )
    if encode(public_bytes(private.public_key())) != settings.VAPID_PUBLIC_KEY:
        raise ValueError('VAPID key mismatch')
    r, s = decode_dss_signature(private.sign(unsigned.encode(), ec.ECDSA(hashes.SHA256())))
    signature = encode(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))
    return f'vapid t={unsigned}.{signature}, k={settings.VAPID_PUBLIC_KEY}'


def send(subscription, payload):
    validate_endpoint(subscription['endpoint'])
    response = httpx.post(
        subscription['endpoint'],
        content=encrypt(subscription, payload),
        headers={
            'Authorization': authorization(subscription['endpoint']),
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            'TTL': '86400',
        },
        timeout=10,
        follow_redirects=False,
    )
    return response.status_code
