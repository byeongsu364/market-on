"""Validate and persist anonymous consumer price reports."""

from hashlib import sha256

from . import price_service

from app.core.config import settings
from app.core.errors import AppError
from app.db.repositories import knowledge_repo, media_repo, price_repo, store_repo


def hash_device(device_id):
    return sha256((str(device_id) + settings.DEVICE_HASH_SALT).encode()).hexdigest()


def submit(conn, data, device_id):
    device_hash = hash_device(device_id)
    with conn.transaction():
        if not knowledge_repo.get_item(conn, data.item_id):
            raise AppError('INVALID_ITEM', '품목을 확인하세요.', 422)
        if not store_repo.get_market(conn, data.market_id):
            raise AppError('INVALID_MARKET', '시장을 확인하세요.', 422)
        if data.store_id is not None:
            store = store_repo.get_store(conn, data.store_id)
            if not store or store['market_id'] != data.market_id:
                raise AppError('INVALID_STORE', '시장의 점포를 확인하세요.', 422)
        if data.unit is not None and not knowledge_repo.valid_unit(conn, data.unit):
            raise AppError('INVALID_UNIT', '단위를 확인하세요.', 422)
        if data.media_id is not None:
            media = media_repo.get_media(conn, data.media_id)
            if not media or media['kind'] != 'photo':
                raise AppError('INVALID_MEDIA', '사진을 확인하세요.', 422)
        price_repo.lock_device(conn, device_hash)
        if price_repo.hourly_report_count(conn, device_hash) >= 30:
            raise AppError('TOO_MANY_REPORTS', '한 시간에 30건까지 제보할 수 있습니다.', 429)
        held = False
        try:
            reference = price_service.get_price(
                conn,
                data.item_id,
                market_id=data.market_id,
                unit_id=data.unit,
                _include_varieties=False,
            )
        except AppError as exc:
            if exc.code != 'PRICE_NOT_FOUND':
                raise
        else:
            # Only compare matching denominations; a missing unit cannot identify the report unit.
            if data.unit and reference.unit == data.unit:
                amount = data.price / (data.quantity or 1)
                held = (
                    amount < reference.reference_price * 0.3
                    or amount > reference.reference_price * 3
                )
        values = data.model_dump(exclude={'unit'}) | {
            'unit_id': data.unit,
            'device_hash': device_hash,
            'status': 'held' if held else 'ok',
        }
        return price_repo.save_recent_report(conn, values) | {'held': held}
