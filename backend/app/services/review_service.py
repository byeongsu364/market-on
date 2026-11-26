"""Public review listing and customer-only mutations."""

from zoneinfo import ZoneInfo
from app.core.errors import AppError
from app.db.repositories import review_repo, store_repo
from . import moderation
from .auth_service import now


def require_store(conn, store_id):
    store = store_repo.get_store(conn, store_id)
    if not store or not store['active']:
        raise AppError('STORE_NOT_FOUND', '점포를 찾을 수 없습니다.', 404)


def listing(conn, store_id, user, limit=20, offset=0):
    require_store(conn, store_id)
    return review_repo.listing(conn, store_id, user['id'] if user else None, limit, offset)


def save(conn, store_id, user, data):
    with conn.transaction():
        require_store(conn, store_id)
        moderation.check(data.body)
        if not review_repo.consume(
            conn, user['id'], now().astimezone(ZoneInfo('Asia/Seoul')).date()
        ):
            raise AppError('REVIEW_RATE_LIMIT', '리뷰는 하루 10회까지 작성·수정할 수 있어요.', 429)
        review_repo.upsert(conn, store_id, user['id'], data.rating, data.body)
    return listing(conn, store_id, user)


def delete(conn, store_id, user):
    require_store(conn, store_id)
    review_repo.delete(conn, store_id, user['id'])
