"""사진을 확인·저장하고, 구글 비전 라벨을 온톨로지 품목으로, 가격표 글자를 가격·단위·품종으로 바꿔요.

작업 지시서 040: 품목 인식은 구글 비전만 써요. 젬마·제미나이·GPT에는 사진을 보내지 않아요.
"""

import logging
from datetime import datetime
from time import monotonic
from types import SimpleNamespace
from uuid import uuid4

from starlette.concurrency import run_in_threadpool

from app.clients import vision
from app.core.config import settings
from app.core.errors import AppError
from app.core.photo_meta import PhotoMetaError, read_gps, strip_metadata
from app.db.repositories import llm_call_repo, media_repo, store_repo
from app.knowledge.ontology import match_vision_labels

from . import price_tag as price_tag_reader
from . import vision_usage

MAX_IMAGE_BYTES = 8 * 1024 * 1024
# 촬영 위치를 줄이는 기준: 이 거리 안의 가장 가까운 시장 ID, 좌표는 소수 둘째 자리(약 1km)
PHOTO_MARKET_RADIUS_M = 1000
PHOTO_COORD_DIGITS = 2
VISION_MODEL = 'google-vision'
# 매칭에 쓰는 비전 라벨 수 (점수 높은 순). match_vision_labels가 앞 3개에 가중치를 줘요
VISION_LABELS_USED = 3
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


def call_vision(image: bytes) -> dict | None:
    """비전 호출 + 한도 + 기록. 키가 없거나, 한도에 걸리거나, 실패하면 None (화면은 직접 고르기로)."""
    if not vision.configured():
        return None
    limited = vision_usage.take()
    record = {
        'task': 'recognize',
        'role': 'vision',
        'provider': 'vision',
        'model': VISION_MODEL,
        'escalated': False,
    }
    if limited:
        llm_call_repo.record(**record, ms=0, reason=limited, ok=False)
        return None
    start = monotonic()
    try:
        result = vision.annotate(image)
    except Exception:  # noqa: BLE001 - 인식 실패는 '모르는 품목'으로 처리
        llm_call_repo.record(
            **record, ms=int((monotonic() - start) * 1000), reason='error', ok=False
        )
        logger.warning('구글 비전 호출 실패; 직접 고르기로 넘어갑니다.')
        return None
    llm_call_repo.record(**record, ms=int((monotonic() - start) * 1000), reason=None, ok=True)
    return result


def labels_from(result: dict | None) -> list[str]:
    if not result:
        return []
    ranked = sorted(result['labels'], key=lambda pair: -pair[1])
    return [label.lower() for label, _ in ranked]


async def recognize(conn, image: bytes, use_location: bool = False) -> dict:
    ext, mime = image_format(image)
    # 저장·비전 전송 전에 메타데이터(위치·기기·시각)를 지움. 위치는 동의했을 때만 대략값으로 남김
    image, gps = clean_photo(image, ext)
    location = None
    if use_location and gps:
        try:
            location = await run_in_threadpool(coarse_location, conn, gps)
        except Exception:  # noqa: BLE001 - 위치는 부가 기능이라 실패해도 인식은 계속
            logger.warning('촬영 위치 처리 실패; 위치 없이 계속합니다.')
    gps = None  # 원래 좌표는 여기서 버림
    media_id = await run_in_threadpool(save_photo, conn, image, ext, mime, location)
    result = await run_in_threadpool(call_vision, image)
    labels = labels_from(result)
    # 비전은 "Food", "Fruit"처럼 넓은 라벨을 먼저 줄 때가 많아요. 사전에 있는 라벨을 앞으로 당겨서 매칭
    candidates = await run_in_threadpool(match_vision_labels, conn, labels[:VISION_LABELS_USED])
    if not candidates and labels:
        known = await run_in_threadpool(_known_labels, conn, labels)
        candidates = await run_in_threadpool(match_vision_labels, conn, known[:VISION_LABELS_USED])
    tag = None
    if result and result['text'].strip():
        item_id = candidates[0]['item_id'] if candidates else None
        tag = await run_in_threadpool(price_tag_reader.parse, conn, result['text'], item_id)
    return {
        'model': VISION_MODEL,
        'vision_labels': labels[:VISION_LABELS_USED],
        'candidates': candidates,
        'media_id': media_id,
        'price_tag': tag,
        'photo_location': location,
    }


def _known_labels(conn, labels: list[str]) -> list[str]:
    """온톨로지 비전 라벨 사전에 있는 라벨만 (비전 점수 순서 유지)."""
    from app.db.repositories import knowledge_repo

    dictionary = {row['label'].strip().lower() for row in knowledge_repo.vision_item_labels(conn)}
    return [label for label in labels if label in dictionary]
