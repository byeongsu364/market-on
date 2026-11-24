"""Image label generation and tolerant JSON parsing with one corrective request."""

import asyncio
import json
import math
from pathlib import Path

import httpx
from starlette.concurrency import run_in_threadpool

from app.core.errors import AppError
from app.llm.factory import get_llm

PROMPT = Path(__file__).with_name('prompts').joinpath('recognize.txt')


def parse_recognition(text: str) -> dict:
    start, end = text.find('{'), text.rfind('}')
    value = json.loads(text[start : end + 1])
    labels = value.get('labels') if isinstance(value, dict) else None
    if not isinstance(labels, list) or not all(isinstance(label, str) for label in labels):
        raise ValueError('labels must be a string array')
    return {'labels': labels[:3], 'price_tag': parse_price_tag(value.get('price_tag'))}


def _generate_labels(image: bytes, vocabulary: list[str]) -> dict:
    provider = get_llm()
    prompt = PROMPT.read_text(encoding='utf-8')
    if vocabulary:
        prompt = prompt.replace('{vocabulary}', '\n'.join(sorted(set(vocabulary))))
    else:
        prompt = prompt[prompt.index('사진에 가격표') :]
        prompt = (
            '사진 속 주된 농수산물·식재료를 영어 일반명(소문자) 1~3개로 반환하세요.\n'
            '상태·신선도·품질을 평가하지 말 것. 가격을 추정하지 말 것.\n' + prompt
        )
    for attempt in range(2):
        response = provider.generate(prompt, images=[image])
        try:
            return parse_recognition(response)
        except ValueError:
            if attempt == 0:
                prompt += (
                    '\nJSON만 다시 반환하세요. 형식: {"labels": ["green onion"], "price_tag": null}'
                )
    return {'labels': [], 'price_tag': None}


async def recognize_labels(image: bytes, vocabulary: list[str]) -> dict:
    try:
        return await asyncio.wait_for(
            run_in_threadpool(_generate_labels, image, vocabulary), timeout=60
        )
    except (TimeoutError, httpx.HTTPError, AppError) as exc:
        raise AppError(
            'RECOGNIZE_UNAVAILABLE', '사진 인식 서비스에 연결할 수 없습니다.', 503
        ) from exc


def parse_price_tag(value):
    if not isinstance(value, dict) or not isinstance(value.get('unit_text'), str):
        return None
    try:
        if isinstance(value.get('price'), bool):
            return None
        price = float(value['price'])
        quantity = value.get('quantity')
        if quantity is not None:
            if isinstance(quantity, bool):
                return None
            quantity = float(quantity)
            if not math.isfinite(quantity) or quantity <= 0:
                return None
        if not math.isfinite(price) or not 10 <= price <= 10_000_000:
            return None
    except (KeyError, TypeError, ValueError, OverflowError):
        return None
    return {'price': price, 'unit_text': value['unit_text'], 'quantity': quantity}
