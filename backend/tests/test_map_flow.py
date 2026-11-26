"""Offline HTTP contracts and radius boundaries; no external maps or database."""

from fastapi.testclient import TestClient
from app.main import app
from app.deps import get_db
from app.core.config import settings
from app.db.repositories import store_repo


def test_public_config(monkeypatch):
    monkeypatch.setattr(settings, 'NAVER_MAP_CLIENT_ID', 'public-id')
    monkeypatch.setattr(settings, 'NAVER_MAP_CLIENT_SECRET', 'must-stay-private')
    with TestClient(app) as client:
        assert client.get('/config/public').json() == {'naver_map_client_id': 'public-id'}
        monkeypatch.setattr(settings, 'NAVER_MAP_CLIENT_ID', None)
        assert client.get('/config/public').json() == {'naver_map_client_id': None}


def test_items_contract_and_missing_market(monkeypatch):
    monkeypatch.setattr(store_repo, 'get_market', lambda c, m: {} if m == 'active' else None)
    monkeypatch.setattr(
        store_repo,
        'market_item_counts',
        lambda c, m: [
            {'item_id': 'item:apple', 'name': '사과', 'store_count': 2},
        ],
    )
    app.dependency_overrides[get_db] = lambda: object()
    try:
        with TestClient(app) as client:
            result = client.get('/markets/active/items').json()
            assert result == [{'item_id': 'item:apple', 'name': '사과', 'store_count': 2}]
            assert set(result[0]) == {'item_id', 'name', 'store_count'}
            assert client.get('/markets/absent/items').status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_radius(monkeypatch):
    monkeypatch.setattr(store_repo, 'market_extras', lambda *a: dict(store_count=0, requests=0))
    monkeypatch.setattr(
        store_repo,
        'list_markets',
        lambda c: [
            dict(id=str(i), name_ko=str(i), lat=lat, lng=127, status='active')
            for i, lat in enumerate([37, 37.05, 37.2, 38])
        ],
    )
    app.dependency_overrides[get_db] = lambda: object()
    try:
        with TestClient(app) as client:
            # 기본 10km: 37.05(약 5.6km)까지, 37.2(약 22km)는 제외
            assert len(client.get('/markets/nearby?lat=37&lng=127').json()) == 2
            assert len(client.get('/markets/nearby?lat=37&lng=127&radius_km=30').json()) == 3
            assert len(client.get('/markets/nearby').json()) == 4
            for radius in ('0', '-1', '30.1', 'nan'):
                assert client.get(f'/markets/nearby?radius_km={radius}').status_code == 422
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_far_away_falls_back_to_nearest(monkeypatch):
    monkeypatch.setattr(store_repo, 'market_extras', lambda *a: dict(store_count=0, requests=0))
    # 2026-11-26 실제: 안산 근처(경동시장 30km)에서 반경 10km 안에 시장이 없어 목록이 비었음
    monkeypatch.setattr(
        store_repo,
        'list_markets',
        lambda c: [
            dict(id=str(i), name_ko=str(i), lat=lat, lng=127, status='active')
            for i, lat in enumerate([37.5, 37.6, 38.0])
        ],
    )
    app.dependency_overrides[get_db] = lambda: object()
    try:
        with TestClient(app) as client:
            got = client.get('/markets/nearby?lat=37.0&lng=127&radius_km=10').json()
            assert [m['market_id'] for m in got] == ['0', '1', '2']
            assert got[0]['distance_m'] > 10_000
    finally:
        app.dependency_overrides.pop(get_db, None)
