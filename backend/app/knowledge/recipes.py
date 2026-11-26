"""Deterministic recipe parsing and team-authored shopping rules. No generated prose."""

import re
from functools import lru_cache
from pathlib import Path

import yaml

ONTOLOGY = Path(__file__).resolve().parents[3] / 'data' / 'ontology'


@lru_cache(maxsize=2)
def rules(name):
    return yaml.safe_load((ONTOLOGY / f'{name}.yaml').read_text())


@lru_cache(maxsize=1)
def labels():
    return sorted(
        {
            (label, e['id'])
            for p in ONTOLOGY.glob('*.yaml')
            for e in (yaml.safe_load(p.read_text()) or {}).get('entities', [])
            if e['type'] == 'item'
            for label in (e.get('labels') or {}).get('ko', [e['name_ko']])
        },
        key=lambda pair: (-len(pair[0]), pair),
    )


def match_items(text, dictionary):
    occupied, found = set(), set()
    for label, eid in dictionary:
        pattern = re.escape(label)
        if len(label) == 1:
            pattern = rf'(?<![가-힣]){pattern}(?![가-힣])'
        for m in re.finditer(pattern, text):
            span = set(range(*m.span()))
            if not occupied & span:
                occupied |= span
                found.add(eid)
    return sorted(found)


def ingredient_lines(text):
    # Commas inside quantities/preparation parentheses are part of the original line.
    return [
        re.sub(r'^[●•·\-\s]+', '', p).strip()
        for p in re.split(r',\s*(?![^()]*\))|\n', text or '')
        if p.strip()
    ]


def clean_lines(title, lines):
    """원문 재료 줄에서 소제목을 빼요.

    - "오이무침 :"처럼 콜론으로 끝나는 줄 → 소제목이라 뺌
    - "소스 : 맛간장 30g" → "맛간장 30g" (앞의 소제목만 떼요)
    - "북엇국"처럼 요리 이름 안에 들어 있고 양이 없는 줄 → 소제목이라 뺌
    """
    result = []
    for raw in lines:
        text = (raw or '').strip()
        if not text or re.search(r'[:：]\s*$', text):
            continue
        text = re.sub(r'^[^:：()\d]{1,15}[:：]\s*', '', text).strip()
        if not re.search(r'\d', text) and text.replace(' ', '') in (title or '').replace(' ', ''):
            continue
        if text:
            result.append(text)
    return result


def main_items(title, lines, dictionary):
    lines = clean_lines(title, lines)
    title_items = match_items(title, dictionary)
    # Single-character names may be attached to a dish name, but never match 배추/배합.
    for label, eid in dictionary:
        if label in {'배', '귤'} and re.search(rf'(?<![가-힣]){label}(?!추|합|양)', title):
            title_items.append(eid)
    mains = set(title_items) | set(match_items(lines[0], dictionary) if lines else [])
    # Preserve ingredient order for the singular main_item, and never infer an absent ingredient.
    return list(
        dict.fromkeys(
            eid for line in lines for eid in match_items(line, dictionary) if eid in mains
        )
    )


def parse_ingredients(title, lines, dictionary=None):
    dictionary = labels() if dictionary is None else dictionary
    lines = clean_lines(title, lines)
    mains = main_items(title, lines, dictionary)
    categories = rules('ingredient_categories')['rules']
    result = []
    for text in lines:
        ids = match_items(text, dictionary)
        category = next(
            (r['store_category'] for r in categories if any(k in text for k in r['keywords'])), None
        )
        for eid in ids or [None]:
            result.append(
                {
                    'text': text,
                    'item_id': eid,
                    'store_category': None if eid else category,
                    'role': '주재료' if eid in mains else '부재료',
                    'where': 'item' if eid else 'category' if category else 'outside',
                }
            )
    return result


def without_tips(body):
    return re.sub(r'(?ms)^## 팁\s*\n.*?(?=^## |^출처:|\Z)', '', body).strip()


def body_parts(body):
    body = without_tips(body)
    ingredients = re.search(r'(?ms)^## 재료\s*\n(.*?)(?=^## |\Z)', body)
    steps = re.search(r'(?ms)^## 만드는 법\s*\n(.*?)(?=^## |^출처:|\Z)', body)
    return (
        [line[2:] for line in ingredients[1].splitlines() if line.startswith('- ')]
        if ingredients
        else [],
        steps[1].strip() if steps else '',
    )


def metadata(doc, seasons):
    mains = doc.main_items or ([doc.main_item] if doc.main_item else [])
    months = [set(seasons.get(eid, [])) for eid in mains]
    weather = rules('weather_rules')['rules']
    tags = [
        tag
        for tag, r in weather.items()
        if doc.dish_type in r.get('dish_types', [])
        or doc.cook_method in r.get('cook_methods', [])
        or (
            r.get('exclude_method')
            and doc.dish_type in r.get('require_dish_types', [])
            and doc.cook_method != r['exclude_method']
        )
    ]
    return {
        'main_item_id': doc.main_item,
        'main_item_ids': mains,
        'dish_type': doc.dish_type,
        'cook_method': doc.cook_method,
        'season_months': sorted(set.intersection(*months)) if months else [],
        'weather_tags': tags,
        'quote_only': True,
    }
