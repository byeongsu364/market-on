"""Validate and persist photos, then resolve generated labels to ontology items."""

import logging
from datetime import datetime
from uuid import uuid4

from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.errors import AppError
from app.db.repositories import knowledge_repo, media_repo
from app.knowledge.ontology import match_vision_labels
from app.llm.json_output import recognize_labels

MAX_IMAGE_BYTES = 8 * 1024 * 1024
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


def save_photo(conn, image: bytes, ext: str, mime: str) -> None:
    path = settings.MEDIA_DIR / 'photos' / datetime.now().strftime('%Y%m%d') / f'{uuid4()}.{ext}'
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(image)
        with conn.transaction():
            media_repo.insert_media(conn, kind='photo', path=str(path), mime=mime, bytes=len(image))
    except Exception:
        logger.warning('사진 저장 실패; 인식을 계속합니다.', exc_info=True)


async def recognize(conn, image: bytes) -> dict:
    ext, mime = image_format(image)
    await run_in_threadpool(save_photo, conn, image, ext, mime)
    items = await run_in_threadpool(knowledge_repo.item_vocabulary, conn)
    vocabulary = sorted({item['name_en'] for item in items})
    labels = await recognize_labels(image, vocabulary)
    candidates = await run_in_threadpool(match_vision_labels, conn, labels)
    return {'vision_labels': labels, 'candidates': candidates}
