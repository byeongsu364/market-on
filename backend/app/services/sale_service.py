"""Public store pages, active sales and anonymous view counters."""

from zoneinfo import ZoneInfo
from app.core.errors import AppError
from app.db.repositories import store_repo, merchant_repo, sale_repo, view_repo
from .auth_service import now

SEOUL = ZoneInfo('Asia/Seoul')


def active(conn, market_id=None, item_id=None):
    return sale_repo.active(conn, now(), market_id, item_id)


def store_page(conn, store_id):
    store = store_repo.get_store(conn, store_id)
    if not store or not store['active']:
        raise AppError('STORE_NOT_FOUND', '점포를 찾을 수 없습니다.', 404)
    view_repo.increment(conn, store_id, now().astimezone(SEOUL).date())
    return store | {
        'items': merchant_repo.items(conn, store_id),
        'sales': sale_repo.active(conn, now(), store_id=store_id),
    }


def record_view(conn, sale_id):
    sale = sale_repo.public_get(conn, sale_id)
    if not sale:
        raise AppError('SALE_NOT_FOUND', '세일을 찾을 수 없습니다.', 404)
    view_repo.increment(conn, sale['store_id'], now().astimezone(SEOUL).date(), sale_id)
