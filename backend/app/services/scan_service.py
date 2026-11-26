"""사진을 확인·저장하고, 구글 비전 라벨을 온톨로지 품목으로, 가격표 글자를 가격·단위·품종으로 바꿔요.

작업 지시서 040: 품목 인식은 구글 비전만 써요. 젬마·제미나이·GPT에는 사진을 보내지 않아요.
"""

import logging
import re
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


def _tokens(text: str) -> list[str]:
    return re.findall(r'[a-z0-9]+', text.lower())


def _known_labels(conn, labels: list[str]) -> tuple[list[str], list[str]]:
    """온톨로지와 맞는 비전 라벨만 (비전 점수 순서 유지).

    비전은 "Food", "Fruit"처럼 넓은 라벨을 먼저 주고, 품목 라벨("Persimmon", "Mandarin orange")은
    7~10번째에 줄 때가 많아요(11/27 실제 사진 17장). 10개를 모두 보고, 사전 라벨과 같거나
    사전 라벨을 품는 라벨만 남겨요 ("yellow onion" ⊃ "onion").
    넓은 라벨이 사전 라벨 안에 있는 경우("orange" ⊂ "mandarin orange")는 받지 않아요.

    돌려주는 값: (실제 응답에서 확인한 비전 라벨로 맞은 것, 영어 품목 이름으로만 맞은 것).
    047에서 품목이 95개로 늘면서 "Orange"(오렌지)·"Potato"(감자) 같은 넓은 라벨이 영어 이름으로
    바로 붙어서, 확인된 비전 라벨("clementine", "persimmon")을 먼저 봐요.
    """
    from app.db.repositories import knowledge_repo

    rows = knowledge_repo.vision_item_labels(conn)
    confirmed = [_tokens(r['label']) for r in rows if r.get('kind') == 'vision']
    names = [_tokens(r['label']) for r in rows if r.get('kind') != 'vision']

    def contains(tokens, part):
        return any(tokens[i : i + len(part)] == part for i in range(len(tokens) - len(part) + 1))

    def hit(tokens, dictionary):
        return any(t and (tokens == t or contains(tokens, t)) for t in dictionary)

    by_vision, by_name = [], []
    for label in labels:
        tokens = _tokens(label)
        if not tokens:
            continue
        if hit(tokens, confirmed):
            by_vision.append(label)
        elif hit(tokens, names):
            by_name.append(label)
    # 더 구체적인 라벨이 있으면 그 안에 든 넓은 라벨은 뺌 ("mandarin orange"가 있으면 "orange" 제외)
    chosen = [_tokens(label) for label in by_vision + by_name]
    by_name = [
        label
        for label in by_name
        if not any(o != _tokens(label) and contains(o, _tokens(label)) for o in chosen)
    ]
    return by_vision, by_name


def items_in_text(conn, text: str) -> list[str]:
    """사진 속 글자(가격표·상자)에 적힌 품목 이름 → 품목 ID (온톨로지 한국어 라벨, AI 없음).

    "대파2500" → 대파, "홀로꿀사과" → 사과, "신고배" → 품종 → 배, "효돈감귤" → 귤.
    한 글자 이름(파·배·귤)은 그 낱말만 있을 때만 봐요 ("파인애플"의 '파'는 대파가 아님).
    """
    from app.db.repositories import knowledge_repo

    rows = [
        (label, eid)
        for label, eid, _ in knowledge_repo.label_dictionary(conn)
        # 가격표·상자 글자는 한국어라 한글 이름만 봐요 ("appear" 속 "pear" 같은 오인 방지)
        if label and eid.startswith(('item:', 'variety:')) and re.search('[가-힣]', label)
    ]
    rows.sort(key=lambda row: (-len(row[0]), row[1]))
    found: list[str] = []
    for word in re.split(r'[\s/·,()\[\]<>"\'|]+', text.lower()):
        word = re.sub(r'[^0-9a-z가-힣]', '', word)
        occupied: set[int] = set()
        for label, eid in rows:
            for match in re.finditer(re.escape(label), word):
                start, end = match.span()
                if len(label) == 1 and (start or re.match('[가-힣]', word[end : end + 1])):
                    continue
                span = set(range(start, end))
                if occupied & span:
                    continue
                occupied |= span
                if eid not in found:
                    found.append(eid)
    items: list[str] = []
    for eid in found:
        ids = [eid] if eid.startswith('item:') else knowledge_repo.variety_items(conn, [eid])
        for item_id in ids:
            if item_id not in items and knowledge_repo.get_item(conn, item_id):
                items.append(item_id)
    return items


# 사진 속 글자에 품목이 하나만 적혀 있으면 확신도 (0.8 이상이면 화면이 바로 골라 둠)
TEXT_ONE_ITEM_CONFIDENCE = 0.9
TEXT_ITEM_CONFIDENCE = 0.6


def candidates_from(conn, labels: list[str], text: str) -> list[dict]:
    """비전 라벨(10개 전체) + 사진 속 글자의 품목 이름 → 후보 최대 3개."""
    from app.db.repositories import knowledge_repo

    by_vision, by_name = _known_labels(conn, labels)
    known = by_vision + by_name
    candidates = match_vision_labels(conn, known[:VISION_LABELS_USED]) if known else []
    in_text = items_in_text(conn, text) if text.strip() else []
    if not in_text:
        return candidates
    by_id = {c['item_id']: c for c in candidates}
    if len(in_text) == 1:
        item_id = in_text[0]
        # 글자가 1순위: 라벨과 같은 품목이거나, 라벨로 못 찾았거나, 라벨이 영어 품목 이름으로만 맞았을 때
        # (단감 사진에 "Orange", 양파 사진에 "Potato"가 와도 가격표에 "단감"·"양파"가 있으면 글자를 믿음)
        if item_id in by_id or not candidates or not by_vision:
            # 라벨과 글자가 같은 품목을 가리키거나 라벨로 못 찾았으면 글자가 1순위
            first = by_id.get(item_id) or {
                'item_id': item_id,
                'name': knowledge_repo.get_item(conn, item_id)['name_ko'],
                'confidence': 0.0,
            }
            first = first | {'confidence': max(first['confidence'], TEXT_ONE_ITEM_CONFIDENCE)}
            rest = [c for c in candidates if c['item_id'] != item_id]
            return [first, *rest][:3]
    extra = [
        {
            'item_id': item_id,
            'name': knowledge_repo.get_item(conn, item_id)['name_ko'],
            'confidence': TEXT_ITEM_CONFIDENCE,
        }
        for item_id in in_text
        if item_id not in by_id
    ]
    return sorted([*candidates, *extra], key=lambda c: (-c['confidence'], c['item_id']))[:3]


def interpret(conn, result: dict | None) -> dict:
    """비전 응답 → 후보·가격표·품종. 서버(recognize)와 확인 스크립트(vision_check)가 같이 써요."""
    labels = labels_from(result)
    text = result['text'] if result else ''
    candidates = candidates_from(conn, labels, text)
    tag = None
    variety = {'variety_id': None, 'variety_text': None}
    if text.strip():
        item_id = candidates[0]['item_id'] if candidates else None
        variety = price_tag_reader.read_variety(conn, text, item_id)
        tag = price_tag_reader.parse(conn, text, item_id)
    return {
        'vision_labels': labels[:VISION_LABELS_USED],
        'candidates': candidates,
        'price_tag': tag,
        **variety,
    }


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
    found = await run_in_threadpool(interpret, conn, result)
    return {
        'model': VISION_MODEL,
        **found,
        'media_id': media_id,
        'photo_location': location,
    }
