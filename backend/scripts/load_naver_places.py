"""네이버 지도 장소 자리로 점포 핀 위치를 찾는다 (2026-11-27).

화면 지도가 네이버라서, 네이버 지도에 표시된 그 가게 자리에 핀이 찍히도록 네이버 개발자센터 "검색 > 지역" API로
점포 이름을 찾고, 이름이 맞고 시장 중심에서 반경 안인 장소만 `location_source='naver'`로 저장한다.
상인이 확인한 위치는 건드리지 않는다. 네이버에서 못 찾은 점포는 카카오 위치(scripts.load_kakao_places)를 그대로 둔다.

    python -m scripts.load_naver_places --market market:gyeongdong [--radius 300] [--dry-run] [--reset]

--reset: 전에 저장한 네이버 위치의 출처를 비우고 다시 찾는다(그 뒤 카카오·상가정보 적재를 다시 돌리면 원래대로).
"""

import argparse
import html
import math
import re

from app.core import http
from app.core.config import settings
from app.core.errors import AppError
from app.db.pool import connection
from app.db.repositories import store_repo

from ._common import run
from .load_kakao_places import match_place

URL = 'https://openapi.naver.com/v1/search/local.json'


def to_place(item: dict) -> dict | None:
    """지역 검색 결과 → {place_name, lat, lng}. mapx·mapy는 WGS84 경위도에 1e7을 곱한 정수."""
    try:
        lng, lat = int(item['mapx']) / 1e7, int(item['mapy']) / 1e7
    except (KeyError, TypeError, ValueError):
        return None
    if not (33 <= lat <= 39 and 124 <= lng <= 132):
        return None
    name = html.unescape(re.sub(r'<[^>]+>', '', item.get('title', '')))
    return {'place_name': name, 'lat': lat, 'lng': lng}


def meters(lat1, lng1, lat2, lng2) -> float:
    dy = (lat2 - lat1) * 111_000
    dx = (lng2 - lng1) * 111_000 * math.cos(math.radians(lat1))
    return math.hypot(dx, dy)


def search(query: str) -> list[dict]:
    response = http.get_sync(
        URL,
        params={'query': query, 'display': 5, 'sort': 'random'},
        headers={
            'X-Naver-Client-Id': settings.NAVER_SEARCH_CLIENT_ID or '',
            'X-Naver-Client-Secret': settings.NAVER_SEARCH_CLIENT_SECRET or '',
        },
    )
    response.raise_for_status()
    return response.json().get('items', [])


def find_place(name, market_name, lat, lng, radius, searcher=search):
    """ "시장 + 상호" → 상호 순서로 찾고, 이름이 맞고 반경 안인 첫 장소."""
    for query in dict.fromkeys(
        [f'{market_name} {name}', name, f'{market_name} {name.replace("&", " ")}']
    ):
        places = [p for p in map(to_place, searcher(query)) if p]
        near = [p for p in places if meters(lat, lng, p['lat'], p['lng']) <= radius]
        place = match_place(name, near)
        if place:
            return place
    return None


def load_naver_places(conn, market_id, *, radius=300, dry_run=False, reset=False, searcher=search):
    market = store_repo.get_market(conn, market_id)
    if not market or market['lat'] is None or market['lng'] is None:
        raise AppError('MARKET_NOT_FOUND', f'{market_id}: 시장 좌표가 없습니다.', 404)
    if reset and not dry_run:
        conn.execute(
            "update stores set location_source=null where market_id=%s and location_source='naver'",
            (market_id,),
        )
    found = skipped = missing = 0
    for store in store_repo.list_stores(conn, market_id):
        if not store['active'] or store.get('location_verified'):
            skipped += 1
            continue
        place = find_place(
            store['name_ko'], market['name_ko'], market['lat'], market['lng'], radius, searcher
        )
        if not place:
            missing += 1
            continue
        found += 1
        if not dry_run:
            conn.execute(
                "update stores set lat=%s,lng=%s,location_source='naver' "
                'where id=%s and not location_verified',
                (place['lat'], place['lng'], store['id']),
            )
    print(f'네이버 장소 검색: 찾음={found} 못찾음={missing} 건너뜀(상인 확인·비활성)={skipped}')
    return {'found': found, 'missing': missing, 'skipped': skipped}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--market', required=True)
    parser.add_argument('--radius', type=int, default=300)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--reset', action='store_true')
    args = parser.parse_args()
    if not (settings.NAVER_SEARCH_CLIENT_ID and settings.NAVER_SEARCH_CLIENT_SECRET):
        raise AppError(
            'NAVER_SEARCH_NOT_CONFIGURED',
            'NAVER_SEARCH_CLIENT_ID, NAVER_SEARCH_CLIENT_SECRET이 필요합니다.',
            503,
        )
    with connection() as conn, conn.transaction():
        load_naver_places(
            conn, args.market, radius=args.radius, dry_run=args.dry_run, reset=args.reset
        )


if __name__ == '__main__':
    run(main)
