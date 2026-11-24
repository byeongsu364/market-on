"""Real transaction/SQL tests restricted by the marketon_test-only fixture."""

from psycopg import Rollback
from fastapi.testclient import TestClient
from tests.test_ingest_db import db, pytestmark
from tests.test_auth_api import HEADER, PASSWORD
from app.main import app
from app.deps import get_db
from app.core import security
from app.db.repositories import user_repo
from app.services import auth_service
from scripts.seed_demo_market import seed_demo_market
import pytest


@pytest.fixture
def auth_db(db):
    with db.transaction():
        seed_demo_market(db)
        app.dependency_overrides[get_db] = lambda: db
        try:
            with TestClient(app) as client:
                yield db, client
        finally:
            app.dependency_overrides.pop(get_db, None)
        raise Rollback()


def test_auth_approval_cookie_session_and_counters(auth_db):
    conn, client = auth_db

    def signup(lid):
        return client.post(
            '/auth/signup',
            headers=HEADER,
            json=dict(login_id=lid, password=PASSWORD, store_id='store:demo-A05'),
        )

    response = signup('db_merchant')
    assert response.status_code == 201
    uid = response.json()['user']['id']
    cookie = client.cookies.get('mo_session')
    stored = conn.execute('select id from sessions').fetchall()
    assert (security.token_hash(cookie),) in stored and (cookie,) not in stored
    assert client.get('/merchant/store').status_code == 403
    second = signup('db_second').json()['user']['id']
    auth_service.create_operator(conn, 'db_admin', PASSWORD)

    def login(lid, password=PASSWORD):
        return client.post(
            '/auth/login', headers=HEADER, json=dict(login_id=lid, password=password)
        )

    assert login('db_admin').status_code == 200
    assert client.post(f'/admin/merchants/{uid}/approve', headers=HEADER).status_code == 200
    assert (
        client.post(f'/admin/merchants/{second}/approve', headers=HEADER).json()['error']['code']
        == 'STORE_TAKEN'
    )
    assert login('db_merchant').status_code == 200
    assert client.get('/merchant/store').status_code == 200
    for _ in range(4):
        assert login('db_merchant', 'incorrect').status_code == 401
    assert login('db_merchant', 'incorrect').status_code == 423
    user = user_repo.by_login(conn, 'db_merchant')
    assert user['failed_logins'] == 5 and user['locked_until'] > auth_service.now()
    # Force expiration, then verify a successful login clears persisted counters.
    conn.execute("update users set locked_until=now()-interval '1 minute' where id=%s", (uid,))
    assert login('db_merchant').status_code == 200
    assert user_repo.by_login(conn, 'db_merchant')['failed_logins'] == 0
    token = client.cookies.get('mo_session')
    before = conn.execute(
        'select last_seen_at from sessions where id=%s', (security.token_hash(token),)
    ).fetchone()[0]
    assert client.get('/auth/me').status_code == 200
    after = conn.execute(
        'select last_seen_at from sessions where id=%s', (security.token_hash(token),)
    ).fetchone()[0]
    assert after >= before
    conn.execute(
        "update sessions set expires_at=now()-interval '1 second' where id=%s",
        (security.token_hash(token),),
    )
    assert client.get('/auth/me').status_code == 401
    assert login('db_merchant').status_code == 200
    assert client.post('/auth/logout', headers=HEADER).status_code == 204
    assert client.get('/auth/me').status_code == 401


def test_login_failure_commits_across_connections(db):
    """A failed response must not roll back the request's failed_logins update."""
    from app.db.pool import connection
    from app.schemas.merchant import Credentials
    from app.core.errors import AppError

    # The shared fixture owns no outer rollback transaction here.
    with connection() as conn:
        auth_service.create_operator(conn, 'commit_check', PASSWORD)
    try:
        with connection() as conn:
            result = auth_service.login(
                conn, Credentials(login_id='commit_check', password='incorrect')
            )
            assert isinstance(result, AppError)
        with connection() as conn:
            assert user_repo.by_login(conn, 'commit_check')['failed_logins'] == 1
    finally:
        with connection() as conn:
            conn.execute("delete from users where login_id='commit_check'")
