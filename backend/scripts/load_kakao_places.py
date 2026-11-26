"""카카오맵 장소 검색으로 점포 위치를 찾아 지도 핀 좌표로 저장한다 (2026-11-27).

상가정보 좌표는 건물 단위라(경동 108곳 중 101곳이 같은 점) 지도 핀으로 쓰지 않는다. 이 스크립트는 점포 이름으로
카카오 로컬 "키워드로 장소 검색"을 시장 중심 반경 안에서 부르고, 이름이 맞는 장소만 `location_source='kakao'`로
저장한다. 상인이 확인한 위치(location_verified)는 건드리지 않는다. 못 찾은 점포는 그대로 두고, 화면은 예시 핀을 쓴다.

    python -m scripts.load_kakao_places --market market:gyeongdong [--radius 300] [--dry-run] [--reset]

--reset: 전에 저장한 카카오 위치를 지우고(출처만 비움) 다시 찾는다. 상가정보 건물 좌표로 되돌리려면 그 뒤에
scripts.load_market_stores를 한 번 더 돌린다(위치 출처가 없는 점포는 상가정보 좌표로 다시 채워짐).
반경은 300m가 기본: 600m로는 "서울상회"처럼 흔한 상호가 시장 밖 다른 가게로 잡혔음(2026-11-27).
"""

import argparse
import difflib

from app.core import http
from app.core.config import settings
from app.core.errors import AppError
from app.db.pool import connection
from app.db.repositories import store_repo

from ._common import run

URL = 'https://dapi.kakao.com/v2/local/search/keyword.json'


def _norm(text: str) -> str:
    return ''.join(ch for ch in text if ch.isalnum()).lower()


def match_place(name: str, documents: list[dict]) -> dict | None:
    """검색 결과 중 상호가 같은(포함하거나 0.8 이상 닮은) 첫 장소. 없으면 None."""
    want = _norm(name)
    if not want:
        return None
    for doc in documents:
        got = _norm(doc.get('place_name', ''))
        if want in got or difflib.SequenceMatcher(None, want, got).ratio() >= 0.8:
            return doc
    return None


def search(query: str, lat: float, lng: float, radius: int) -> list[dict]:
    response = http.get_sync(
        URL,
        params={
            'query': query,
            'x': lng,
            'y': lat,
            'radius': radius,
            'sort': 'accuracy',
            'size': 15,
        },
        headers={'Authorization': f'KakaoAK {settings.KAKAO_REST_API_KEY}'},
    )
    response.raise_for_status()
    return response.json().get('documents', [])


def find_place(name: str, market_name: str, lat: float, lng: float, radius: int, searcher=search):
    """상호 → "시장 + 상호" → "&"를 띄어 쓴 상호 순서로 찾음."""
    for query in dict.fromkeys([name, f'{market_name} {name}', name.replace('&', ' ')]):
        doc = match_place(name, searcher(query, lat, lng, radius))
        if doc:
            return doc
    return None


def load_kakao_places(
    conn, market_id: str, *, radius: int = 300, dry_run=False, reset=False, searcher=search
):
    market = store_repo.get_market(conn, market_id)
    if not market or market['lat'] is None or market['lng'] is None:
        raise AppError('MARKET_NOT_FOUND', f'{market_id}: 시장 좌표가 없습니다.', 404)
    if reset and not dry_run:
        conn.execute(
            'update stores set location_source=null,kakao_place_id=null '
            "where market_id=%s and location_source='kakao'",
            (market_id,),
        )
    found = skipped = missing = 0
    for store in store_repo.list_stores(conn, market_id):
        if not store['active'] or store.get('location_verified'):
            skipped += 1
            continue
        doc = find_place(
            store['name_ko'], market['name_ko'], market['lat'], market['lng'], radius, searcher
        )
        if not doc:
            missing += 1
            continue
        found += 1
        if not dry_run:
            conn.execute(
                "update stores set lat=%s,lng=%s,location_source='kakao',kakao_place_id=%s "
                'where id=%s and not location_verified',
                (float(doc['y']), float(doc['x']), doc.get('id'), store['id']),
            )
    print(f'카카오 장소 검색: 찾음={found} 못찾음={missing} 건너뜀(상인 확인·비활성)={skipped}')
    return {'found': found, 'missing': missing, 'skipped': skipped}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--market', required=True)
    parser.add_argument('--radius', type=int, default=300)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--reset', action='store_true')
    args = parser.parse_args()
    if not settings.KAKAO_REST_API_KEY:
        raise AppError('KAKAO_NOT_CONFIGURED', 'KAKAO_REST_API_KEY가 필요합니다.', 503)
    with connection() as conn, conn.transaction():
        load_kakao_places(
            conn, args.market, radius=args.radius, dry_run=args.dry_run, reset=args.reset
        )


if __name__ == '__main__':
    run(main)
