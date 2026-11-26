"""Validate and persist photos, then resolve generated labels to ontology items."""

import logging
import math
import re
from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.errors import AppError
from app.core.photo_meta import PhotoMetaError, read_gps, strip_metadata
from app.db.repositories import knowledge_repo, media_repo, store_repo
from app.knowledge.ontology import match_unit, match_variety, match_vision_labels
from app.llm.json_output import recognize_labels

MAX_IMAGE_BYTES = 8 * 1024 * 1024
# 촬영 위치를 줄이는 기준: 이 거리 안의 가장 가까운 시장 ID, 좌표는 소수 둘째 자리(약 1km)
PHOTO_MARKET_RADIUS_M = 1000
PHOTO_COORD_DIGITS = 2
logger = logging.getLogger(__name__)


def image_format(image: bytes) -> tuple[str, str]:
    if len(image) > MAX_IMAGE_BYTES:
        raise AppError('IMAGE_TOO_LARGE', '사진은 최대 8MB까지 지원합니다.', 413)
    if image.startswith(b'\xff\xd8\xff'):
        return 'jpg', 'image/jpeg'
    if image.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'png', 'image/png'
    if len(image) >= 12 and image[:4] == b'RIFF' and image[8:12] == b'WEBP':
        return 'webp', 'image/webp'
    raise AppError(
        'UNSUPPORTED_IMAGE', 'JPEG, PNG, WebP 사진만 지원합니다. HEIC는 지원하지 않습니다.', 415
    )


def clean_photo(image: bytes, ext: str) -> tuple[bytes, tuple[float, float] | None]:
    """촬영 위치를 꺼낸 뒤 메타데이터를 지운 사진을 돌려줘요. 원래 좌표는 이 함수 밖으로 저장하지 않아요."""
    gps = read_gps(image, ext)
    try:
        return strip_metadata(image, ext), gps
    except PhotoMetaError as exc:
        # 구조를 못 읽으면 위치가 남아 있을 수 있으므로 저장·전송하지 않음
        raise AppError(
            'UNREADABLE_IMAGE', '사진 파일을 읽을 수 없어요. 다시 찍어 주세요.', 415
        ) from exc


def coarse_location(conn, gps: tuple[float, float]) -> dict:
    """정확한 좌표 대신 가까운 시장 ID(1km 안)와 소수 둘째 자리 좌표만 남겨요."""
    from app.services.market_service import distance

    lat, lng = gps
    nearest, best = None, None
    for market in store_repo.list_markets(conn):
        if market.get('lat') is None or market.get('lng') is None:
            continue
        meters = (
            distance(lat, lng, SimpleNamespace(lat=market['lat'], lng=market['lng'])) * 6_371_000
        )
        if meters <= PHOTO_MARKET_RADIUS_M and (best is None or meters < best):
            nearest, best = market['id'], meters
    return {
        'market_id': nearest,
        'lat': round(lat, PHOTO_COORD_DIGITS),
        'lng': round(lng, PHOTO_COORD_DIGITS),
    }


def save_photo(conn, image: bytes, ext: str, mime: str, location: dict | None = None) -> str | None:
    path = settings.MEDIA_DIR / 'photos' / datetime.now().strftime('%Y%m%d') / f'{uuid4()}.{ext}'
    extra = (
        {
            'photo_market_id': location['market_id'],
            'photo_lat': location['lat'],
            'photo_lng': location['lng'],
        }
        if location
        else {}
    )
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(image)
        with conn.transaction():
            media_id = media_repo.insert_media(
                conn, kind='photo', path=str(path), mime=mime, bytes=len(image), **extra
            )
        return str(media_id)
    except Exception:
        logger.warning('사진 저장 실패; 인식을 계속합니다.', exc_info=True)
        return None


async def recognize(conn, image: bytes, use_location: bool = False) -> dict:
    ext, mime = image_format(image)
    # 저장·모델 전송 전에 메타데이터(위치·기기·시각)를 지움. 위치는 동의했을 때만 대략값으로 남김
    image, gps = clean_photo(image, ext)
    location = None
    if use_location and gps:
        try:
            location = await run_in_threadpool(coarse_location, conn, gps)
        except Exception:  # noqa: BLE001 - 위치는 부가 기능이라 실패해도 인식은 계속
            logger.warning('촬영 위치 처리 실패; 위치 없이 계속합니다.')
    gps = None  # 원래 좌표는 여기서 버림
    media_id = await run_in_threadpool(save_photo, conn, image, ext, mime, location)
    items = await run_in_threadpool(knowledge_repo.item_vocabulary, conn)
    vocabulary = sorted({item['name_en'] for item in items})

    def accept(value):
        labels = value['labels']
        if not labels:
            return 'no_labels'
        candidates = match_vision_labels(conn, labels)
        if labels[0].strip().lower().startswith('other:') or not candidates:
            return 'unknown_item'
        if candidates[0]['confidence'] < 0.6:
            return 'low_confidence'
        return None

    routed = await recognize_labels(image, vocabulary, accept)
    result = routed.value
    labels = result['labels']
    candidates = await run_in_threadpool(match_vision_labels, conn, labels)
    price_tag = result['price_tag']
    if price_tag is not None:
        text = ' '.join(
            [price_tag['unit_text'], price_tag.pop('variety_text', None) or '', *labels]
        )
        price_tag['variety_id'] = (
            await run_in_threadpool(match_variety, conn, candidates[0]['item_id'], text)
            if candidates
            else None
        )
        price_tag['unit'] = await run_in_threadpool(match_unit, conn, price_tag['unit_text'])
        if price_tag['quantity'] is None:
            number = re.search(r'\d+(?:\.\d+)?', price_tag['unit_text'])
            if number and math.isfinite(float(number[0])) and float(number[0]) > 0:
                price_tag['quantity'] = float(number[0])
    candidates = await run_in_threadpool(match_vision_labels, conn, labels)
    return {
        'model': routed.model,
        'vision_labels': labels,
        'candidates': candidates,
        'media_id': media_id,
        'price_tag': price_tag,
        'photo_location': location,
    }
