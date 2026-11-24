"""Registration, login throttling and persistent opaque sessions."""

from datetime import datetime, timedelta, timezone
from psycopg.errors import UniqueViolation
from app.core.config import settings
from app.core.errors import AppError
from app.core import security
from app.db.repositories import user_repo, session_repo, store_repo


def now():
    return datetime.now(timezone.utc)


def public_user(conn, user):
    store = store_repo.get_store(conn, user['store_id']) if user['store_id'] else None
    return {key: user[key] for key in ('id', 'login_id', 'role', 'status')} | {
        'store': {
            'store_id': store['id'],
            'name': store['name_ko'],
            'market_id': store['market_id'],
        }
        if store
        else None
    }


def session(conn, user):
    token = security.new_session_token()
    session_repo.create(
        conn, security.token_hash(token), user['id'], now() + timedelta(days=settings.SESSION_DAYS)
    )
    return public_user(conn, user), token


def signup(conn, data):
    login_id = security.normalize_login_id(data.login_id)
    password_hash = security.hash_password(data.password.get_secret_value())
    try:
        with conn.transaction():
            if not user_repo.lock_store(conn, data.store_id):
                raise AppError('STORE_NOT_FOUND', '점포를 찾을 수 없습니다.', 404)
            if user_repo.store_taken(conn, data.store_id):
                raise AppError('STORE_TAKEN', '이미 승인된 상인이 있는 점포입니다.', 409)
            user = user_repo.create(conn, login_id, password_hash, store_id=data.store_id)
            return session(conn, user)
    except UniqueViolation:
        raise AppError('LOGIN_ID_TAKEN', '이미 사용 중인 아이디입니다.', 409) from None


def login(conn, data):
    """Return failures instead of raising so the request transaction saves counters."""
    with conn.transaction():
        user = user_repo.by_login(conn, data.login_id.lower(), lock=True)
        instant = now()
        if user and user['locked_until'] and user['locked_until'] > instant:
            return AppError('ACCOUNT_LOCKED', '10분 후 다시 로그인하세요.', 423)
        valid = security.verify_password(
            data.password.get_secret_value(), user['password_hash'] if user else None
        )
        if not user or not valid:
            if user:
                failures = (0 if user['locked_until'] else user['failed_logins']) + 1
                locked = instant + timedelta(minutes=10) if failures >= 5 else None
                user_repo.login_result(conn, user['id'], failures, locked)
                if locked:
                    return AppError('ACCOUNT_LOCKED', '10분 후 다시 로그인하세요.', 423)
            return AppError('INVALID_CREDENTIALS', '아이디 또는 비밀번호를 확인하세요.', 401)
        user_repo.login_result(conn, user['id'], 0, None)
        return session(conn, user)


def current(conn, token):
    entry = session_repo.get(conn, security.token_hash(token), now()) if token else None
    user = user_repo.get(conn, entry['user_id']) if entry else None
    if user is None:
        raise AppError('UNAUTHENTICATED', '로그인이 필요합니다.', 401)
    return user


def logout(conn, token):
    if token:
        session_repo.delete(conn, security.token_hash(token))


def create_operator(conn, login_id, password):
    login_id = security.normalize_login_id(login_id)
    digest = security.hash_password(password)
    try:
        with conn.transaction():
            return user_repo.create(conn, login_id, digest, role='operator')
    except UniqueViolation:
        raise AppError('LOGIN_ID_TAKEN', '이미 사용 중인 아이디입니다.', 409) from None
