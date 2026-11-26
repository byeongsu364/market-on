"""가격표 글자(구글 비전 OCR) → 가격·수량·단위·품종. AI 모델을 부르지 않고 규칙으로만 읽어요.

- 가격: "3,000원", "3000", "3천원", "1만원", "1만 5천원", "₩3,000" → 정수
  "원"이 붙은 값을 먼저 보고, 서로 다른 값이 여럿이면 고르지 않아요(None → 사용자가 직접 입력)
- 수량·단위: "3개", "1kg", "한 단", "1봉" → 온톨로지 단위 라벨(match_unit)과 맞는 것만
- 품종: 글자 전체를 온톨로지 품종 라벨(match_variety)과 맞춰요 ("부사" → 후지)
- 응답 모양은 예전과 같아요: {price, unit_text, quantity, unit, variety_id}. 가격을 못 읽으면 None
"""

import math
import re

from app.knowledge.fact_check import normalize_values
from app.knowledge.ontology import match_unit, match_variety

MIN_PRICE, MAX_PRICE = 10, 10_000_000
# 숫자 뒤에 붙으면 가격이 아닌 단위 (수량·무게·비율·날짜·시간)
NOT_PRICE_UNITS = (
    r'kg|g|㎏|그램|키로|킬로|개|단|봉|봉지|팩|박스|상자|묶음|포기|마리|근|송이|알|줄|통|'
    r'%|퍼센트|월|일|년|시|분|cm|mm|ml|l|리터|입|구|미|수'
)
UNIT_WORDS = r'kg|g|㎏|그램|키로|킬로|개|단|봉지|봉|팩|박스|상자|묶음|포기|마리|근|송이|알|줄|통|망|소쿠리|바구니'
PHONE = re.compile(r'\d{2,4}\s*-\s*\d{3,4}\s*-\s*\d{4}')
DATE = re.compile(r'\d{2,4}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{1,2}')


def _clean(text: str) -> str:
    text = PHONE.sub(' ', text or '')
    text = DATE.sub(' ', text)
    text = text.replace('₩', ' ').replace('￦', ' ')
    text = text.replace('㎏', 'kg')
    # 숫자 사이 공백이 끼면("3 000") 이어 붙임, 쉼표는 normalize_values가 지움
    text = re.sub(r'(?<=\d)[ \t](?=\d{3}(?!\d))', '', text)
    return normalize_values(text)


def _valid(value: float) -> bool:
    return math.isfinite(value) and MIN_PRICE <= value <= MAX_PRICE and value == int(value)


def read_price(text: str) -> int | None:
    cleaned = _clean(text)
    won = {float(m) for m in re.findall(r'(\d+(?:\.\d+)?)\s*원', cleaned)}
    won = {v for v in won if _valid(v)}
    if len(won) == 1:
        return int(won.pop())
    if len(won) > 1:
        return None
    # "원"이 없으면 단위가 붙지 않은 숫자 중 가격 범위인 것 (₩3,000 · 3000 같은 표기)
    bare = set()
    for match in re.finditer(r'(?<![\d.])(\d{2,8})(?![\d.])\s*([가-힣A-Za-z%]*)', cleaned):
        number, after = match.group(1), match.group(2)
        if after and re.match(rf'(?:{NOT_PRICE_UNITS})', after, re.IGNORECASE):
            continue
        value = float(number)
        if _valid(value) and value >= 100:  # 두 자리 숫자는 개수·번호일 때가 많아 빼요
            bare.add(value)
    return int(bare.pop()) if len(bare) == 1 else None


def read_unit(conn, text: str) -> tuple[str, str | None, float | None]:
    """(unit_text, unit_id, quantity). 온톨로지 단위와 맞는 첫 표기만 씀."""
    cleaned = _clean(text)
    for match in re.finditer(
        rf'(\d+(?:\.\d+)?)?\s*({UNIT_WORDS})(?![가-힣])', cleaned, re.IGNORECASE
    ):
        number, word = match.group(1), match.group(2)
        unit_text = f'{number or ""}{word}'
        unit = match_unit(conn, unit_text)
        if unit:
            quantity = float(number) if number else None
            if quantity is not None and (not math.isfinite(quantity) or quantity <= 0):
                quantity = None
            return unit_text, unit, quantity
    return '', None, None


def parse(conn, text: str, item_id: str | None) -> dict | None:
    if not (text or '').strip():
        return None
    price = read_price(text)
    if price is None:
        return None
    unit_text, unit, quantity = read_unit(conn, text)
    return {
        'price': float(price),
        'unit_text': unit_text,
        'quantity': quantity,
        'unit': unit,
        'variety_id': match_variety(conn, item_id, text) if item_id else None,
    }
