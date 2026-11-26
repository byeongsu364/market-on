"""Registration, login throttling and persistent opaque sessions."""

import threading
from datetime import UTC, datetime, timedelta

from psycopg.errors import UniqueViolation

from app.core import captcha, security
from app.core.config import settings
from app.core.errors import AppError
from app.db.repositories import session_repo, store_repo, user_repo

LOCK_AFTER = 5
CAPTCHA_AFTER = 2  # 같은 아이디로 2번 틀리면 다음 로그인부터 캡차 필요
LOCK_FOR = timedelta(minutes=10)
# 없는 아이디도 실제 계정처럼 5회 실패 시 ACCOUNT_LOCKED를 돌려줘서
# "잠기는 아이디 = 있는 아이디"로 계정 존재를 알아내지 못하게 함 (메모리에만, 개수 제한).
_UNKNOWN_MAX = 10_000
_unknown_logins: dict[str, dict] = {}
_unknown_lock = threading.Lock()


def now():
    return datetime.now(UTC)


def _remember_unknown(login_id, failures, locked_until):
    with _unknown_lock:
        _unknown_logins.pop(login_id, None)
        while len(_unknown_logins) >= _UNKNOWN_MAX:
            _unknown_logins.pop(next(iter(_unknown_logins)))
        _unknown_logins[login_id] = {'failed_logins': failures, 'locked_until': locked_until}


def public_user(conn, user):
    store = store_repo.get_store(conn, user['store_id']) if user['store_id'] else None
    market = store_repo.get_market(conn, user['market_id']) if user.get('market_id') else None
    return {key: user[key] for key in ('id', 'login_id', 'role', 'status')} | {
        'created_at': user.get('created_at'),
        'lang': user.get('lang', 'ko'),
        'store': {
            'store_id': store['id'],
            'name': store['name_ko'],
            'market_id': store['market_id'],
        }
        if store
        else None,
        'market': {'market_id': user['market_id'], 'name': market['name_ko']} if market else None,
    }


def session(conn, user):
    token = security.new_session_token()
    session_repo.create(
        conn, security.token_hash(token), user['id'], now() + timedelta(days=settings.SESSION_DAYS)
    )
    return public_user(conn, user), token


def require_captcha(data):
    """캡차가 없거나 틀리면 막아요. 비밀번호 해시(무거운 계산) 전에 불러요."""
    if not settings.CAPTCHA_ENABLED:
        return
    if not data.captcha_id or not data.captcha_answer:
        raise AppError('CAPTCHA_REQUIRED', '자동입력 방지 숫자를 입력해 주세요.', 400)
    if not captcha.verify(data.captcha_id, data.captcha_answer):
        raise AppError(
            'CAPTCHA_INVALID',
            '자동입력 방지 숫자가 맞지 않아요. 새 숫자로 다시 입력해 주세요.',
            400,
        )


def signup(conn, data):
    require_captcha(data)
    login_id = security.normalize_login_id(data.login_id)
    password_hash = security.hash_password(data.password.get_secret_value())
    try:
        with conn.transaction():
            if data.role == 'customer':
                user = user_repo.create(conn, login_id, password_hash, role='customer')
                return session(conn, user)
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
    login_id = data.login_id.lower()
    password = data.password.get_secret_value()
    locked_error = AppError('ACCOUNT_LOCKED', '10분 후 다시 로그인하세요.', 423)
    with conn.transaction():
        user = user_repo.by_login(conn, login_id, lock=True)
        state = user or _unknown_logins.get(login_id) or {'failed_logins': 0, 'locked_until': None}
        instant = now()
        if state['locked_until'] and state['locked_until'] > instant:
            return locked_error
        # 2번 이상 틀렸거나, 잠겼다가 풀린 직후면 캡차부터
        if state['locked_until'] or state['failed_logins'] >= CAPTCHA_AFTER:
            # 캡차가 틀리면 비밀번호를 확인하지 않고 실패 횟수도 늘리지 않아요
            # (없는 아이디도 똑같이 세서, 캡차 요구 여부로 계정 존재를 알 수 없음)
            try:
                require_captcha(data)
            except AppError as error:
                return error
        valid = security.verify_password(password, user['password_hash'] if user else None)
        if user and valid:
            user_repo.login_result(conn, user['id'], 0, None)
            session_repo.purge_expired(conn, user['id'], instant)
            return session(conn, user)
        failures = (0 if state['locked_until'] else state['failed_logins']) + 1
        locked = instant + LOCK_FOR if failures >= LOCK_AFTER else None
        if user:
            user_repo.login_result(conn, user['id'], failures, locked)
        else:
            _remember_unknown(login_id, failures, locked)
        if locked:
            return locked_error
        return AppError('INVALID_CREDENTIALS', '아이디 또는 비밀번호를 확인하세요.', 401)


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


def create_market_admin(conn, login_id, password, market_id, *, pending=False):
    login_id = security.normalize_login_id(login_id)
    digest = security.hash_password(password)
    try:
        with conn.transaction():
            if not store_repo.get_market(conn, market_id):
                raise AppError('MARKET_NOT_FOUND', '시장을 찾을 수 없습니다.', 404)
            return user_repo.create(
                conn,
                login_id,
                digest,
                role='market_admin',
                market_id=market_id,
                **({'status': 'pending'} if pending else {}),
            )
    except UniqueViolation:
        raise AppError('LOGIN_ID_TAKEN', '이미 사용 중인 아이디입니다.', 409) from None
