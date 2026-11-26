"""Public market distance ordering and floorplan assembly."""

import logging
from datetime import UTC, datetime
from math import asin, cos, radians, sin, sqrt

from app.core.errors import AppError
from app.db.repositories import sale_repo, store_repo
from app.schemas.market import ActiveSale, Market, MarketMap, Store, Zone

logger = logging.getLogger(__name__)
ZONE_ORDER = ('청과', '채소', '수산', '정육', '반찬', '떡·분식')


def distance(lat, lng, market):
    a, b = radians(lat), radians(market.lat)
    h = sin((b - a) / 2) ** 2 + cos(a) * cos(b) * sin(radians(market.lng - lng) / 2) ** 2
    return 2 * asin(sqrt(min(1, max(0, h))))


def nearby(conn, lat=None, lng=None, device_id=None):
    markets = [
        Market(
            market_id=m['id'],
            name=m['name_ko'],
            lat=m['lat'],
            lng=m['lng'],
            status=m.get('status', 'active'),
        )
        for m in store_repo.list_markets(conn)
        if m['lat'] is not None and m['lng'] is not None
    ]
    for market in markets:
        if lat is not None and lng is not None:
            market.distance_m = round(distance(lat, lng, market) * 6_371_000)
    if device_id:
        from .price_report_service import hash_device
        from app.db.repositories import market_request_repo

        try:
            with conn.transaction():
                for value in markets:
                    if (
                        value.status == 'listed'
                        and value.distance_m is not None
                        and value.distance_m <= 1000
                    ):
                        market_request_repo.record(
                            conn, value.market_id, hash_device(device_id), 'nearby'
                        )
        except Exception:
            logger.warning('Nearby demand recording failed')
    return sorted(
        markets,
        key=lambda m: (
            (distance(lat, lng, m), m.name, m.market_id)
            if lat is not None and lng is not None
            else (m.name, m.market_id)
        ),
    )


def market_map(conn, market_id, item_id=None, unit=None):
    from .store_price_service import store_price

    if store_repo.get_market(conn, market_id) is None:
        raise AppError('MARKET_NOT_FOUND', '시장을 찾을 수 없습니다.', 404)
    zones = sorted(
        store_repo.list_zones(conn, market_id),
        key=lambda z: (
            ZONE_ORDER.index(z['name_ko']) if z['name_ko'] in ZONE_ORDER else len(ZONE_ORDER),
            z['id'],
        ),
    )
    assortment = {}
    for row in store_repo.market_items(conn, market_id):
        assortment.setdefault(row['store_id'], []).append(row['item_id'])
    sales = {
        s['store_id']: s
        for s in sale_repo.latest_active_by_store(conn, market_id, datetime.now(UTC))
    }
    stores, omitted = [], 0
    for row in store_repo.list_stores(conn, market_id):
        if not row['active']:
            continue
        if row['map_x'] is None or row['map_y'] is None:
            omitted += 1
            continue
        hours = row['hours'] or {}
        sells = assortment.get(row['id'], [])
        sale = sales.get(row['id'])
        stores.append(
            Store(
                store_id=row['id'],
                name=row['name_ko'],
                zone_id=row['zone_id'] or '',
                sells=sells,
                map_x=row['map_x'],
                map_y=row['map_y'],
                hours=f'{hours["open"]}–{hours["close"]}'
                if hours.get('open') and hours.get('close')
                else '',
                highlight=item_id is not None and item_id in sells,
                active_sale=ActiveSale(**sale) if sale else None,
                price=store_price(conn, row, item_id, unit)[1]
                if item_id and item_id in sells
                else None,
            )
        )
    logger.info('Market %s: omitted %d stores without map coordinates', market_id, omitted)
    if item_id:
        stores.sort(key=lambda s: 2 if s.price is None else int(s.price.stale))
    return MarketMap(
        market_id=market_id,
        zones=[Zone(id=z['id'], name=z['name_ko'], x=z['x'], y=z['y']) for z in zones],
        stores=stores,
    )


def search(conn, q):
    from app.db.repositories import market_request_repo

    return [
        Market(market_id=m['id'], name=m['name_ko'], status=m['status'], lat=m['lat'], lng=m['lng'])
        for m in market_request_repo.search(conn, q.strip())
        if m['lat'] is not None and m['lng'] is not None
    ]


def selling_stores(conn, market_id, item_id):
    if store_repo.get_market(conn, market_id) is None:
        raise AppError('MARKET_NOT_FOUND', '시장을 찾을 수 없습니다.', 404)
    ids = {
        r['store_id'] for r in store_repo.market_items(conn, market_id) if r['item_id'] == item_id
    }
    return [
        {'store_id': s['id'], 'name': s['name_ko']}
        for s in store_repo.list_stores(conn, market_id)
        if s['active'] and s['id'] in ids
    ]
