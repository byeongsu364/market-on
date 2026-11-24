"""Image label generation and tolerant JSON parsing with one corrective request."""

import asyncio
import json
from pathlib import Path

import httpx
from starlette.concurrency import run_in_threadpool

from app.core.errors import AppError
from app.llm.factory import get_llm

PROMPT = Path(__file__).with_name('prompts').joinpath('recognize.txt')


def parse_labels(text: str) -> list[str]:
    start, end = text.find('{'), text.rfind('}')
    value = json.loads(text[start : end + 1])
    labels = value.get('labels') if isinstance(value, dict) else None
    if not isinstance(labels, list) or not all(isinstance(label, str) for label in labels):
        raise ValueError('labels must be a string array')
    return labels[:3]


def _generate_labels(image: bytes, vocabulary: list[str]) -> list[str]:
    provider = get_llm()
    if vocabulary:
        prompt = PROMPT.read_text(encoding='utf-8').replace(
            '{vocabulary}', '\n'.join(sorted(set(vocabulary)))
        )
    else:
        prompt = (
            '사진 속 주된 농수산물·식재료를 영어 일반명(소문자) 1~3개로, '
            '가장 확실한 것부터 반환하세요.\n'
            'JSON만 반환하세요: {"labels": ["green onion", "leek"]}\n'
            '상태·신선도·품질을 평가하지 말 것. 가격을 추정하지 말 것.\n'
            '식재료가 없으면 {"labels": []}를 반환하세요.'
        )
    for attempt in range(2):
        response = provider.generate(prompt, images=[image])
        try:
            return parse_labels(response)
        except ValueError:
            if attempt == 0:
                prompt += '\nJSON만 다시 반환하세요. 형식: {"labels": ["green onion"]}'
    return []


async def recognize_labels(image: bytes, vocabulary: list[str]) -> list[str]:
    try:
        return await asyncio.wait_for(
            run_in_threadpool(_generate_labels, image, vocabulary), timeout=60
        )
    except (TimeoutError, httpx.HTTPError, AppError) as exc:
        raise AppError(
            'RECOGNIZE_UNAVAILABLE', '사진 인식 서비스에 연결할 수 없습니다.', 503
        ) from exc
