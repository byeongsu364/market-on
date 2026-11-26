"""Public store pages, active sales and anonymous view counters."""

from zoneinfo import ZoneInfo
from app.core.errors import AppError
from app.db.repositories import store_repo, merchant_repo, sale_repo, view_repo
from .auth_service import now
from . import item_service

SEOUL = ZoneInfo('Asia/Seoul')


def active(conn, market_id=None, item_id=None):
    return [public_sale(s) for s in sale_repo.active(conn, now(), market_id, item_id)]


def store_page(conn, store_id):
    store = store_repo.get_store(conn, store_id)
    if not store or not store['active']:
        raise AppError('STORE_NOT_FOUND', '점포를 찾을 수 없습니다.', 404)
    view_repo.increment(conn, store_id, now().astimezone(SEOUL).date())
    from .merchant_service import get_store

    assortment = merchant_repo.items(conn, store_id)
    guessed = [i['item_id'] for i in assortment if i.get('source') == 'sbiz_guess']
    return {
        'source': store.get('source', 'manual'),
        'guessed_item_ids': guessed,
        'items_basis': ('mixed' if len(guessed) < len(assortment) else 'sbiz_guess')
        if guessed
        else 'merchant',
        'store': get_store(conn, {'store_id': store_id}),
        'items': [
            item_service.get_item(conn, i['item_id']) for i in merchant_repo.items(conn, store_id)
        ],
        'sales': [public_sale(s) for s in sale_repo.active(conn, now(), store_id=store_id)],
    }


def record_view(conn, sale_id):
    sale = sale_repo.public_get(conn, sale_id)
    if not sale:
        raise AppError('SALE_NOT_FOUND', '세일을 찾을 수 없습니다.', 404)
    view_repo.increment(conn, sale['store_id'], now().astimezone(SEOUL).date(), sale_id)


def closing_sale(s):
    result = {k: s[k] for k in ('id', 'store_id', 'item_id', 'sale_price', 'starts_at', 'ends_at')}
    result['status'] = 'ended' if s['ends_at'] < now() else s['status']
    result['view_count'] = s.get('views', 0)
    for key in ('regular_price', 'unit_id'):
        if s.get(key) is not None:
            result[key] = s[key]
    return result


def public_sale(s):
    return closing_sale(s) | {'store_name': s['store_name'], 'item_name': s['item_name']}
