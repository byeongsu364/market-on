"""수동 대조한 점포 위치 파일: 형식, 적재, 자동 검색 위치 비우기, 상인 확인 유지."""

from pathlib import Path

import pytest
import yaml
from psycopg import Rollback

from app.core.errors import AppError
from app.db.repositories import store_repo
from app.services import market_service
from scripts.load_market_stores import load_market_stores
from scripts.load_ontology import load_ontology
from scripts.load_sources import load_sources
from scripts.load_store_locations import load_store_locations
from tests.test_ingest_db import db  # noqa: F401
from tests.test_ingest_db import pytestmark as needs_db
from tests.test_market_stores import fixture_rows

DATA = Path(__file__).resolve().parents[2] / 'data'


def test_gyeongdong_file_is_checked_and_complete():
    data = yaml.safe_load((DATA / 'markets/gyeongdong_locations.yaml').read_text())
    rows = data['locations']
    assert data['market_id'] == 'market:gyeongdong' and len(rows) >= 30
    assert len({r['store_id'] for r in rows}) == len(rows)
    for r in rows:
        assert r['source'] == 'kakao' and r['kakao_place_id']
        # 수동 대조 기준: 같은 건물(도로명 주소)
        assert r['kakao_address'].split('동대문구 ')[-1] == r['sbiz_address'].split('동대문구 ')[-1]
        assert 37.57 < r['lat'] < 37.59 and 127.03 < r['lng'] < 127.05


@needs_db
def test_file_replaces_auto_locations_and_keeps_merchant(db):
    with db.transaction():
        load_sources(db, DATA / 'sources.yaml')
        load_ontology(db, DATA / 'ontology')
        config = yaml.safe_load((DATA / 'markets/gyeongdong.yaml').read_text())
        load_market_stores(db, config, fixture_rows())
        market_id = config['market']['id']
        a, c = (s['id'] for s in store_repo.list_stores(db, market_id)[:2])
        db.execute("update stores set lat=37.6,lng=127.1,location_source='kakao' where id=%s", (a,))
        db.execute(
            'update stores set lat=37.5811,lng=127.0411,location_verified=true,'
            "location_source='merchant' where id=%s",
            (c,),
        )
        others = [
            {'store_id': c, 'lat': 37.5, 'lng': 127.0, 'source': 'kakao'},
            {'store_id': 'store:absent', 'lat': 37.5, 'lng': 127.0, 'source': 'kakao'},
        ]
        # 파일에 없는 자동 검색 위치는 비우고, 상인 확인·없는 점포는 건너뜀
        assert load_store_locations(db, {'market_id': market_id, 'locations': others}) == {
            'applied': 0,
            'skipped': 2,
            'hidden': 0,
        }
        assert store_repo.get_store(db, a)['location_source'] is None
        assert store_repo.get_store(db, c)['lat'] == 37.5811
        mine = {
            'store_id': a,
            'lat': 37.5795,
            'lng': 127.0399,
            'source': 'kakao',
            'kakao_place_id': 'p1',
        }
        data = {'market_id': market_id, 'locations': [mine, *others]}
        assert load_store_locations(db, data) == {'applied': 1, 'skipped': 2, 'hidden': 0}
        pins = {s.store_id: s for s in market_service.market_map(db, market_id).stores}
        assert (pins[a].lat, pins[a].location_source) == (37.5795, 'kakao')
        assert pins[c].location_source == 'merchant'
        with pytest.raises(AppError):
            load_store_locations(
                db,
                {
                    'market_id': market_id,
                    'locations': [{'store_id': a, 'lat': 0, 'lng': 0, 'source': 'kakao'}],
                },
            )
        raise Rollback()


def test_gyeongdong_duplicates_point_to_kept_stores():
    data = yaml.safe_load((DATA / 'markets/gyeongdong_locations.yaml').read_text())
    located = {r['store_id'] for r in data['locations']}
    for d in data['duplicates']:
        assert d['store_id'] != d['duplicate_of'] and d['store_id'] not in located


@needs_db
def test_duplicates_hidden_and_survive_reload(db):
    with db.transaction():
        load_sources(db, DATA / 'sources.yaml')
        load_ontology(db, DATA / 'ontology')
        config = yaml.safe_load((DATA / 'markets/gyeongdong.yaml').read_text())
        rows = fixture_rows()
        load_market_stores(db, config, rows)
        market_id = config['market']['id']
        keep, dup = (s['id'] for s in store_repo.list_stores(db, market_id)[:2])
        before = market_service.market_detail(db, market_id).store_count
        data = {
            'market_id': market_id,
            'locations': [],
            'duplicates': [{'store_id': dup, 'duplicate_of': keep}],
        }
        assert load_store_locations(db, data)['hidden'] == 1
        ids = {s.store_id for s in market_service.market_map(db, market_id).stores}
        assert keep in ids and dup not in ids
        assert market_service.market_detail(db, market_id).store_count == before - 1
        # 상가정보를 다시 적재해도 숨긴 채로
        load_market_stores(db, config, rows)
        assert store_repo.get_store(db, dup)['active'] is False
        # 파일에서 빼면 되살아남
        assert load_store_locations(db, {**data, 'duplicates': []})['hidden'] == 0
        assert store_repo.get_store(db, dup)['active'] is True
        with pytest.raises(AppError):
            load_store_locations(
                db, {**data, 'duplicates': [{'store_id': keep, 'duplicate_of': keep}]}
            )
        raise Rollback()
