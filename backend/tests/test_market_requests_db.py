"""Real SQL verification, restricted to the existing marketon_test-only fixture."""

from uuid import uuid4
import pytest
from psycopg import Rollback
from tests.test_ingest_db import db, pytestmark
from app.db.repositories import market_request_repo as repo, store_repo, user_repo
from app.schemas.market_request import Join
from app.services import market_request_service as service, auth_service


def test_loader_demand_atomic_approval_and_rollback(db, monkeypatch):
    with db.transaction():
        value = dict(
            id='market:std-fixture',
            name_ko='고정 시장',
            address='서울',
            lat=37.57,
            lng=126.99,
            store_count=10,
        )
        repo.upsert_listed(db, value)
        assert store_repo.get_market(db, value['id'])['status'] == 'listed'
        device = uuid4()
        service.request(db, value['id'], device)
        service.request(db, value['id'], device)
        assert repo.demand(db, value['id']) == [dict(kind='request', count=1)]
        for _ in range(4):
            service.request(db, value['id'], uuid4())
        assert service.demand(db, value['id'])['requests_7d'] == 5
        data = Join(
            market_id=value['id'],
            manager_org='상인회',
            contact='02-123-4567',
            login_id='fixture_manager',
            password='password123',
        )
        entry = service.join(db, data)
        operator = auth_service.create_operator(db, 'fixture_operator', 'password123')
        original = repo.review

        def fail(*args):
            raise RuntimeError('force transaction rollback')

        monkeypatch.setattr(repo, 'review', fail)
        with pytest.raises(RuntimeError):
            service.review(db, operator, entry['id'], 'approved')
        assert store_repo.get_market(db, value['id'])['status'] == 'listed'
        assert user_repo.get(db, entry['admin_user_id'])['status'] == 'pending'
        assert repo.get(db, entry['id'])['status'] == 'pending'
        monkeypatch.setattr(repo, 'review', original)
        service.review(db, operator, entry['id'], 'approved')
        assert store_repo.get_market(db, value['id'])['status'] == 'active'
        assert user_repo.get(db, entry['admin_user_id'])['status'] == 'approved'
        repo.upsert_listed(db, value)
        assert store_repo.get_market(db, value['id'])['status'] == 'active'
        raise Rollback()
