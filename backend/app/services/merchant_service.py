"""All merchant operations derive store ownership from the session user."""

from datetime import datetime, time, timedelta
from app.core.errors import AppError
from app.db.repositories import store_repo, merchant_repo, sale_repo, view_repo, user_repo
from .auth_service import now
from .sale_service import SEOUL


def get_store(conn, user):
    store_id = user['store_id']
    store = store_repo.get_store(conn, store_id)
    if not store:
        raise AppError('STORE_NOT_FOUND', '점포를 찾을 수 없습니다.', 404)
    return store | {
        'items': merchant_repo.items(conn, store_id),
        'today_views': view_repo.today(conn, store_id, now().astimezone(SEOUL).date()),
    }


def patch_store(conn, user, data):
    store_id = user['store_id']
    with conn.transaction():
        user_repo.lock_store(conn, store_id)
        if data.item_ids is not None:
            if set(data.item_ids) != merchant_repo.valid_items(conn, data.item_ids):
                raise AppError('INVALID_ITEM', '품목을 확인하세요.', 422)
            store_repo.set_store_items(conn, store_id, data.item_ids, 'merchant')
        if data.hours is not None:
            merchant_repo.update_hours(conn, store_id, data.hours.model_dump())
    return get_store(conn, user)


def sales(conn, user, status):
    return sale_repo.list_store(conn, user['store_id'], status, now())


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
        if values.get('unit_id') and not merchant_repo.valid_unit(conn, values['unit_id']):
            raise AppError('INVALID_UNIT', '판매 단위를 확인하세요.', 422)
        return sale_repo.create(conn, user['store_id'], values | {'starts_at': instant})


def repost(conn, user, sale_id, ends_at):
    old = sale_repo.get(conn, sale_id, user['store_id'])
    if not old:
        raise AppError('SALE_NOT_FOUND', '세일을 찾을 수 없습니다.', 404)
    return create_sale(conn, user, old | {'ends_at': ends_at})


def end(conn, user, sale_id):
    sale = sale_repo.end(conn, sale_id, user['store_id'])
    if not sale:
        raise AppError('SALE_NOT_FOUND', '세일을 찾을 수 없습니다.', 404)
    return sale


def poster(conn, user, base_url):
    store = get_store(conn, user)
    market = store_repo.get_market(conn, store['market_id'])
    return {
        'store_name': store['name_ko'],
        'market_name': market['name_ko'],
        'url': f'{base_url.rstrip("/")}/s/{store["id"]}',
    }
