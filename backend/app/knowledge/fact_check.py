"""Conservative sentence-level checks, not a semantic truth verifier."""

import re

from .ingest import tag_entities

NUMBER = r'(?<![A-Za-z0-9.\-])-?\d+(?:\.\d+)?'
VALUES = re.compile(
    rf'({NUMBER})(?:\s*[~∼〜–—-]\s*({NUMBER}))?\s*(℃|°C|도|개월|달|일|주|월|%|Bx|kg|g|원|개|단|명)',
    re.IGNORECASE,
)
FORBIDDEN = re.compile(
    r'신선(?:해|하|합|한|함)|신선도(?:가|는)?\s*(?:높|좋|낮|뛰)|등급|(?:구매|구입)\s*(?:권유|추천|하|해)|사세요|사셔|추천'
)


# 모델이 내부 근거 번호를 문장에 흘리는 경우 ("1번에 나와 있어요", "[2]")
EVIDENCE_REF = re.compile(
    r'\[\d+\]|\d+\s*번\s*(?:근거|자료)|\d+\s*번에\s*(?:나와|있어|적혀|따르면)|근거\s*\d+'
)


def normalize_values(text):
    for word, value in {
        '한': 1,
        '두': 2,
        '세': 3,
        '네': 4,
        '다섯': 5,
        '여섯': 6,
        '일곱': 7,
        '여덟': 8,
        '아홉': 9,
        '열': 10,
    }.items():
        text = re.sub(rf'{word}\s*(달|개월|일|주|월|도|g|kg|원|개|단|명)', rf'{value}\1', text)
    text = text.replace(',', '')
    # "3만원", "1만 5천원" → 30000원, 15000원
    text = re.sub(
        r'(\d+)\s*만\s*(?:(\d+)\s*천\s*)?원',
        lambda m: f'{int(m[1]) * 10000 + int(m[2] or 0) * 1000}원',
        text,
    )
    return re.sub(r'(\d+)\s*천\s*원', lambda m: f'{int(m[1]) * 1000}원', text)


def values(text):
    units = {'달': '개월', '도': '℃', '°c': '℃'}
    return {
        (float(a), float(b) if b else None, units.get(unit.lower(), unit.lower()))
        for a, b, unit in VALUES.findall(normalize_values(text))
    }


def check(answer, evidence, item_id, dictionary):
    supported = values(evidence)
    evidence_items = tag_entities(evidence, dictionary)
    kept, removed = [], 0
    for sentence in sentences(answer):
        other_items = tag_entities(sentence, dictionary) - {item_id}
        if (
            FORBIDDEN.search(sentence)
            or EVIDENCE_REF.search(sentence)
            or not values(sentence) <= supported
            or not other_items <= evidence_items
        ):
            removed += 1
        else:
            kept.append(sentence)
    return ' '.join(kept) or None, removed


def sentences(answer):
    return [s for s in re.split(r'(?<=[.!?。])\s+|\n+', answer.strip()) if s]
