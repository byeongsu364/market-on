"""사진 메타데이터(EXIF 등) 처리: 촬영 위치 읽기, 저장·외부 전송 전에 메타데이터 지우기.

- 위치는 서버 안에서만 읽고, 바로 대략값(시장 ID·소수 둘째 자리)으로 줄여 원래 좌표는 버려요.
- 저장하거나 모델(Gemma·GPT 등)로 보내는 사진에는 위치·기기·촬영 시각 같은 메타데이터가 남지 않아요.
- 사진 방향(Orientation)만 다시 넣어 가격표가 눕지 않게 해요.
- 외부 라이브러리 없이 JPEG·PNG·WebP 구조만 다뤄요. 구조를 못 읽으면 PhotoMetaError.
"""

import math
import struct

__all__ = ['PhotoMetaError', 'read_gps', 'strip_metadata']


class PhotoMetaError(ValueError):
    """사진 구조를 읽을 수 없음 (메타데이터를 안전하게 지울 수 없음)."""


# ---- TIFF(EXIF) 읽기 ----

_TYPE_SIZE = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8}


def _ifd(tiff: bytes, offset: int, order: str) -> dict[int, tuple[int, int, bytes]]:
    """IFD 항목을 {tag: (type, count, 값 바이트)}로 돌려줘요."""
    if offset < 8 or offset + 2 > len(tiff):
        return {}
    (count,) = struct.unpack_from(order + 'H', tiff, offset)
    entries = {}
    for i in range(min(count, 512)):
        pos = offset + 2 + i * 12
        if pos + 12 > len(tiff):
            break
        tag, typ, n = struct.unpack_from(order + 'HHI', tiff, pos)
        size = _TYPE_SIZE.get(typ, 0) * n
        if size == 0:
            continue
        if size <= 4:
            value = tiff[pos + 8 : pos + 8 + size]
        else:
            (value_offset,) = struct.unpack_from(order + 'I', tiff, pos + 8)
            if value_offset + size > len(tiff):
                continue
            value = tiff[value_offset : value_offset + size]
        entries[tag] = (typ, n, value)
    return entries


def _tiff_header(tiff: bytes) -> tuple[str, int] | None:
    if len(tiff) < 8 or tiff[:2] not in (b'II', b'MM'):
        return None
    order = '<' if tiff[:2] == b'II' else '>'
    magic, ifd0 = struct.unpack_from(order + 'HI', tiff, 2)
    return (order, ifd0) if magic == 42 else None


def _degrees(value: bytes, order: str) -> float | None:
    if len(value) != 24:
        return None
    parts = struct.unpack(order + '6I', value)
    numbers = []
    for num, den in zip(parts[::2], parts[1::2], strict=True):
        if den == 0:
            return None
        numbers.append(num / den)
    return numbers[0] + numbers[1] / 60 + numbers[2] / 3600


def _gps_from_tiff(tiff: bytes) -> tuple[float, float] | None:
    header = _tiff_header(tiff)
    if header is None:
        return None
    order, ifd0 = header
    pointer = _ifd(tiff, ifd0, order).get(0x8825)
    if pointer is None or pointer[0] != 4:
        return None
    gps = _ifd(tiff, struct.unpack(order + 'I', pointer[2])[0], order)
    if not all(tag in gps for tag in (1, 2, 3, 4)):
        return None
    lat, lng = _degrees(gps[2][2], order), _degrees(gps[4][2], order)
    if lat is None or lng is None:
        return None
    if gps[1][2][:1] == b'S':
        lat = -lat
    if gps[3][2][:1] == b'W':
        lng = -lng
    if not (math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    if lat == 0 and lng == 0:
        return None  # 위치를 못 잡은 기기가 0,0을 넣는 경우
    return lat, lng


def _orientation_from_tiff(tiff: bytes) -> int | None:
    header = _tiff_header(tiff)
    if header is None:
        return None
    order, ifd0 = header
    entry = _ifd(tiff, ifd0, order).get(0x0112)
    if entry is None or entry[0] != 3:
        return None
    (value,) = struct.unpack(order + 'H', entry[2][:2])
    return value if 2 <= value <= 8 else None


# ---- 형식별 구조 ----

_EXIF_PREFIX = b'Exif\x00\x00'


def _jpeg_end(image: bytes, pos: int) -> int:
    """본 그림의 끝(EOI 다음) 위치. 그 뒤에 붙은 데이터(휴대폰이 덧붙인 두 번째 그림·기기 정보)는 버려요."""
    n = len(image)
    while pos + 1 < n:
        marker = image[pos + 1]
        if marker == 0xD9:
            return pos + 2
        if pos + 4 > n:
            break
        (length,) = struct.unpack_from('>H', image, pos + 2)
        pos += 2 + length
        if marker != 0xDA:
            continue
        # 압축된 그림 데이터: FF00(채움)·FFD0~D7(재시작)은 건너뛰고 다음 표시까지
        while pos + 1 < n:
            if image[pos] == 0xFF and image[pos + 1] != 0x00 and not 0xD0 <= image[pos + 1] <= 0xD7:
                if image[pos + 1] == 0xFF:
                    pos += 1
                    continue
                break
            pos += 1
    raise PhotoMetaError('JPEG 끝 표시 없음')


def _jpeg_segments(image: bytes):
    """(marker, 세그먼트 전체 바이트, 데이터) 목록과 SOS부터의 나머지를 돌려줘요."""
    if not image.startswith(b'\xff\xd8'):
        raise PhotoMetaError('JPEG 시작 표시 없음')
    pos, segments = 2, []
    while True:
        if pos + 4 > len(image) or image[pos] != 0xFF:
            raise PhotoMetaError('JPEG 구조 오류')
        marker = image[pos + 1]
        if marker == 0xFF:  # 채움 바이트
            pos += 1
            continue
        if marker == 0xDA or marker == 0xD9:  # SOS(그림 데이터 시작) 또는 EOI
            return segments, image[pos : _jpeg_end(image, pos)]
        (length,) = struct.unpack_from('>H', image, pos + 2)
        end = pos + 2 + length
        if length < 2 or end > len(image):
            raise PhotoMetaError('JPEG 구조 오류')
        segments.append((marker, image[pos:end], image[pos + 4 : end]))
        pos = end


def _png_chunks(image: bytes):
    if not image.startswith(b'\x89PNG\r\n\x1a\n'):
        raise PhotoMetaError('PNG 시작 표시 없음')
    pos, chunks = 8, []
    while pos < len(image):
        if pos + 12 > len(image):
            raise PhotoMetaError('PNG 구조 오류')
        (length,) = struct.unpack_from('>I', image, pos)
        end = pos + 12 + length
        if end > len(image):
            raise PhotoMetaError('PNG 구조 오류')
        chunks.append((image[pos + 4 : pos + 8], image[pos:end], image[pos + 8 : pos + 8 + length]))
        pos = end
        if chunks[-1][0] == b'IEND':
            break
    return chunks


def _webp_chunks(image: bytes):
    if len(image) < 12 or image[:4] != b'RIFF' or image[8:12] != b'WEBP':
        raise PhotoMetaError('WebP 시작 표시 없음')
    (riff_size,) = struct.unpack_from('<I', image, 4)
    limit = min(len(image), 8 + riff_size)
    pos, chunks = 12, []
    while pos + 8 <= limit:
        fourcc = image[pos : pos + 4]
        (size,) = struct.unpack_from('<I', image, pos + 4)
        end = pos + 8 + size + (size & 1)
        if pos + 8 + size > limit:
            raise PhotoMetaError('WebP 구조 오류')
        chunks.append((fourcc, image[pos : min(end, limit)], image[pos + 8 : pos + 8 + size]))
        pos = end
    if not chunks:
        raise PhotoMetaError('WebP 구조 오류')
    return chunks


def _tiff_blobs(image: bytes, ext: str) -> list[bytes]:
    if ext == 'jpg':
        segments, _ = _jpeg_segments(image)
        return [d[6:] for m, _, d in segments if m == 0xE1 and d.startswith(_EXIF_PREFIX)]
    if ext == 'png':
        return [d for kind, _, d in _png_chunks(image) if kind == b'eXIf']
    if ext == 'webp':
        blobs = [d for kind, _, d in _webp_chunks(image) if kind == b'EXIF']
        return [b[6:] if b.startswith(_EXIF_PREFIX) else b for b in blobs]
    raise PhotoMetaError('지원하지 않는 형식')


def read_gps(image: bytes, ext: str) -> tuple[float, float] | None:
    """사진 속 촬영 위치(위도, 경도). 없거나 읽을 수 없으면 None."""
    try:
        blobs = _tiff_blobs(image, ext)
    except (PhotoMetaError, struct.error):
        return None
    for blob in blobs:
        try:
            found = _gps_from_tiff(blob)
        except struct.error:
            continue
        if found:
            return found
    return None


def _orientation_exif(orientation: int) -> bytes:
    """방향 태그 하나만 든 최소 EXIF(APP1)."""
    tiff = b'MM\x00\x2a' + struct.pack('>I', 8) + struct.pack('>H', 1)
    tiff += struct.pack('>HHIHH', 0x0112, 3, 1, orientation, 0) + struct.pack('>I', 0)
    data = _EXIF_PREFIX + tiff
    return b'\xff\xe1' + struct.pack('>H', len(data) + 2) + data


# JPEG에서 남길 세그먼트: JFIF(APP0), 색 정보(APP2 ICC_PROFILE, APP14 Adobe), 그림에 필요한 표(DQT·DHT·SOF 등)
_JPEG_DROP = {0xE1, 0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xEB, 0xEC, 0xED, 0xEF, 0xFE}
_PNG_DROP = {b'eXIf', b'tEXt', b'zTXt', b'iTXt', b'tIME'}
_WEBP_DROP = {b'EXIF', b'XMP '}


def strip_metadata(image: bytes, ext: str) -> bytes:
    """위치·기기·시각 등 메타데이터를 뺀 사진. 그림 데이터는 다시 인코딩하지 않아요."""
    try:
        if ext == 'jpg':
            segments, rest = _jpeg_segments(image)
            orientation = None
            for marker, _, data in segments:
                if marker == 0xE1 and data.startswith(_EXIF_PREFIX):
                    orientation = orientation or _orientation_from_tiff(data[6:])
            kept = [
                raw
                for marker, raw, data in segments
                if marker not in _JPEG_DROP
                and not (marker == 0xE2 and not data.startswith(b'ICC_PROFILE\x00'))
            ]
            # APP0(JFIF) 바로 뒤, 없으면 맨 앞에 방향만 다시 넣음
            insert_at = (
                1 if segments and segments[0][0] == 0xE0 and kept[:1] == [segments[0][1]] else 0
            )
            if orientation:
                kept.insert(insert_at, _orientation_exif(orientation))
            return b'\xff\xd8' + b''.join(kept) + rest
        if ext == 'png':
            chunks = _png_chunks(image)
            return image[:8] + b''.join(raw for kind, raw, _ in chunks if kind not in _PNG_DROP)
        if ext == 'webp':
            parts = []
            for kind, raw, data in _webp_chunks(image):
                if kind in _WEBP_DROP:
                    continue
                if kind == b'VP8X' and data:
                    flags = data[0] & ~0x0C  # EXIF(0x08)·XMP(0x04) 있음 표시 끄기
                    raw = raw[:8] + bytes([flags]) + raw[9:]
                parts.append(raw)
            body = b'WEBP' + b''.join(parts)
            return b'RIFF' + struct.pack('<I', len(body)) + body
    except struct.error as exc:
        raise PhotoMetaError('사진 구조 오류') from exc
    raise PhotoMetaError('지원하지 않는 형식')
