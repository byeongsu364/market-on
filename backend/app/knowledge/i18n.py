"""Offline catalog drafts; missing text always falls back to Korean."""

from functools import lru_cache
from pathlib import Path

import yaml

DATA = Path(__file__).resolve().parents[3] / 'data' / 'i18n'
LANGUAGES = ('ko', 'en', 'zh', 'ja', 'vi')


@lru_cache(maxsize=4)
def catalog(lang):
    path = DATA / f'{lang}.yaml'
    return yaml.safe_load(path.read_text()) if lang in LANGUAGES[1:] and path.exists() else {}


def text(key, lang, fallback, *, section='entities'):
    return (catalog(lang).get(section, {}).get(key) or {}).get('text') or fallback


def label(conn, entity_id, lang, fallback):
    if lang == 'ko' or not entity_id:
        return fallback
    from app.db.repositories import knowledge_repo

    rows = knowledge_repo.item_labels(conn, entity_id)
    return next(
        (r['label'] for r in rows if r['lang'] == lang and r['kind'] == 'translated'),
        text(entity_id, lang, fallback),
    )


def template(key, lang, fallback, **values):
    pattern = text(key, lang, '', section='templates')
    return pattern.format(**values) if pattern else fallback


def localize(conn, value, lang):
    """Localize structured names only. Source titles and evidence bodies stay intact."""
    if lang == 'ko':
        return value
    if isinstance(value, list):
        return [localize(conn, row, lang) for row in value]
    if not isinstance(value, dict):
        return value
    result = dict(value)
    for id_key, name_key in (
        ('item_id', 'name'),
        ('item_id', 'item_name'),
        ('main_item_id', 'main_item_name'),
        ('variety_id', 'variety_name'),
        ('variety_id', 'name'),
        ('unit', 'unit_label'),
        ('category_id', 'category_name'),
        ('recipe_id', 'name'),
    ):
        if result.get(id_key) and isinstance(result.get(name_key), str):
            result[name_key] = label(conn, result[id_key], lang, result[name_key])
    if isinstance(result.get('category'), str):
        result['category'] = text(result['category'], lang, result['category'], section='phrases')
    for key, nested in result.items():
        if key not in (
            'source',
            'sources',
            'citations',
            'steps',
            'ingredient_lines',
        ) and isinstance(nested, (list, dict)):
            result[key] = localize(conn, nested, lang)
    return result
