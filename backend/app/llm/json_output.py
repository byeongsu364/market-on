"""Image label generation and tolerant JSON parsing with one corrective request."""

import json
import math
from pathlib import Path

import httpx
from starlette.concurrency import run_in_threadpool

from app.core.errors import AppError
from app.llm.router import run

PROMPT = Path(__file__).with_name('prompts').joinpath('recognize.txt')


def parse_recognition(text: str) -> dict:
    start, end = text.find('{'), text.rfind('}')
    value = json.loads(text[start : end + 1], object_pairs_hook=_merge_duplicate_keys)
    labels = value.get('labels') if isinstance(value, dict) else None
    if not isinstance(labels, list) or not all(isinstance(label, str) for label in labels):
        raise ValueError('labels must be a string array')
    tag = parse_price_tag(value.get('price_tag'))
    if tag is not None and tag['variety_text'] is None:
        # 모델이 품종을 바깥 키에 두는 경우도 받음 ("variety_text", "price_tag_variety_text")
        outer = value.get('variety_text', value.get('price_tag_variety_text'))
        tag['variety_text'] = outer if isinstance(outer, str) else None
    return {'labels': labels[:3], 'price_tag': tag}


def _merge_duplicate_keys(pairs):
    # Gemma가 "price_tag"를 두 번 쓰면(가격 + 품종) 나중 것이 앞을 덮지 않게 합침
    result = {}
    for key, value in pairs:
        if isinstance(result.get(key), dict) and isinstance(value, dict):
            result[key] = result[key] | {k: v for k, v in value.items() if v is not None}
        else:
            result[key] = value
    return result


def _generate_labels(provider, image: bytes, vocabulary: list[str]) -> dict:
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


async def recognize_labels(image: bytes, vocabulary: list[str], accept=lambda _: None):
    try:
        return await run_in_threadpool(
            run, 'recognize', lambda provider: _generate_labels(provider, image, vocabulary), accept
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
    return {
        'price': price,
        'unit_text': value['unit_text'],
        'quantity': quantity,
        'variety_text': value.get('variety_text')
        if isinstance(value.get('variety_text'), str)
        else None,
    }
