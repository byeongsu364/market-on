"""Offline seeds by default. Explicit --gemma fills drafts using translate ONLY.

Run from backend: ../.venv/bin/python -m scripts.translate_locales [--gemma]
No database connection; no network unless --gemma is explicitly supplied.
"""

import argparse
import json
from pathlib import Path

import yaml

from app.llm.translate import placeholders, translate

ROOT = Path(__file__).resolve().parents[2]
LANGUAGES = ('en', 'zh', 'ja', 'vi')
META = {'machine_translated': True, 'reviewed': False}
TEMPLATES = {
    'season_featured': [
        "Korea's Rural Development Administration ('Food of the Month') lists {name} for months {months}.",
        "韩国农村振兴厅（本月食材）将{name}列为{months}月的食材。",
        "韓国農村振興庁の「今月の食材」は{name}を{months}月の食材として紹介しています。",
        "Cục Phát triển Nông thôn Hàn Quốc (Thực phẩm của tháng) giới thiệu {name} cho các tháng {months}.",
    ],
    'season_harvest': [
        '{name} is harvested {period}{note}.',
        '{name}的收获期为{period}{note}。',
        '{name}の収穫期は{period}{note}です。',
        '{name} được thu hoạch {period}{note}.',
    ],
    'season_regions': [
        '{name} is widely grown in {regions}.',
        '{name}主要种植于{regions}。',
        '{name}は{regions}で多く栽培されています。',
        '{name} được trồng nhiều tại {regions}.',
    ],
    'storage': [
        'Guidance: store {name} at {temperature}.',
        '资料说明：{name}适宜在{temperature}储存。',
        '資料では{name}を{temperature}で保存すると案内しています。',
        'Hướng dẫn bảo quản {name} ở {temperature}.',
    ],
    'storage_period': [
        'Guidance: store {name} at {temperature} for {period}.',
        '资料说明：{name}可在{temperature}储存{period}。',
        '資料では{name}を{temperature}で{period}保存できると案内しています。',
        'Hướng dẫn bảo quản {name} ở {temperature} trong {period}.',
    ],
    'recipe_season_reason': [
        'Seasonal in month {month}, a dish made with {name}: {dish}',
        '{month}月时令食材{name}制作的菜肴：{dish}',
        '{month}月が旬の{name}で作る料理：{dish}',
        'Món ăn từ {name} vào mùa tháng {month}: {dish}',
    ],
    'recipe_reason': [
        'A dish made with {name}: {dish}',
        '用{name}制作的菜肴：{dish}',
        '{name}で作る料理：{dish}',
        'Món ăn từ {name}: {dish}',
    ],
}


def generate(*, root=ROOT, gemma=False):
    entities = []
    extra_phrases = {'요리'}
    for path in sorted((root / 'data/ontology').glob('*.yaml')):
        content = yaml.safe_load(path.read_text())
        entities.extend(content.get('entities', []))
        rules = content.get('rules', {})
        extra_phrases.update(
            rule['reason']
            for rule in (rules.values() if isinstance(rules, dict) else rules)
            if isinstance(rule, dict) and rule.get('reason')
        )
    directory = root / 'data/i18n'
    directory.mkdir(parents=True, exist_ok=True)
    for index, lang in enumerate(LANGUAGES):
        path = directory / f'{lang}.yaml'
        value = yaml.safe_load(path.read_text()) if path.exists() else {}
        value['_meta'] = META.copy()
        names = value.setdefault('entities', {})
        phrases = value.setdefault('phrases', {})
        for source in sorted(extra_phrases):
            entry = phrases.setdefault(source, {'text': '', 'reviewed': False})
            if gemma and not entry['text']:
                translated, ok = translate(source, lang, audit=False)
                if ok:
                    entry.update(text=translated, reviewed=False)
        for entity in entities:
            if entity['type'] in (
                'item',
                'variety',
                'unit',
                'category',
                'recipe',
                'region',
                'store_category',
            ):
                seed = next(iter(entity.get('labels', {}).get(lang, [])), '')
                entry = names.setdefault(entity['id'], {'text': seed, 'reviewed': False})
                if gemma and not entry['text']:
                    translated, ok = translate(entity['name_ko'], lang, audit=False)
                    if ok:
                        entry.update(text=translated, reviewed=False)
            for source in [
                *([entity['name_ko']] if entity['type'] in ('category', 'store_category') else []),
                *(entity.get('attrs', {}).get(key) for key in ('dish_type', 'cook_method')),
            ]:
                if not source:
                    continue
                entry = phrases.setdefault(source, {'text': '', 'reviewed': False})
                if gemma and not entry['text']:
                    translated, ok = translate(source, lang, check=False, audit=False)
                    if ok:
                        entry.update(text=translated, reviewed=False)
            for criterion in entity.get('criteria', []):
                key = f'crit:{entity["id"].removeprefix("item:")}-{criterion["key"]}'
                entry = names.setdefault(key, {'text': '', 'reviewed': False})
                if gemma and not entry['text']:
                    translated, ok = translate(criterion['text'], lang, audit=False)
                    if ok:
                        entry.update(text=translated, reviewed=False)
            for relation in entity.get('relations', []):
                for key in ('label', 'note', 'period_label'):
                    source = (relation.get('v') or {}).get(key)
                    if not source:
                        continue
                    entry = phrases.setdefault(source, {'text': '', 'reviewed': False})
                    if gemma and not entry['text']:
                        translated, ok = translate(source, lang, audit=False)
                        if ok:
                            entry.update(text=translated, reviewed=False)
        value.setdefault('templates', {}).update(
            {k: {'text': v[index], 'reviewed': False} for k, v in TEMPLATES.items()}
        )
        path.write_text(yaml.safe_dump(value, allow_unicode=True, sort_keys=False))
        locales = root / 'frontend/src/i18n/locales'
        ko = json.loads((locales / 'ko.json').read_text())
        target = locales / f'{lang}.json'
        existing = json.loads(target.read_text()) if target.exists() else {}
        draft = {'_meta': META.copy()}
        for key, source in ko.items():
            current = existing.get(key) or source
            if gemma and current == source:
                translated, ok = translate(source, lang, check=False, audit=False)
                if ok:
                    current = translated
            if placeholders(source) != placeholders(current):
                raise ValueError(f'{lang}:{key}: placeholder mismatch')
            draft[key] = current
        target.write_text(json.dumps(draft, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gemma', action='store_true')
    generate(gemma=parser.parse_args().gemma)
