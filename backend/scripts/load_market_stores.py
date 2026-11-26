"""상가정보 전체 응답으로 업종별 예시 지도를 적재한다 (실측 위치 아님)."""

import argparse
from collections import Counter
import math
from statistics import mode
import yaml

from app.core import http
from app.core.config import settings
from app.core.errors import AppError
from app.db.pool import connection
from app.db.repositories import store_repo
from ._common import DATA, run

URL = 'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius'


def fetch_rows(config):
    if not settings.DATA_GO_KR_KEY:
        raise AppError('SBIZ_NOT_CONFIGURED', 'DATA_GO_KR_KEY가 필요합니다.', 503)
    result = []
    page = 1
    try:
        while True:
            payload = http.get_sync(
                URL,
                params=dict(
                    serviceKey=settings.DATA_GO_KR_KEY,
                    radius=config['radius_m'],
                    cx=config['center']['lng'],
                    cy=config['center']['lat'],
                    type='json',
                    numOfRows=1000,
                    pageNo=page,
                ),
            ).json()
            header = payload['header']
            if str(header.get('resultCode', header.get('resultCd'))) not in ('0', '00'):
                raise ValueError()
            body = payload['body']
            items = body.get('items') or []
            if isinstance(items, dict):
                items = items.get('item') or []
            if isinstance(items, dict):
                items = [items]
            result.extend(items)
            if len(result) >= int(body['totalCount']):
                return result
            if not items:
                raise ValueError()
            page += 1
    except Exception:
        raise AppError(
            'SBIZ_API_ERROR', '상가정보 응답을 확인하세요. 저장하지 않았습니다.', 502
        ) from None


def prepare(config, rows, ontology_dir=DATA / 'ontology'):
    entities = [
        e
        for p in sorted(ontology_dir.glob('*.yaml'))
        for e in yaml.safe_load(p.read_text())['entities']
    ]
    names = {e['id']: e['name_ko'] for e in entities}

    def normalize(value):
        return ''.join(str(value or '').split())

    buildings = {normalize(b) for b in config.get('buildings', [])}
    # 같은 시장 건물이 "본관"·"신관"·빈칸 등으로 제각각 적혀 있어서 도로명 주소로도 고름
    addresses = [normalize(a) for a in config.get('road_addresses', [])]

    def in_market(row):
        road = normalize(row.get('rdnmAdr'))
        return normalize(row.get('bldNm')) in buildings or any(road.endswith(a) for a in addresses)

    selected = {}
    for row in rows:
        if not in_market(row) or row.get('indsSclsNm') not in config['industries']:
            continue
        if not row.get('bizesId') or not row.get('bizesNm'):
            raise ValueError('점포 ID 또는 상호명이 없습니다. 저장하지 않았습니다.')
        sid = str(row['bizesId'])
        if sid in selected and selected[sid] != row:
            raise ValueError('중복 점포 ID의 응답이 다릅니다.')
        selected[sid] = row
    selected = list(selected.values())
    coordinates = []
    for row in selected:
        lat, lng = float(row['lat']), float(row['lon'])
        if not all(map(math.isfinite, (lat, lng))) or not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError('유효하지 않은 좌표입니다.')
        coordinates.append((lat, lng))
    zones, stores, guesses = [], [], {}
    categories = sorted({config['industries'][r['indsSclsNm']] for r in selected})
    for index, category in enumerate(categories):
        members = sorted(
            (r for r in selected if config['industries'][r['indsSclsNm']] == category),
            key=lambda r: (
                r.get('bldNm') or '',
                str(r.get('flrNo') or ''),
                r['bizesNm'],
                str(r['bizesId']),
            ),
        )
        x, y = 8 + index % 2 * 180, 8 + index // 2 * 180
        zone = f'zone:gd-{category.split(":")[1]}'
        zones.append(
            dict(
                id=zone,
                market_id=config['market']['id'],
                store_category_id=category,
                name_ko=names[category],
                x=x,
                y=y,
            )
        )
        item_ids = sorted(
            e['id']
            for e in entities
            if e['type'] == 'item'
            and any(
                r.get('p') == 'isA' and r.get('o') in config['category_items'].get(category, [])
                for r in e.get('relations', [])
            )
        )
        # Variable zone height keeps 72×54 store cells disjoint, even for large categories.
        for i, row in enumerate(members):
            sid = f'store:gd-{row["bizesId"]}'
            stores.append(
                dict(
                    id=sid,
                    market_id=config['market']['id'],
                    zone_id=zone,
                    name_ko=row['bizesNm'],
                    sbiz_id=str(row['bizesId']),
                    sbiz_industry=row['indsSclsNm'],
                    floor=str(row.get('flrNo') or ''),
                    store_category_id=category,
                    map_x=x + 8 + i % 2 * 80,
                    map_y=y + 40 + i // 2 * 60,
                    source='sbiz',
                    active=True,
                )
            )
            guesses[sid] = item_ids
    # Rows of zones grow to fit their largest category.
    bottom = 8
    for offset in range(0, len(zones), 2):
        pair = zones[offset : offset + 2]
        for zone in pair:
            shift = bottom - zone['y']
            zone['y'] = bottom
            for store in stores:
                if store['zone_id'] == zone['id']:
                    store['map_y'] += shift
        bottom += max(
            180,
            max(
                40 + math.ceil(sum(s['zone_id'] == z['id'] for s in stores) / 2) * 60 for z in pair
            ),
        )
    market = {k: v for k, v in config['market'].items() if k != 'region'}
    market.update(
        region_id=config['market']['region'],
        source='manual',
    )
    if coordinates:
        lat, lng = mode(sorted(coordinates))
        market.update(lat=lat, lng=lng)
    report = dict(
        industries=dict(sorted(Counter(r['indsSclsNm'] for r in selected).items())),
        buildings=dict(sorted(Counter(r.get('bldNm') or '' for r in selected).items())),
        received_industries=dict(sorted(Counter(r.get('indsSclsNm') or '' for r in rows).items())),
        guessed_items=sum(map(len, guesses.values())),
        stores=len(stores),
    )
    return market, zones, stores, guesses, report


def load_market_stores(conn, config, rows, *, dry_run=False):
    market, zones, stores, guesses, report = prepare(config, rows)
    if not dry_run:
        with conn.transaction():
            store_repo.upsert_market(conn, **market)
            for zone in zones:
                store_repo.upsert_zone(conn, **zone)
            for store in stores:
                store_repo.upsert_store(conn, **store)
                store_repo.replace_guessed_items(conn, store['id'], guesses[store['id']])
            store_repo.deactivate_missing_sbiz(conn, market['id'], [s['id'] for s in stores])
    print(yaml.safe_dump(report, allow_unicode=True, sort_keys=True))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--market', required=True)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    with open(args.market) as file:
        config = yaml.safe_load(file)
    rows = fetch_rows(config)
    if args.dry_run:
        load_market_stores(None, config, rows, dry_run=True)
    else:
        with connection() as conn:
            load_market_stores(conn, config, rows)


if __name__ == '__main__':
    run(main)
