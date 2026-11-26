"""사진 메타데이터: 촬영 위치 읽기, 지우기, 동의했을 때만 대략 위치 저장."""

import struct
import zlib
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.photo_meta import PhotoMetaError, read_gps, strip_metadata
from app.db.repositories import knowledge_repo, media_repo, price_repo, store_repo
from app.deps import get_db
from app.llm import router
from app.main import app

APP0 = b'\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
SCAN = b'\xff\xda\x00\x08\x01\x01\x00\x00\x3f\x00pix\xff\x00els\xff\xd0more\xff\xd9'
# 망원시장 근처 (37.5562, 126.9068)
LAT = ((37, 1), (33, 1), (2232, 100))
LNG = ((126, 1), (54, 1), (2448, 100))


def rationals(parts):
    return b''.join(struct.pack('>II', n, d) for n, d in parts)


def exif_tiff(lat=LAT, lng=LNG, lat_ref=b'N', lng_ref=b'E', orientation=6, extra=b''):
    """방향·GPS·제조사 태그가 든 TIFF(EXIF 본문)."""
    gps_ifd = 8 + 2 + 3 * 12 + 4
    data = gps_ifd + 2 + 4 * 12 + 4
    make = data + 48
    ifd0 = struct.pack('>H', 3)
    ifd0 += struct.pack('>HHIHH', 0x0112, 3, 1, orientation, 0)
    ifd0 += struct.pack('>HHII', 0x010F, 2, len(extra) + 1, make)
    ifd0 += struct.pack('>HHII', 0x8825, 4, 1, gps_ifd) + struct.pack('>I', 0)
    gps = struct.pack('>H', 4)
    gps += struct.pack('>HHI', 1, 2, 2) + lat_ref + b'\x00\x00\x00'
    gps += struct.pack('>HHII', 2, 5, 3, data)
    gps += struct.pack('>HHI', 3, 2, 2) + lng_ref + b'\x00\x00\x00'
    gps += struct.pack('>HHII', 4, 5, 3, data + 24) + struct.pack('>I', 0)
    return (
        b'MM\x00\x2a'
        + struct.pack('>I', 8)
        + ifd0
        + gps
        + rationals(lat)
        + rationals(lng)
        + extra
        + b'\x00'
    )


def app1(payload):
    return b'\xff\xe1' + struct.pack('>H', len(payload) + 2) + payload


def jpeg_with_gps(**kwargs):
    xmp = app1(b'http://ns.adobe.com/xap/1.0/\x00<x:xmpmeta>GPS 37.5562</x:xmpmeta>')
    comment = b'\xff\xfe\x00\x0bSecret!!!'
    trailer = (
        b'\xff\xd8' + app1(b'Exif\x00\x00' + exif_tiff()) + b'\xff\xd9'
    )  # 휴대폰이 덧붙인 두 번째 그림
    return (
        b'\xff\xd8'
        + APP0
        + app1(b'Exif\x00\x00' + exif_tiff(extra=b'PhoneMaker', **kwargs))
        + xmp
        + comment
        + SCAN
        + trailer
    )


def png_chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))


def png_with_gps():
    return (
        b'\x89PNG\r\n\x1a\n'
        + png_chunk(b'IHDR', b'\x00' * 13)
        + png_chunk(b'eXIf', exif_tiff())
        + png_chunk(b'tEXt', b'Comment\x00at home')
        + png_chunk(b'IDAT', b'pixels')
        + png_chunk(b'IEND', b'')
    )


def webp_chunk(kind, data):
    return kind + struct.pack('<I', len(data)) + data + (b'\x00' if len(data) & 1 else b'')


def webp_with_gps():
    body = (
        b'WEBP'
        + webp_chunk(b'VP8X', bytes([0x0C]) + b'\x00' * 9)
        + webp_chunk(b'VP8L', b'pixels')
        + webp_chunk(b'EXIF', b'Exif\x00\x00' + exif_tiff())
        + webp_chunk(b'XMP ', b'<x:xmpmeta/>')
    )
    return b'RIFF' + struct.pack('<I', len(body)) + body


@pytest.mark.parametrize(
    ('image', 'ext'), [(jpeg_with_gps(), 'jpg'), (png_with_gps(), 'png'), (webp_with_gps(), 'webp')]
)
def test_read_then_strip(image, ext):
    lat, lng = read_gps(image, ext)
    assert lat == pytest.approx(37.5562) and lng == pytest.approx(126.9068)
    clean = strip_metadata(image, ext)
    assert read_gps(clean, ext) is None
    for secret in (b'PhoneMaker', b'GPS 37.5562', b'Secret', b'at home', b'xmpmeta'):
        assert secret not in clean
    assert strip_metadata(clean, ext) == clean  # 두 번 지워도 같음


def test_jpeg_keeps_picture_orientation_and_drops_trailer():
    clean = strip_metadata(jpeg_with_gps(), 'jpg')
    assert clean.startswith(b'\xff\xd8' + APP0 + b'\xff\xe1')  # JFIF 다음에 방향만 든 EXIF
    assert clean.endswith(SCAN)  # 그림 데이터는 그대로, 뒤에 붙은 두 번째 그림은 버림
    assert b'\x01\x12\x00\x03\x00\x00\x00\x01\x00\x06' in clean  # Orientation=6 유지
    assert clean.count(b'Exif') == 1


def test_jpeg_without_orientation_has_no_exif():
    image = b'\xff\xd8' + APP0 + app1(b'Exif\x00\x00' + exif_tiff(orientation=1)) + SCAN
    assert strip_metadata(image, 'jpg') == b'\xff\xd8' + APP0 + SCAN


def test_webp_flags_cleared():
    clean = strip_metadata(webp_with_gps(), 'webp')
    assert clean[12:16] == b'VP8X' and clean[20] & 0x0C == 0
    assert struct.unpack('<I', clean[4:8])[0] == len(clean) - 8


@pytest.mark.parametrize(('lat_ref', 'lng_ref', 'sign'), [(b'S', b'W', -1), (b'N', b'E', 1)])
def test_hemisphere(lat_ref, lng_ref, sign):
    image = b'\xff\xd8' + app1(b'Exif\x00\x00' + exif_tiff(lat_ref=lat_ref, lng_ref=lng_ref)) + SCAN
    lat, lng = read_gps(image, 'jpg')
    assert lat == pytest.approx(sign * 37.5562) and lng == pytest.approx(sign * 126.9068)


@pytest.mark.parametrize(
    'lat',
    [((0, 1), (0, 1), (0, 0)), ((95, 1), (0, 1), (0, 1))],  # 분모 0, 범위 밖
)
def test_bad_gps_ignored(lat):
    image = b'\xff\xd8' + app1(b'Exif\x00\x00' + exif_tiff(lat=lat)) + SCAN
    assert read_gps(image, 'jpg') is None


@pytest.mark.parametrize(
    ('image', 'ext'),
    [
        (b'\xff\xd8\xffsample', 'jpg'),  # 구조 깨짐
        (b'\xff\xd8' + APP0 + b'\xff\xda\x00\x08\x01\x01\x00\x00\x3f\x00no end', 'jpg'),
        (b'\x89PNG\r\n\x1a\n\x00\x00\x10\x00IDAT', 'png'),
        (b'RIFF\xff\x00\x00\x00WEBPVP8L\xff\x00\x00\x00', 'webp'),
    ],
)
def test_unreadable_structure_fails_closed(image, ext):
    assert read_gps(image, ext) is None
    with pytest.raises(PhotoMetaError):
        strip_metadata(image, ext)


@pytest.fixture
def api(monkeypatch, tmp_path):
    monkeypatch.setattr(price_repo, 'varieties', lambda *a: [])
    conn = Mock()
    conn.transaction.side_effect = nullcontext
    monkeypatch.setattr(settings, 'MEDIA_DIR', tmp_path)
    monkeypatch.setattr(settings, 'OPENAI_API_KEY', None)
    monkeypatch.setattr(settings, 'OLLAMA_BASE_URL', 'http://offline.invalid')
    media = Mock(return_value='11111111-1111-1111-1111-111111111111')
    monkeypatch.setattr(media_repo, 'insert_media', media)
    monkeypatch.setattr(
        knowledge_repo,
        'vision_item_labels',
        lambda c: [{'id': 'item:green_onion', 'name_ko': '대파', 'label': 'scallion'}],
    )
    monkeypatch.setattr(knowledge_repo, 'similar_items', lambda *a: [])
    monkeypatch.setattr(
        knowledge_repo,
        'item_vocabulary',
        lambda c: [{'item_id': 'item:green_onion', 'name_en': 'green onion'}],
    )
    monkeypatch.setattr(
        store_repo,
        'list_markets',
        lambda c: [
            {'id': 'market:mangwon', 'lat': 37.5560, 'lng': 126.9064},
            {'id': 'market:far', 'lat': 37.60, 'lng': 127.00},
            {'id': 'market:nowhere', 'lat': None, 'lng': None},
        ],
    )
    from app.clients import vision
    from app.services import scan_service

    # 040: 사진은 구글 비전에만 가요. AI 모델(젬마·제미나이·GPT)은 사진을 받지 않음
    sent = []
    monkeypatch.setattr(settings, 'GOOGLE_VISION_API_KEY', 'test-vision')
    monkeypatch.setattr(
        vision,
        'annotate',
        lambda image: sent.append(image) or {'labels': [('Scallion', 0.9)], 'text': ''},
    )
    monkeypatch.setattr(scan_service.vision_usage, 'take', lambda: None)
    monkeypatch.setattr(scan_service.llm_call_repo, 'record', Mock())
    monkeypatch.setattr(router, '_provider', Mock(side_effect=AssertionError('no LLM for photos')))
    provider = SimpleNamespace(sent=sent)
    app.dependency_overrides[get_db] = lambda: conn
    try:
        with TestClient(app) as client:
            yield client, provider, media, tmp_path
    finally:
        app.dependency_overrides.pop(get_db, None)


def post(client, image, **form):
    return client.post('/recognize', files={'photo': ('a.jpg', image, 'image/jpeg')}, data=form)


def saved_bytes(root):
    (path,) = list(root.glob('photos/*/*'))
    return path.read_bytes()


@pytest.mark.parametrize('form', [{}, {'use_location': 'false'}])
def test_without_consent_location_dropped(api, form):
    client, provider, media, root = api
    image = jpeg_with_gps()
    body = post(client, image, **form).json()
    assert body['photo_location'] is None
    sent = provider.sent[0]
    assert sent == saved_bytes(root) == strip_metadata(image, 'jpg')
    assert read_gps(sent, 'jpg') is None
    assert not {'photo_market_id', 'photo_lat', 'photo_lng'} & set(media.call_args.kwargs)


def test_with_consent_only_coarse_location_kept(api):
    client, provider, media, root = api
    body = post(client, jpeg_with_gps(), use_location='true').json()
    assert body['photo_location'] == {'market_id': 'market:mangwon', 'lat': 37.56, 'lng': 126.91}
    assert media.call_args.kwargs['photo_market_id'] == 'market:mangwon'
    assert (media.call_args.kwargs['photo_lat'], media.call_args.kwargs['photo_lng']) == (
        37.56,
        126.91,
    )
    assert read_gps(provider.sent[0], 'jpg') is None
    assert read_gps(saved_bytes(root), 'jpg') is None


def test_consent_far_from_markets(api):
    client, *_ = api
    far = ((35, 1), (0, 1), (0, 1))
    image = b'\xff\xd8' + app1(b'Exif\x00\x00' + exif_tiff(lat=far)) + SCAN
    assert post(client, image, use_location='true').json()['photo_location'] == {
        'market_id': None,
        'lat': 35.0,
        'lng': 126.91,
    }


def test_consent_without_gps(api):
    client, *_ = api
    image = b'\xff\xd8' + APP0 + SCAN
    assert post(client, image, use_location='true').json()['photo_location'] is None


def test_unreadable_photo_rejected_before_saving_or_sending(api):
    client, provider, media, root = api
    response = post(client, b'\xff\xd8\xffbroken')
    assert response.status_code == 415
    assert response.json()['error']['code'] == 'UNREADABLE_IMAGE'
    assert not provider.sent
    media.assert_not_called()
    assert not list(root.glob('photos/*/*'))
