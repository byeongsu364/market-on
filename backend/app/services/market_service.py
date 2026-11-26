"""Public market distance ordering and floorplan assembly."""

import logging
from datetime import UTC, datetime, time
from math import asin, cos, radians, sin, sqrt
from zoneinfo import ZoneInfo
from types import SimpleNamespace

from app.core.errors import AppError
from app.db.repositories import merchant_repo, sale_repo, store_repo
from app.schemas.market import ActiveSale, Market, MarketMap, Store, StorePrice, Zone

from .price_service import get_price

logger = logging.getLogger(__name__)
ZONE_ORDER = ('청과', '채소', '수산', '정육', '반찬', '떡·분식')


def distance(lat, lng, market):
    a, b = radians(lat), radians(market.lat)
    h = sin((b - a) / 2) ** 2 + cos(a) * cos(b) * sin(radians(market.lng - lng) / 2) ** 2
    return 2 * asin(sqrt(min(1, max(0, h))))


NEAREST_FALLBACK = 5


def nearby(conn, lat=None, lng=None, device_id=None, radius_km=5):
    markets = [
        Market(
            market_id=m['id'],
            name=m['name_ko'],
            lat=m['lat'],
            lng=m['lng'],
            status=m.get('status', 'active'),
            address=m.get('address'),
            amenities=m.get('amenities'),
            **store_repo.market_extras(conn, m['id']),
        )
        for m in store_repo.list_markets(conn)
        if m['lat'] is not None and m['lng'] is not None
    ]
    for market in markets:
        if lat is not None and lng is not None:
            market.distance_m = round(distance(lat, lng, market) * 6_371_000)
    within = [m for m in markets if m.distance_m is None or m.distance_m <= radius_km * 1000]
    # 반경 안에 시장이 하나도 없으면(예: 시장에서 30km 떨어진 곳) 빈 목록 대신 가까운 순 5곳
    # — 그래야 시장 목록·주변 시장 지도에서 시장을 고를 수 있음
    if not within and lat is not None and lng is not None:
        within = sorted(markets, key=lambda m: m.distance_m)[:NEAREST_FALLBACK]
    markets = within
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


def market_map(conn, market_id, item_id=None, unit=None, lat=None, lng=None):
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
    guessed = {}
    item_rows = store_repo.market_items(conn, market_id)
    for row in item_rows:
        if row.get('source') == 'sbiz_guess':
            guessed.setdefault(row['store_id'], []).append(row['item_id'])
    for row in item_rows:
        assortment.setdefault(row['store_id'], []).append(row['item_id'])
    sales = {
        s['store_id']: s
        for s in sale_repo.latest_active_by_store(conn, market_id, datetime.now(UTC))
    }
    market_avg = None
    if item_id:
        try:
            reference = get_price(
                conn, item_id, market_id=market_id, unit_id=unit, _include_varieties=False
            )
        except AppError as exc:
            if exc.code != 'PRICE_NOT_FOUND':
                raise
        else:
            if reference.this_market is not None:
                seoul = ZoneInfo('Asia/Seoul')
                market_avg = StorePrice(
                    price=reference.this_market.price,
                    unit=reference.unit,
                    source='market_avg',
                    reporters=0,
                    latest_at=datetime.combine(reference.observed_on, time.min, tzinfo=seoul),
                    observed_on=reference.observed_on,
                    stale=reference.observed_on < datetime.now(seoul).date(),
                    merchant_confirmed=False,
                )
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
                # 상가정보 좌표는 건물 단위(경동 108곳 중 101곳이 같은 점)라 지도 핀으로는
                # 상인이 확인한 위치만 내보내요. 거리는 건물 좌표로도 계산해요.
                lat=row.get('lat') if row.get('location_verified') else None,
                lng=row.get('lng') if row.get('location_verified') else None,
                category=row.get('store_category_id'),
                naver_name=row['name_ko'],
                verified=row.get('location_verified', False),
                open_now=open_now(hours),
                varieties=[
                    v for ids in merchant_repo.varieties(conn, row['id']).values() for v in ids
                ],
                payments=row.get('payments', []),
                intro=row.get('intro'),
                distance_m=round(distance(lat, lng, SimpleNamespace(**row)) * 6_371_000)
                if lat is not None
                and lng is not None
                and row.get('lat') is not None
                and row.get('lng') is not None
                else None,
                source=row.get('source', 'manual'),
                guessed_item_ids=guessed.get(row['id'], []),
                items_basis=(
                    'mixed' if len(guessed.get(row['id'], [])) < len(sells) else 'sbiz_guess'
                )
                if guessed.get(row['id'])
                else 'merchant',
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
                price=store_price(conn, row, item_id, unit)[1] or market_avg
                if item_id and item_id in sells
                else None,
            )
        )
    logger.info('Market %s: omitted %d stores without map coordinates', market_id, omitted)
    if item_id:
        stores.sort(
            key=lambda s: (
                3
                if s.price is None
                else 2
                if s.price.source == 'market_avg'
                else int(s.price.stale)
            )
        )
    return MarketMap(
        market_id=market_id,
        layout='schematic',
        source_note='소상공인 상가정보 2026-09 기준'
        if any(s.source == 'sbiz' for s in stores) or market_id == 'market:gyeongdong'
        else '시연용 예시 배치',
        zones=[Zone(id=z['id'], name=z['name_ko'], x=z['x'], y=z['y']) for z in zones],
        stores=stores,
    )


def search(conn, q):
    from app.db.repositories import market_request_repo

    return [
        market_detail(conn, m['id'])
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


def market_items(conn, market_id):
    if store_repo.get_market(conn, market_id) is None:
        raise AppError('MARKET_NOT_FOUND', '시장을 찾을 수 없습니다.', 404)
    return store_repo.market_item_counts(conn, market_id)


def open_now(hours, instant=None):
    if not hours or not hours.get('open') or not hours.get('close'):
        return None
    try:
        opening, closing = time.fromisoformat(hours['open']), time.fromisoformat(hours['close'])
    except (ValueError, TypeError):
        return None
    current = (
        (instant or datetime.now(ZoneInfo('Asia/Seoul'))).astimezone(ZoneInfo('Asia/Seoul')).time()
    )
    return opening <= current < closing


def market_detail(conn, market_id):
    m = store_repo.get_market(conn, market_id)
    if m is None:
        raise AppError('MARKET_NOT_FOUND', '시장을 찾을 수 없습니다.', 404)
    return Market(
        market_id=m['id'],
        name=m['name_ko'],
        status=m.get('status', 'active'),
        lat=m['lat'],
        lng=m['lng'],
        address=m.get('address'),
        amenities=m.get('amenities'),
        **store_repo.market_extras(conn, market_id),
    )
