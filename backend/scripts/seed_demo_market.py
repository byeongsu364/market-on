"""Seed the 24-store demo map without creating accounts or sales."""

import argparse
from app.db.pool import connection
from app.db.repositories import store_repo, demo_repo
from ._common import run

CATEGORIES = [
    ('fruit', '청과'),
    ('vegetable', '채소'),
    ('seafood', '수산'),
    ('meat', '정육'),
    ('side_dish', '반찬'),
    ('snack', '떡·분식'),
]
ITEMS = [
    ('green_onion', '대파'),
    ('onion', '양파'),
    ('apple', '사과'),
    ('pear', '배'),
    ('sweet_persimmon', '단감'),
]


# 시연용 좌표: frontend mock과 동일한 고정 위치.
DEMO_LAT = 37.57
DEMO_LNG = 126.99


def seed_demo_market(conn):
    with conn.transaction():
        for key, name in ITEMS:
            demo_repo.ensure_entity(conn, f'item:{key}', 'item', name)
        store_repo.upsert_market(
            conn,
            id='market:demo',
            name_ko='시연 시장',
            lat=DEMO_LAT,
            lng=DEMO_LNG,
            source='manual',
            at_sgg_nm='서울',
            at_mrkt_cd=None,
        )
        for index, (key, name) in enumerate(CATEGORIES):
            category_id = f'store_category:{key}'
            demo_repo.ensure_entity(conn, category_id, 'store_category', name)
            store_repo.upsert_zone(
                conn,
                id=f'zone:demo-{index}',
                market_id='market:demo',
                store_category_id=category_id,
                name_ko=name,
                x=(index % 2) * 180 + 8,
                y=(index // 2) * 180 + 8,
            )
        for i in range(24):
            zone = i // 4
            store_id = f'store:demo-A{i + 1:02}'
            store_repo.upsert_store(
                conn,
                id=store_id,
                market_id='market:demo',
                zone_id=f'zone:demo-{zone}',
                name_ko=f'점포 A-{i + 1:02}',
                store_category_id=f'store_category:{CATEGORIES[zone][0]}',
                map_x=(zone % 2) * 180 + 16 + (i % 2) * 80,
                map_y=(zone // 2) * 180 + 48 + ((i % 4) // 2) * 60,
                hours={'open': '09:00', 'close': '20:00'},
                source='manual',
                active=True,
            )
            item_ids = (
                ['item:green_onion', 'item:onion']
                if 4 <= i < 7
                else [f'item:{ITEMS[1 + i % 4][0]}']
            )
            store_repo.set_store_items(conn, store_id, item_ids, 'manual')
    return {'markets': 1, 'zones': 6, 'stores': 24}


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    with connection() as conn:
        counts = seed_demo_market(conn)
    print(f'시연 시장: 시장={counts["markets"]} 구역={counts["zones"]} 점포={counts["stores"]}')


if __name__ == '__main__':
    run(main)
