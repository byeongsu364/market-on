"""자동입력 방지 문자(캡차). 외부 서비스 없이 서버가 숫자 그림을 만들고 확인해요.

- 숫자 5개를 무작위로 뽑아 SVG 그림으로 그려요. 그림에는 글자(text)가 없고,
  숫자마다 기울기·위치·굵기를 흔든 선분과 방해 선을 섞어서 자동 판독을 어렵게 해요.
- 정답은 해시로만 메모리에 두고, 5분 안에 한 번만 확인할 수 있어요 (맞든 틀리든 바로 폐기).
- 외부 캡차(reCAPTCHA 등)와 달리 키 발급·외부 호출·개인정보 해외 전송이 없어요.
"""

import base64
import hashlib
import hmac
import math
import secrets
import threading
import time

TTL_SECONDS = 300
LENGTH = 5
_MAX = 10_000
_store: dict[str, tuple[bytes, float]] = {}
_lock = threading.Lock()
_rng = secrets.SystemRandom()

# 7-세그먼트 숫자: a(위) b(오른쪽 위) c(오른쪽 아래) d(아래) e(왼쪽 아래) f(왼쪽 위) g(가운데)
_SEGMENTS = {
    'a': ((0, 0), (1, 0)),
    'b': ((1, 0), (1, 1)),
    'c': ((1, 1), (1, 2)),
    'd': ((0, 2), (1, 2)),
    'e': ((0, 1), (0, 2)),
    'f': ((0, 0), (0, 1)),
    'g': ((0, 1), (1, 1)),
}
_DIGITS = {
    '0': 'abcdef',
    '1': 'bc',
    '2': 'abged',
    '3': 'abgcd',
    '4': 'fgbc',
    '5': 'afgcd',
    '6': 'afgedc',
    '7': 'abc',
    '8': 'abcdefg',
    '9': 'abcdfg',
}
WIDTH, HEIGHT = 180, 64


def _digest(answer: str) -> bytes:
    return hashlib.sha256(answer.strip().encode()).digest()


def _purge(now: float) -> None:
    for key in [k for k, (_, exp) in _store.items() if exp <= now]:
        _store.pop(key, None)
    while len(_store) >= _MAX:
        _store.pop(next(iter(_store)))


def _jitter(v: float, amount: float) -> float:
    return v + _rng.uniform(-amount, amount)


def _digit_paths(digit: str, ox: float, oy: float) -> list[str]:
    w, h = _rng.uniform(16, 20), _rng.uniform(16, 19)
    angle = math.radians(_rng.uniform(-14, 14))
    cos, sin = math.cos(angle), math.sin(angle)
    cx, cy = ox + w / 2, oy + h

    def point(x, y):
        px, py = ox + x * w, oy + y * h
        dx, dy = px - cx, py - cy
        return _jitter(cx + dx * cos - dy * sin, 1.6), _jitter(cy + dx * sin + dy * cos, 1.6)

    paths = []
    for name in _DIGITS[digit]:
        (x1, y1), (x2, y2) = _SEGMENTS[name]
        (ax, ay), (bx, by) = point(x1, y1), point(x2, y2)
        # 가운데를 살짝 휘게 해서 직선 패턴 매칭을 어렵게
        mx, my = _jitter((ax + bx) / 2, 2.2), _jitter((ay + by) / 2, 2.2)
        width = _rng.uniform(2.6, 3.8)
        paths.append(
            f'<path d="M{ax:.1f} {ay:.1f}Q{mx:.1f} {my:.1f} {bx:.1f} {by:.1f}" '
            f'stroke="#1f2937" stroke-width="{width:.1f}" stroke-linecap="round" fill="none"/>'
        )
    return paths


def _noise(lines: int, dots: int) -> list[str]:
    parts = []
    for _ in range(lines):
        x1, y1 = _rng.uniform(0, WIDTH), _rng.uniform(0, HEIGHT)
        x2, y2 = _rng.uniform(0, WIDTH), _rng.uniform(0, HEIGHT)
        qx, qy = _rng.uniform(0, WIDTH), _rng.uniform(0, HEIGHT)
        parts.append(
            f'<path d="M{x1:.1f} {y1:.1f}Q{qx:.1f} {qy:.1f} {x2:.1f} {y2:.1f}" '
            f'stroke="#6b7280" stroke-width="{_rng.uniform(1, 2.2):.1f}" '
            f'stroke-opacity="{_rng.uniform(0.35, 0.7):.2f}" fill="none"/>'
        )
    for _ in range(dots):
        parts.append(
            f'<circle cx="{_rng.uniform(0, WIDTH):.1f}" cy="{_rng.uniform(0, HEIGHT):.1f}" '
            f'r="{_rng.uniform(0.6, 1.6):.1f}" fill="#9ca3af"/>'
        )
    return parts


def _svg(answer: str) -> str:
    parts = [f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#f3f4f6"/>']
    parts += _noise(4, 40)
    step = (WIDTH - 24) / LENGTH
    for i, digit in enumerate(answer):
        ox = 14 + i * step + _rng.uniform(-3, 3)
        oy = _rng.uniform(8, 20)
        parts += _digit_paths(digit, ox, oy)
    parts += _noise(3, 0)  # 숫자 위를 지나가는 방해 선
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
        f'viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label="자동입력 방지 숫자">'
        + ''.join(parts)
        + '</svg>'
    )


def issue() -> dict:
    """새 캡차를 만들어요. 정답은 돌려주지 않아요."""
    answer = ''.join(_rng.choice('0123456789') for _ in range(LENGTH))
    captcha_id = secrets.token_urlsafe(18)
    now = time.monotonic()
    with _lock:
        _purge(now)
        _store[captcha_id] = (_digest(answer), now + TTL_SECONDS)
    image = 'data:image/svg+xml;base64,' + base64.b64encode(_svg(answer).encode()).decode()
    return {'captcha_id': captcha_id, 'image': image, 'expires_in': TTL_SECONDS}


def verify(captcha_id: str | None, answer: str | None) -> bool:
    """한 번만 확인해요. 맞든 틀리든 그 캡차는 바로 폐기돼요."""
    if not captcha_id or not answer:
        return False
    with _lock:
        entry = _store.pop(captcha_id, None)
    if entry is None:
        return False
    digest, expires = entry
    if expires <= time.monotonic():
        return False
    return hmac.compare_digest(digest, _digest(answer))


def _reset_for_tests() -> None:
    with _lock:
        _store.clear()
