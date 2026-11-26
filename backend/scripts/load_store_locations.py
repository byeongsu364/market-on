"""수동 대조한 점포 핀 위치 파일을 적재한다 (2026-11-27).

`data/markets/<시장>_locations.yaml`은 카카오맵 장소를 상가정보 상호·도로명 주소와 하나씩 대조해 맞는 것만 남긴
파일이다(근거: kakao_name, kakao_address, sbiz_address). 적재하면 그 시장의 자동 검색 위치(kakao·naver)를 먼저 비우고
파일에 있는 점포만 핀 좌표로 쓴다. 상인이 확인한 위치는 건드리지 않는다.
`duplicates`에 적힌 점포(같은 가게가 상가정보에 두 번 올라온 것)는 duplicate_of를 남기고 지도·목록에서 숨긴다.
자동 검색으로 들어갔던 점포를 상가정보 건물 좌표로 되돌리려면 이어서 scripts.load_market_stores를 돌린다.

    python -m scripts.load_store_locations --file /srv/data/markets/gyeongdong_locations.yaml
"""

import argparse
from pathlib import Path

import yaml

from app.core.errors import AppError
from app.db.pool import connection
from app.db.repositories import store_repo

from ._common import run

SOURCES = {'kakao', 'naver'}


def load_store_locations(conn, data: dict) -> dict:
    market_id = data['market_id']
    if not store_repo.get_market(conn, market_id):
        raise AppError('MARKET_NOT_FOUND', f'{market_id}: 시장이 없습니다.', 404)
    conn.execute(
        'update stores set location_source=null,kakao_place_id=null '
        "where market_id=%s and location_source in ('kakao','naver')",
        (market_id,),
    )
    applied = skipped = 0
    for row in data.get('locations', []):
        if row.get('source') not in SOURCES:
            raise AppError(
                'INVALID_SOURCE', f'{row.get("store_id")}: source는 kakao 또는 naver', 422
            )
        lat, lng = float(row['lat']), float(row['lng'])
        if not (33 <= lat <= 39 and 124 <= lng <= 132):
            raise AppError('INVALID_LOCATION', f'{row["store_id"]}: 좌표가 한국 밖입니다.', 422)
        updated = conn.execute(
            'update stores set lat=%s,lng=%s,location_source=%s,kakao_place_id=%s '
            'where id=%s and market_id=%s and not location_verified',
            (lat, lng, row['source'], row.get('kakao_place_id'), row['store_id'], market_id),
        ).rowcount
        applied += updated
        skipped += 1 - updated
    hidden = apply_duplicates(conn, market_id, data.get('duplicates', []))
    print(
        f'점포 위치 파일: 적용={applied} 건너뜀(없는 점포·상인 확인)={skipped} 중복 숨김={hidden}'
    )
    return {'applied': applied, 'skipped': skipped, 'hidden': hidden}


def apply_duplicates(conn, market_id: str, rows: list[dict]) -> int:
    """파일 내용으로 다시 맞춤: 전에 숨긴 것을 되살린 뒤 파일에 있는 것만 숨김."""
    conn.execute(
        'update stores set active=true,duplicate_of=null where market_id=%s and duplicate_of is not null',
        (market_id,),
    )
    hidden = 0
    for row in rows:
        if row['store_id'] == row['duplicate_of']:
            raise AppError(
                'INVALID_DUPLICATE', f'{row["store_id"]}: 자기 자신을 가리킬 수 없습니다.', 422
            )
        hidden += conn.execute(
            'update stores set active=false,duplicate_of=%s where id=%s and market_id=%s '
            'and exists(select 1 from stores k where k.id=%s and k.market_id=%s)',
            (row['duplicate_of'], row['store_id'], market_id, row['duplicate_of'], market_id),
        ).rowcount
    return hidden


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--file', required=True, type=Path)
    args = parser.parse_args()
    data = yaml.safe_load(args.file.read_text(encoding='utf-8'))
    with connection() as conn, conn.transaction():
        load_store_locations(conn, data)


if __name__ == '__main__':
    run(main)
