"""Offline date, authorization and anonymous recording contracts."""

from datetime import datetime, date, timezone
from unittest.mock import Mock
import pytest
from tests.test_auth_api import memory, approved, operator, HEADER
from tests.test_market_admin_api import manager, login_manager
from app.db.repositories import stats_repo
from app.services import stats_service


@pytest.fixture(autouse=True)
def clear_directions():
    stats_service._seen.clear()
    yield
    stats_service._seen.clear()


def test_directions_dedup_expiry_store_and_csrf(memory, monkeypatch):
    client = memory['client']
    insert = Mock()
    monkeypatch.setattr(stats_repo, 'directions', insert)
    clock = [0]
    monkeypatch.setattr(stats_service, 'monotonic', lambda: clock[0])
    headers = HEADER | {'X-Device-Id': 'device-secret'}
    assert client.post('/stores/store:a/directions').status_code == 403
    assert client.post('/stores/store:a/directions', headers=HEADER).status_code == 422
    assert client.post('/stores/absent/directions', headers=headers).status_code == 404
    for _ in range(2):
        assert client.post('/stores/store:a/directions', headers=headers).status_code == 204
    assert insert.call_count == 1
    assert all('device-secret' not in key for key in stats_service._seen)
    client.post('/stores/store:b/directions', headers=headers)
    client.post('/stores/store:a/directions', headers=HEADER | {'X-Device-Id': 'other'})
    assert insert.call_count == 3
    clock[0] = 599.99
    client.post('/stores/store:a/directions', headers=headers)
    assert insert.call_count == 3
    clock[0] = 600
    client.post('/stores/store:a/directions', headers=headers)
    assert insert.call_count == 4


def test_direction_failure_does_not_suppress_retry(memory, monkeypatch):
    insert = Mock(side_effect=[RuntimeError('rollback'), None])
    monkeypatch.setattr(stats_repo, 'directions', insert)
    with pytest.raises(RuntimeError):
        stats_service.record_direction(memory['conn'], 'store:a', 'device')
    stats_service.record_direction(memory['conn'], 'store:a', 'device')
    assert insert.call_count == 2


def test_merchant_days_and_seoul_boundary(memory, monkeypatch):
    approved(memory)
    client = memory['client']
    instant = [datetime(2026, 11, 26, 14, 59, 59, tzinfo=timezone.utc)]
    monkeypatch.setattr(stats_service, 'now', lambda: instant[0])
    daily = Mock(return_value=[dict(day=date(2026, 11, 26), views=9, directions=2)])
    monkeypatch.setattr(stats_repo, 'daily', daily)
    response = client.get('/merchant/stats?days=3').json()
    assert response == dict(
        today=dict(views=9, directions=2),
        favorites=None,
        days=[
            dict(day='2026-11-24', views=0, directions=0),
            dict(day='2026-11-25', views=0, directions=0),
            dict(day='2026-11-26', views=9, directions=2),
        ],
    )
    assert daily.call_args.args[1:] == ('store:a', date(2026, 11, 24), date(2026, 11, 26))
    instant[0] = datetime(2026, 11, 26, 15, tzinfo=timezone.utc)
    assert client.get('/merchant/stats?days=1').json()['days'] == [
        dict(day='2026-11-27', views=0, directions=0)
    ]
    for days in (0, 29):
        assert client.get(f'/merchant/stats?days={days}').status_code == 422
    daily.return_value = []
    assert len(client.get('/merchant/stats?days=28').json()['days']) == 28
    assert len(client.get('/merchant/stats').json()['days']) == 7


def test_stats_role_permissions(memory, monkeypatch):
    client = memory['client']
    for path in ('/merchant/stats', '/market-admin/stats', '/admin/markets?status=active'):
        assert client.get(path).status_code == 401
    approved(memory)
    assert client.get('/market-admin/stats').status_code == 403
    assert client.get('/admin/markets?status=listed').status_code == 403
    operator(memory)
    assert client.get('/merchant/stats').status_code == 403
    assert client.get('/market-admin/stats').status_code == 403
    read = Mock(return_value=[])
    monkeypatch.setattr(stats_repo, 'markets', read)
    for status in ('listed', 'active'):
        assert client.get(f'/admin/markets?status={status}').json() == []
        assert read.call_args.args[1] == status
    assert client.get('/admin/markets?status=wrong').status_code == 422


def test_market_scope_and_seoul_week(manager, monkeypatch):
    login_manager(manager)
    monkeypatch.setattr(
        stats_service, 'now', lambda: datetime(2026, 11, 26, 15, tzinfo=timezone.utc)
    )
    summary = Mock(
        return_value=dict(stores=2, merchants_approved=1, merchants_pending=1, views_week=8)
    )
    recent = Mock(return_value=[])
    monkeypatch.setattr(stats_repo, 'market', summary)
    monkeypatch.setattr(stats_repo, 'recent', recent)
    result = manager['client'].get('/market-admin/stats').json()
    assert result == dict(
        stores=2, merchants_approved=1, merchants_pending=1, views_week=8, recent=[]
    )
    assert summary.call_args.args[1:] == ('market:test', date(2026, 11, 21), date(2026, 11, 27))
    assert recent.call_args.args[1] == 'market:test'
    assert recent.call_args.args[2].isoformat() == '2026-11-21T00:00:00+09:00'
    assert recent.call_args.args[3].isoformat() == '2026-11-28T00:00:00+09:00'
    assert manager['client'].get('/merchant/stats').status_code == 403
    assert manager['client'].get('/admin/markets?status=active').status_code == 403
