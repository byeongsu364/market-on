"""All merchant operations derive store ownership from the session user."""

from datetime import datetime, time, timedelta
from app.core.errors import AppError
from app.db.repositories import store_repo, merchant_repo, sale_repo, view_repo, user_repo
from .auth_service import now
from .sale_service import SEOUL, closing_sale


def get_store(conn, user):
    store_id = user['store_id']
    store = store_repo.get_store(conn, store_id)
    if not store:
        raise AppError('STORE_NOT_FOUND', '점포를 찾을 수 없습니다.', 404)
    return {
        'store_id': store['id'],
        'varieties': merchant_repo.varieties(conn, store_id),
        'name': store['name_ko'],
        'payments': store.get('payments', []),
        'intro': store.get('intro'),
        'location': {'lat': store['lat'], 'lng': store['lng']}
        if store.get('lat') is not None and store.get('lng') is not None
        else None,
        'location_confirmed': store.get('location_verified', False),
        'market_id': store['market_id'],
        'hours': {'open': '', 'close': ''} | (store['hours'] or {}),
        'item_ids': [i['item_id'] for i in merchant_repo.items(conn, store_id)],
        'today_views': view_repo.today(conn, store_id, now().astimezone(SEOUL).date()),
        'sale_views': sum(
            s.get('views', 0) for s in sale_repo.list_store(conn, store_id, 'active', now())
        ),
    }


def patch_store(conn, user, data):
    store_id = user['store_id']
    if data.intro is not None:
        from .moderation import check

        check(data.intro)
    with conn.transaction():
        user_repo.lock_store(conn, store_id)
        current = merchant_repo.varieties(conn, store_id)
        sold = (
            data.item_ids
            if data.item_ids is not None
            else [i['item_id'] for i in merchant_repo.items(conn, store_id)]
        )
        selections = (
            data.varieties
            if data.varieties is not None
            else {k: v for k, v in current.items() if k in sold}
        )
        from app.db.repositories import price_repo

        for item, ids in selections.items():
            if item not in sold or not set(ids) <= {
                v['id'] for v in price_repo.varieties(conn, item)
            }:
                raise AppError('INVALID_VARIETY', '판매 품목의 품종을 선택하세요.', 422)
        if data.item_ids is not None:
            if set(data.item_ids) != merchant_repo.valid_items(conn, data.item_ids):
                raise AppError('INVALID_ITEM', '품목을 확인하세요.', 422)
            store_repo.set_store_items(conn, store_id, data.item_ids, 'merchant')
        merchant_repo.set_varieties(conn, store_id, selections)
        if data.payments is not None:
            conn.execute('update stores set payments=%s where id=%s', (data.payments, store_id))
        if 'intro' in data.model_fields_set:
            conn.execute('update stores set intro=%s where id=%s', (data.intro, store_id))
        if data.hours is not None:
            merchant_repo.update_hours(conn, store_id, data.hours.model_dump())
    return get_store(conn, user)


def sales(conn, user, status):
    return [closing_sale(s) for s in sale_repo.list_store(conn, user['store_id'], status, now())]


def create_sale(conn, user, values):
    instant = now()
    midnight = datetime.combine(instant.astimezone(SEOUL).date() + timedelta(days=1), time(), SEOUL)
    ends_at = values['ends_at']
    if ends_at.tzinfo is None or not instant < ends_at <= midnight:
        raise AppError('INVALID_ENDS_AT', '종료 시각은 지금 이후부터 오늘 자정까지입니다.', 422)
    if values.get('regular_price') is not None and values['regular_price'] <= values['sale_price']:
        raise AppError('INVALID_PRICE', '정가는 할인가보다 커야 합니다.', 422)
    with conn.transaction():
        user_repo.lock_store(conn, user['store_id'])
        if values['item_id'] not in {
            i['item_id'] for i in merchant_repo.items(conn, user['store_id'])
        }:
            raise AppError('ITEM_NOT_SOLD', '내 점포의 취급 품목을 선택하세요.', 422)
        from app.db.repositories import price_repo

        if values.get('variety_id') and values['variety_id'] not in {
            v['id'] for v in price_repo.varieties(conn, values['item_id'])
        }:
            raise AppError('INVALID_VARIETY', '이 품목의 품종이 아닙니다.', 422)
        if values.get('unit_id') and not merchant_repo.valid_unit(conn, values['unit_id']):
            raise AppError('INVALID_UNIT', '판매 단위를 확인하세요.', 422)
        return closing_sale(
            sale_repo.create(conn, user['store_id'], values | {'starts_at': instant})
        )


def repost(conn, user, sale_id, ends_at):
    old = sale_repo.get(conn, sale_id, user['store_id'])
    if not old:
        raise AppError('SALE_NOT_FOUND', '세일을 찾을 수 없습니다.', 404)
    return create_sale(conn, user, old | {'ends_at': ends_at})


def end(conn, user, sale_id):
    sale = sale_repo.end(conn, sale_id, user['store_id'])
    if not sale:
        raise AppError('SALE_NOT_FOUND', '세일을 찾을 수 없습니다.', 404)
    return closing_sale(sale)


def poster(conn, user, base_url):
    store = get_store(conn, user)
    market = store_repo.get_market(conn, store['market_id'])
    return {
        'store_name': store['name'],
        'market_name': market['name_ko'],
        'url': f'{base_url.rstrip("/")}/s/{store["store_id"]}',
    }


def prices(conn, user):
    from .store_price_service import store_price
    from .item_service import get_item
    from app.db.repositories import price_repo

    store = store_repo.get_store(conn, user['store_id'])
    result = []
    for row in merchant_repo.items(conn, user['store_id']):
        item = get_item(conn, row['item_id'])
        customers, _ = store_price(conn, store, item.item_id)
        confirmations = price_repo.store_confirmations(conn, user['store_id'], item.item_id)
        confirmation = confirmations[0] if confirmations else None
        if confirmation:
            from .price_service import unit_multiplier

            units = price_repo.sale_units(conn, item.item_id)
            by_id = {u['id']: u for u in units}
            factor = unit_multiplier(
                by_id.get(confirmation['unit_id'], {'id': confirmation['unit_id']}),
                by_id.get(item.default_unit, {'id': item.default_unit}),
            )
            confirmation = (
                dict(
                    price=int(confirmation['price'] * factor + 0.5),
                    confirmed_at=confirmation['confirmed_at'],
                )
                if factor is not None
                else None
            )
        result.append(
            dict(
                item_id=item.item_id,
                name=item.name,
                unit=item.default_unit,
                customers=customers,
                my_confirmation=confirmation,
            )
        )
    return result


def confirm_price(conn, user, data):
    from .item_service import get_item
    from app.db.repositories import price_repo

    with conn.transaction():
        user_repo.lock_store(conn, user['store_id'])
        if data.item_id not in {i['item_id'] for i in merchant_repo.items(conn, user['store_id'])}:
            raise AppError('ITEM_NOT_SOLD', '내 점포의 취급 품목을 선택하세요.', 422)
        item = get_item(conn, data.item_id)
        unit = data.unit or item.default_unit
        if unit not in item.units:
            raise AppError('INVALID_UNIT', '판매 단위를 확인하세요.', 422)
        return price_repo.confirm_store_price(
            conn, user['store_id'], data.item_id, unit, data.price, user['id']
        )


def save_location(conn, user, data):
    from .market_service import distance
    from types import SimpleNamespace

    with conn.transaction():
        user_repo.lock_store(conn, user['store_id'])
        store = store_repo.get_store(conn, user['store_id'])
        market = store_repo.get_market(conn, store['market_id'])
        if (
            market['lat'] is None
            or market['lng'] is None
            or distance(data.lat, data.lng, SimpleNamespace(**market)) * 6_371_000 > 2000
        ):
            raise AppError('INVALID_LOCATION', '시장 중심에서 2km 이내의 위치를 선택하세요.', 422)
        conn.execute(
            "update stores set lat=%s,lng=%s,location_verified=true,location_source='merchant' where id=%s",
            (data.lat, data.lng, user['store_id']),
        )
    return get_store(conn, user)
