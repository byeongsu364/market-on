"""구글 비전: 사진 한 장으로 라벨(품목)과 글자(가격표)를 한 번에 받아요. 전송은 core.http에서만.

- 키는 헤더(x-goog-api-key)로만 보내요. 주소·로그·오류 문구에 키가 남지 않게
- 사진 한 장 = LABEL_DETECTION 1건 + TEXT_DETECTION 1건 (요금·무료 한도 계산 기준)
- 허용 의존성: core 및 공통 층
"""

import base64

import httpx

from app.core import http
from app.core.config import settings
from app.core.errors import AppError

URL = 'https://vision.googleapis.com/v1/images:annotate'
# 서버가 안 받으면 연결 단계에서 5초 안에 포기 (llm/limits.CONNECT_TIMEOUT과 같게)
TIMEOUT = httpx.Timeout(10.0, connect=5.0)
MAX_LABELS = 10


def configured() -> bool:
    return bool((settings.GOOGLE_VISION_API_KEY or '').strip())


def request_body(image: bytes) -> dict:
    return {
        'requests': [
            {
                'image': {'content': base64.b64encode(image).decode('ascii')},
                'features': [
                    {'type': 'LABEL_DETECTION', 'maxResults': MAX_LABELS},
                    {'type': 'TEXT_DETECTION'},
                ],
            }
        ]
    }


def parse_response(data: dict) -> dict:
    """비전 응답 → {'labels': [(영어 라벨, 점수)…], 'text': 사진 속 글자 전체}."""
    responses = data.get('responses') if isinstance(data, dict) else None
    first = responses[0] if isinstance(responses, list) and responses else {}
    if not isinstance(first, dict) or first.get('error'):
        raise AppError('VISION_FAILED', '사진 인식에 실패했어요.', 503)
    labels = []
    for label in first.get('labelAnnotations') or []:
        text = label.get('description') if isinstance(label, dict) else None
        if isinstance(text, str) and text.strip():
            score = label.get('score')
            labels.append((text.strip(), float(score) if isinstance(score, (int, float)) else 0.0))
    full = first.get('fullTextAnnotation') or {}
    text = full.get('text') if isinstance(full, dict) else None
    if not isinstance(text, str):
        texts = first.get('textAnnotations') or []
        text = texts[0].get('description', '') if texts and isinstance(texts[0], dict) else ''
    return {'labels': labels, 'text': text or ''}


def annotate(image: bytes) -> dict:
    if not configured():
        raise AppError('VISION_NOT_CONFIGURED', 'GOOGLE_VISION_API_KEY가 필요합니다.', 503)
    try:
        response = http.post_sync(
            URL,
            json=request_body(image),
            headers={'x-goog-api-key': settings.GOOGLE_VISION_API_KEY.strip()},
            timeout=TIMEOUT,
            retries=1,
        )
        response.raise_for_status()
        return parse_response(response.json())
    except AppError:
        raise
    except Exception:  # noqa: BLE001 - 오류 문구에 요청 내용이 섞일 수 있어 숨김
        raise AppError('VISION_FAILED', '사진 인식에 실패했어요.', 503) from None
