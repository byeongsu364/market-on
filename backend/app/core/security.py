"""Password and opaque-session primitives; never log credentials."""

import hashlib
import re
import secrets
import threading
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from app.core.errors import AppError

_hasher = PasswordHasher()
# Equal-cost verification for unknown accounts.
_dummy_hash = _hasher.hash(secrets.token_urlsafe(32))
# argon2id 1회에 메모리 64MB. 가입·로그인 폭주 때 서버 메모리가 바닥나지 않게 동시 계산 수를 제한.
_hash_slots = threading.BoundedSemaphore(4)
# 아주 긴 비밀번호로 해시 계산을 오래 붙잡는 요청 방지.
PASSWORD_MIN, PASSWORD_MAX = 8, 128


def normalize_login_id(value: str) -> str:
    value = value.lower()
    if not re.fullmatch(r'[a-z0-9_]{4,20}', value):
        raise AppError('INVALID_LOGIN_ID', '아이디는 영문·숫자·_ 4~20자로 입력하세요.', 422)
    return value


def hash_password(password: str) -> str:
    if not PASSWORD_MIN <= len(password) <= PASSWORD_MAX:
        raise AppError(
            'INVALID_PASSWORD',
            f'비밀번호는 {PASSWORD_MIN}~{PASSWORD_MAX}자로 입력하세요.',
            422,
        )
    with _hash_slots:
        return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if len(password) > PASSWORD_MAX:
        return False
    try:
        with _hash_slots:
            valid = _hasher.verify(password_hash or _dummy_hash, password)
        return bool(password_hash) and valid
    except (VerificationError, InvalidHashError):
        return False


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
