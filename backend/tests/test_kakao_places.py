"""카카오 장소 검색으로 찾은 점포 위치: 이름 맞추기, 저장, 지도 노출, 상가정보 재적재·상인 확인과의 관계."""

from pathlib import Path

import yaml
from psycopg import Rollback

from app.db.repositories import store_repo
from app.services import market_service
from scripts.load_kakao_places import find_place, load_kakao_places, match_place
from scripts.load_market_stores import load_market_stores
from scripts.load_ontology import load_ontology
from scripts.load_sources import load_sources
from tests.test_ingest_db import db  # noqa: F401
from tests.test_ingest_db import pytestmark as needs_db
from tests.test_market_stores import fixture_rows


def doc(name, x='127.0401', y='37.5801', pid='1'):
    return {'place_name': name, 'x': x, 'y': y, 'id': pid}


def test_match_place_needs_same_name():
    assert (
        match_place('대림상회', [doc('대림상회 경동시장점')])['place_name'] == '대림상회 경동시장점'
    )
    assert match_place('금손아씨&주문진상회', [doc('금손아씨 주문진상회')])
    assert match_place('대림상회', [doc('대림철물'), doc('경동시장')]) is None
    assert match_place('', [doc('아무 가게')]) is None


def test_find_place_tries_market_prefix_then_spacing():
    asked = []

    def searcher(query, lat, lng, radius):
        asked.append(query)
        return [doc('주문진상회 금손아씨')] if query == '금손아씨 주문진상회' else []

    assert find_place('금손아씨&주문진상회', '경동시장', 37.5, 127.0, 600, searcher) is None
    assert asked == ['금손아씨&주문진상회', '경동시장 금손아씨&주문진상회', '금손아씨 주문진상회']
    assert find_place('현대재료', '경동시장', 37.5, 127.0, 600, lambda *_: [doc('현대재료')])


@needs_db
def test_kakao_locations_reach_the_map_and_survive_reload(db):
    data = Path(__file__).resolve().parents[2] / 'data'
    with db.transaction():
        load_sources(db, data / 'sources.yaml')
        load_ontology(db, data / 'ontology')
        config = yaml.safe_load((data / 'markets/gyeongdong.yaml').read_text())
        rows = fixture_rows()
        load_market_stores(db, config, rows)
        market_id = config['market']['id']
        first, second = (s['id'] for s in store_repo.list_stores(db, market_id)[:2])
        names = {s['id']: s['name_ko'] for s in store_repo.list_stores(db, market_id)}
        # 두 번째 점포는 상인이 이미 위치를 확인함: 카카오 결과로 덮지 않음
        db.execute(
            "update stores set lat=37.5811,lng=127.0411,location_verified=true,location_source='merchant' where id=%s",
            (second,),
        )
        found = {names[first]: doc(names[first], x='127.0399', y='37.5795', pid='kakao-1')}
        found[names[second]] = doc(names[second], x='127.1', y='37.6')
        result = load_kakao_places(
            db, market_id, searcher=lambda query, *_: [d for n, d in found.items() if n in query]
        )
        assert result['found'] == 1 and result['skipped'] >= 1
        located = store_repo.get_store(db, first)
        assert (located['lat'], located['lng'], located['location_source']) == (
            37.5795,
            127.0399,
            'kakao',
        )
        assert located['kakao_place_id'] == 'kakao-1' and not located['location_verified']
        assert store_repo.get_store(db, second)['lat'] == 37.5811

        stores = {s.store_id: s for s in market_service.market_map(db, market_id).stores}
        assert (stores[first].lat, stores[first].location_source, stores[first].verified) == (
            37.5795,
            'kakao',
            False,
        )
        assert stores[second].location_source == 'merchant'
        others = [s for k, s in stores.items() if k not in (first, second)]
        assert all(s.lat is None and s.location_source is None for s in others)

        # 상가정보를 다시 적재해도 카카오 위치는 남음
        load_market_stores(db, config, rows)
        assert store_repo.get_store(db, first)['lat'] == 37.5795
        # --reset: 카카오 출처를 지우고 다시 찾음(이번엔 못 찾음) → 상가정보 재적재로 건물 좌표 복귀
        load_kakao_places(db, market_id, reset=True, searcher=lambda *_: [])
        assert store_repo.get_store(db, first)['location_source'] is None
        load_market_stores(db, config, rows)
        assert store_repo.get_store(db, first)['lat'] != 37.5795
        assert store_repo.get_store(db, second)['location_source'] == 'merchant'
        raise Rollback()
