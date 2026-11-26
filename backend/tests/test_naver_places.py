"""네이버 지도 장소 자리로 찾은 점포 위치: 결과 해석, 반경·이름 거르기, 카카오보다 우선, 상인 확인은 유지."""

from pathlib import Path

import yaml
from psycopg import Rollback

from app.db.repositories import store_repo
from app.services import market_service
from scripts.load_kakao_places import load_kakao_places
from scripts.load_market_stores import load_market_stores
from scripts.load_naver_places import find_place, load_naver_places, to_place
from scripts.load_ontology import load_ontology
from scripts.load_sources import load_sources
from tests.test_ingest_db import db  # noqa: F401
from tests.test_ingest_db import pytestmark as needs_db
from tests.test_market_stores import fixture_rows

CENTER = (37.5790, 127.0391)


def item(title, lat=37.5795, lng=127.0396):
    return {'title': title, 'mapx': str(round(lng * 1e7)), 'mapy': str(round(lat * 1e7))}


def test_to_place_reads_wgs84_and_strips_tags():
    place = to_place(item('<b>대림상회</b> &amp; 청과'))
    assert place['place_name'] == '대림상회 & 청과'
    assert (round(place['lat'], 4), round(place['lng'], 4)) == (37.5795, 127.0396)
    assert to_place({'title': 'x', 'mapx': '0', 'mapy': '0'}) is None
    assert to_place({'title': 'x'}) is None


def test_find_place_keeps_only_same_name_within_radius():
    far = item('서울상회', lat=37.5900, lng=127.0500)  # 약 1.5km 밖
    near = item('서울상회 본점')
    assert find_place('서울상회', '경동시장', *CENTER, 300, lambda q: [far]) is None
    assert find_place('서울상회', '경동시장', *CENTER, 300, lambda q: [far, near])
    assert find_place('서울상회', '경동시장', *CENTER, 300, lambda q: [item('서울철물')]) is None


@needs_db
def test_naver_beats_kakao_and_keeps_merchant(db):
    data = Path(__file__).resolve().parents[2] / 'data'
    with db.transaction():
        load_sources(db, data / 'sources.yaml')
        load_ontology(db, data / 'ontology')
        config = yaml.safe_load((data / 'markets/gyeongdong.yaml').read_text())
        rows = fixture_rows()
        load_market_stores(db, config, rows)
        market_id = config['market']['id']
        market = store_repo.get_market(db, market_id)
        stores = store_repo.list_stores(db, market_id)
        first, second = stores[0], stores[1]
        db.execute(
            "update stores set lat=37.5811,lng=127.0411,location_verified=true,location_source='merchant' where id=%s",
            (second['id'],),
        )
        lat, lng = market['lat'] + 0.0005, market['lng'] + 0.0005

        def kakao(query, *_):
            return [
                {'place_name': first['name_ko'], 'x': str(lng + 0.0003), 'y': str(lat), 'id': 'k'}
            ]

        def naver(query):
            return [
                item(first['name_ko'], lat=lat, lng=lng),
                item(second['name_ko'], lat=lat, lng=lng),
            ]

        load_kakao_places(db, market_id, searcher=kakao)
        result = load_naver_places(db, market_id, searcher=naver)
        assert result['found'] == 1
        got = store_repo.get_store(db, first['id'])
        assert (round(got['lat'], 6), round(got['lng'], 6), got['location_source']) == (
            round(lat, 6),
            round(lng, 6),
            'naver',
        )
        # 카카오를 다시 돌려도 네이버 자리를 덮지 않음, 상인 확인 위치는 그대로
        load_kakao_places(db, market_id, searcher=kakao)
        assert store_repo.get_store(db, first['id'])['location_source'] == 'naver'
        assert store_repo.get_store(db, second['id'])['lat'] == 37.5811
        pins = {s.store_id: s for s in market_service.market_map(db, market_id).stores}
        assert pins[first['id']].location_source == 'naver'
        assert pins[second['id']].location_source == 'merchant'
        raise Rollback()
