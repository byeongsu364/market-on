"""Conservative sentence-level checks, not a semantic truth verifier."""

import re

from .ingest import tag_entities

NUMBER = r'-?\d+(?:\.\d+)?'
VALUES = re.compile(
    rf'({NUMBER})(?:\s*[~∼〜–—-]\s*({NUMBER}))?\s*(℃|°C|도|개월|달|일|주|월|%|Bx|kg|g|원)',
    re.IGNORECASE,
)
FORBIDDEN = re.compile(
    r'신선(?:해|하|합|한|함)|신선도(?:가|는)?\s*(?:높|좋|낮|뛰)|등급|(?:구매|구입)\s*(?:권유|추천|하|해)|사세요|사셔|추천'
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
        text = re.sub(rf'{word}\s*(달|개월|일|주|월|도|g|kg|원)', rf'{value}\1', text)
    return text.replace(',', '')


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
            or not values(sentence) <= supported
            or not other_items <= evidence_items
        ):
            removed += 1
        else:
            kept.append(sentence)
    return ' '.join(kept) or None, removed


def sentences(answer):
    return [s for s in re.split(r'(?<=[.!?。])\s+|\n+', answer.strip()) if s]
