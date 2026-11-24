"""Password and opaque-session primitives; never log credentials."""

import hashlib
import re
import secrets
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from app.core.errors import AppError

_hasher = PasswordHasher()
# Equal-cost verification for unknown accounts.
_dummy_hash = _hasher.hash(secrets.token_urlsafe(32))


def normalize_login_id(value: str) -> str:
    value = value.lower()
    if not re.fullmatch(r'[a-z0-9_]{4,20}', value):
        raise AppError('INVALID_LOGIN_ID', '아이디는 영문·숫자·_ 4~20자로 입력하세요.', 422)
    return value


def hash_password(password: str) -> str:
    if len(password) < 8:
        raise AppError('INVALID_PASSWORD', '비밀번호는 8자 이상 입력하세요.', 422)
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        valid = _hasher.verify(password_hash or _dummy_hash, password)
        return bool(password_hash) and valid
    except (VerificationError, InvalidHashError):
        return False


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
