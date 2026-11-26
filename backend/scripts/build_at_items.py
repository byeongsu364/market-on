"""047: 고정된 aT/NICS 입력만 사용하는 결정적 품목 생성기 (네트워크·DB 없음)."""

import json
import re
from datetime import date
from pathlib import Path

import yaml

DATA = Path(__file__).resolve().parents[2] / 'data'
# aT 이름 순서에 의존하지 않는 명시적 코드 → 영어 슬러그 표.
SLUGS = dict(
    zip(
        [
            '111',
            '112',
            '141',
            '142',
            '143',
            '151',
            '152',
            '115',
            '121',
            '113',
            '211',
            '212',
            '213',
            '214',
            '215',
            '221',
            '223',
            '224',
            '225',
            '226',
            '231',
            '232',
            '233',
            '241',
            '242',
            '243',
            '258',
            '245',
            '246',
            '247',
            '251',
            '252',
            '253',
            '254',
            '255',
            '256',
            '257',
            '248',
            '216',
            '422',
            '279',
            '280',
            '312',
            '314',
            '315',
            '316',
            '317',
            '318',
            '319',
            '411',
            '412',
            '416',
            '418',
            '424',
            '420',
            '428',
            '415',
            '421',
            '414',
            '430',
            '429',
            '437',
            '4301',
            '4304',
            '4401',
            '4402',
            '9901',
            '9903',
            '9908',
            '611',
            '638',
            '640',
            '641',
            '642',
            '644',
            '649',
            '650',
            '651',
            '652',
            '653',
            '654',
            '612',
            '619',
            '613',
            '615',
            '614',
            '660',
            '659',
            '658',
            '656',
            '616',
            '662',
            '661',
            '664',
            '665',
        ],
        [
            'rice',
            'glutinous_rice',
            'soybean',
            'red_bean',
            'mung_bean',
            'sweet_potato',
            'potato',
            'brown_rice',
            'barley',
            'mixed_grains',
            'napa_cabbage',
            'cabbage',
            'spinach',
            'lettuce',
            'young_napa_cabbage',
            'watermelon',
            'cucumber',
            'squash',
            'tomato',
            'strawberry',
            'radish',
            'carrot',
            'young_radish',
            'dried_chili',
            'green_chili',
            'red_chili',
            'peeled_garlic',
            'onion',
            'green_onion',
            'ginger',
            'eggplant',
            'water_dropwort',
            'perilla_leaves',
            'chives',
            'bell_pepper',
            'paprika',
            'melon',
            'chili_powder',
            'mustard_greens',
            'cherry_tomato',
            'baby_napa_cabbage',
            'broccoli',
            'sesame',
            'peanut',
            'oyster_mushroom',
            'enoki_mushroom',
            'king_oyster_mushroom',
            'walnut',
            'almond',
            'apple',
            'pear',
            'sweet_persimmon',
            'banana',
            'lemon',
            'pineapple',
            'mango',
            'mandarin',
            'orange',
            'grape',
            'avocado',
            'blueberry',
            'kiwi',
            'beef',
            'pork',
            'imported_beef',
            'imported_pork',
            'chicken',
            'egg',
            'milk',
            'mackerel',
            'dried_anchovy',
            'dried_squid',
            'laver',
            'dried_seaweed',
            'oyster',
            'imported_croaker',
            'salted_shrimp',
            'anchovy_sauce',
            'sea_salt',
            'abalone',
            'shrimp',
            'saury',
            'squid',
            'hairtail',
            'pollock',
            'croaker',
            'dried_kelp',
            'scallop',
            'mussel',
            'blue_crab',
            'spanish_mackerel',
            'mackerel_fillet',
            'clam',
            'octopus',
            'cockle',
        ],
        strict=True,
    )
)
CATEGORIES = {
    '100': 'grain',
    '200': 'vegetable',
    '300': 'special',
    '400': 'fruit',
    '500': 'livestock',
    '600': 'seafood',
}
UNIT_NAMES = {
    'kg': 'kg',
    'g': 'g',
    '개': 'piece',
    '포기': 'head',
    '마리': 'fish',
    '손': 'pair',
    '장': 'sheet',
    '구': 'egg',
    'L': 'liter',
}
DRIED = {
    'sesame',
    'peanut',
    'walnut',
    'almond',
    'dried_chili',
    'chili_powder',
    'dried_anchovy',
    'dried_squid',
    'laver',
    'dried_seaweed',
    'dried_kelp',
    'salted_shrimp',
    'anchovy_sauce',
    'sea_salt',
}
SIDE = {
    'rice',
    'glutinous_rice',
    'brown_rice',
    'barley',
    'mixed_grains',
    'soybean',
    'red_bean',
    'mung_bean',
    'egg',
    'milk',
}


def category(item):
    # 장 보는 사람 기준: 감자·고구마·버섯은 채소.
    slug = SLUGS[item['item_cd']]
    return (
        'vegetable'
        if slug in {'potato', 'sweet_potato'} or slug.endswith('_mushroom')
        else CATEGORIES[item['ctgry_cd']]
    )


def unit_info(unit, size):
    size = str(int(size))
    stem = UNIT_NAMES[unit]
    uid = f'unit:{stem}' + (size if size != '1' else '')
    label = unit if size == '1' else size + unit
    props = (
        {'factor_kg': int(size) * (0.001 if unit == 'g' else 1)}
        if unit in ('kg', 'g')
        else {'volume_l': int(size)}
        if unit == 'L'
        else {'count': int(size) * (2 if unit == '손' else 1)}
    )
    return uid, label, props


def section(text, heading):
    """해당 ■ 단락만, 원문 내부 띄어쓰기·문장·어미를 보존한다."""
    match = re.search(r'■\s*' + heading + r'\s*', text)
    if not match:
        return []
    paragraph = text[match.end() :].split('■', 1)[0]
    lines = [s.strip() for s in re.split(r'\s*-\s+(?=\S)|\n', paragraph) if s.strip()]
    # 항목 줄을 유지하되, 안에 섞인 영양·효능 문장만 제외한다.
    forbidden = r'영양|효능|효과|질병|항암|비타민|피로|흡수|건강'
    result = []
    for line in lines:
        if re.search(forbidden, line):
            result.extend(
                s for s in re.split(r'(?<=[.!?])\s+', line) if not re.search(forbidden, s)
            )
        else:
            result.append(line)
    return result


def dump(value):
    return yaml.safe_dump(value, allow_unicode=True, sort_keys=False, width=110)


def build(data_dir=DATA):
    raw = json.loads((data_dir / 'kamis/at_retail_items_20261127.json').read_text())['items']
    mapping = json.loads((data_dir / 'kamis/month_food_map_20261127.json').read_text())['items']
    existing = yaml.safe_load((data_dir / 'ontology/items.yaml').read_text())['entities']
    skip = {
        (e['kamis']['ctgry_cd'], e['kamis']['item_cd']) for e in existing if e['type'] == 'item'
    }
    entities = [
        {
            'id': f'cat:{slug}',
            'type': 'category',
            'name_ko': name,
            'labels': {'ko': [name]},
            'attrs': {},
        }
        for slug, name in [
            ('grain', '곡물'),
            ('special', '특용작물'),
            ('livestock', '축산물'),
            ('seafood', '수산물'),
        ]
    ]
    units = {e['id'] for e in existing if e['type'] == 'unit'}
    new_units, source_blocks, source_by_sn, rules = {}, [], {}, []
    for item in raw:
        slug = SLUGS[item['item_cd']]
        cat = category(item)
        store = (
            'dried'
            if slug in DRIED
            else 'side_dish'
            if slug in SIDE
            else 'produce'
            if cat in ('vegetable', 'fruit')
            else 'meat'
            if cat == 'livestock'
            else 'seafood'
        )
        rules.append(
            {
                'item': f'item:{slug}',
                'store_category': f'store_category:{store}',
                'source': 'src:team-draft',
            }
        )
        if (item['ctgry_cd'], item['item_cd']) in skip:
            continue
        name = re.sub(r'\([^)]*\)', '', item['item_nm']).strip()
        default = max(item['varieties'], key=lambda v: sum(g['rows'] for g in v['grades']))
        varieties, sold = [], {}
        for variety in item['varieties']:
            grade = max(variety['grades'], key=lambda g: g['rows'])
            kamis = {k: item[k] for k in ('ctgry_cd', 'item_cd')}
            kamis.update(
                vrty_cd=variety['vrty_cd'], **{k: grade[k] for k in ('grd_cd', 'unit', 'unit_sz')}
            )
            vid = f'variety:{slug}-{variety["vrty_cd"]}'
            varieties.append(
                {
                    'id': vid,
                    'type': 'variety',
                    'name_ko': variety['vrty_nm'],
                    'labels': {'ko': [variety['vrty_nm']]},
                    'kamis': kamis,
                    'attrs': {},
                }
            )
            for g in variety['grades']:
                uid, label, props = unit_info(g['unit'], g['unit_sz'])
                sold[uid] = {'p': 'soldBy', 'o': uid, 'props': props}
                if uid not in units:
                    new_units[uid] = {
                        'id': uid,
                        'type': 'unit',
                        'name_ko': label,
                        'labels': {'ko': [label]},
                        'attrs': {'observation_unit': g['unit'], 'observation_size': g['unit_sz']},
                    }
        default_code = next(
            v['kamis'] for v in varieties if v['id'].endswith('-' + default['vrty_cd'])
        )
        default_unit = unit_info(default_code['unit'], default_code['unit_sz'])[0]
        sold[default_unit]['props']['default'] = True
        relations = (
            [{'p': 'isA', 'o': f'cat:{cat}'}]
            + [
                {
                    'p': 'hasGrade',
                    'o': v['id'],
                    'props': {'default': v['id'].endswith('-' + default['vrty_cd'])},
                }
                for v in varieties
            ]
            + list(sold.values())
        )
        entity = {
            'id': f'item:{slug}',
            'type': 'item',
            'name_ko': name,
            'labels': {'ko': [name], 'en': [slug.replace('_', ' ')]},
            'kamis': default_code,
            'attrs': {},
            'relations': relations,
        }
        food = mapping.get(f'{item["ctgry_cd"]}-{item["item_cd"]}')
        if food:
            sn = food['fdmtSn']
            source = source_by_sn.get(sn)
            if source is None:
                source = f'src:nics-month-food-{slug.replace("_", "-")}'
                source_by_sn[sn] = source
                source_blocks.append(
                    f'# fdmtSn {sn}\n'
                    + dump(
                        {
                            source: {
                                'title': f'농식품 이달의 식재료 - {food["fdmtNm"]}',
                                'publisher': '농촌진흥청 국립식량과학원 (공공데이터포털)',
                                'url': 'https://www.data.go.kr/data/15168024/openapi.do',
                                'license': '공공데이터포털 이용허락범위 제한 없음',
                                'kind': 'public_api',
                                'retrieved_at': date(2026, 11, 27),
                            }
                        }
                    )
                )
            if food['fdmtNm'] != name:
                entity['labels']['ko'].append(food['fdmtNm'])
            entity['attrs']['criteria_style'] = 'source_quote'
            relations.extend(
                {'p': 'inSeason', 'o': f'season:{month:02}', 'source': source}
                for month in food['months']
            )
            info = json.loads((data_dir / f'raw/nics/{sn}.json').read_text())['response']['body'][
                'stdInfo'
            ]
            purchase = section(info.get('prchCheatDtl', ''), '구입요령')
            entity['criteria'] = [
                {'key': f'p{n}', 'text': text, 'source': source}
                for n, text in enumerate(purchase[:4], 1)
            ]
            folder = data_dir / 'rag_docs' / slug
            folder.mkdir(parents=True, exist_ok=True)
            for kind, heading in [
                ('criterion', '구입요령'),
                ('storage', '보관법'),
                ('prep', '손질법'),
            ]:
                lines = (
                    purchase
                    if kind == 'criterion'
                    else section(info.get('cstdyMthDtl', ''), heading)
                )
                if lines:
                    front = {
                        'source': source,
                        'doc_type': kind,
                        'lang': 'ko',
                        'title': f'{name} {heading}',
                        'entities': [entity['id']],
                        'store_id': None,
                        'review_status': 'draft',
                    }
                    (folder / f'{kind}.md').write_text(
                        '---\n'
                        + dump(front)
                        + '---\n> 원문 옮김 · 검수 전 (자동 생성 2026-11-27)\n\n'
                        + '\n'.join('- ' + s for s in lines)
                        + f'\n\n출처: 농식품 이달의 식재료 - {food["fdmtNm"]} (농촌진흥청 국립식량과학원, 공공데이터포털)\n'
                    )
        entities.extend([entity, *varieties])
    entities.extend(new_units[k] for k in sorted(new_units))
    (data_dir / 'ontology/items_at.yaml').write_text(
        '# 자동 생성: python -m scripts.build_at_items · 감자·고구마·버섯은 장보기 기준 채소\n'
        + dump({'entities': entities})
    )
    (data_dir / 'ontology/item_store_categories.yaml').write_text(
        '# 팀 작성 대표 업종 규칙 · 실측 판매 품목 아님\n'
        + dump({'entities': [], 'item_store_categories': rules})
    )
    sources_path = data_dir / 'sources.yaml'
    marker = '# BEGIN GENERATED AT ITEMS (047)\n'
    original = sources_path.read_text().split(marker)[0].rstrip() + '\n'
    sources_path.write_text(original + marker + ''.join(source_blocks))
    return entities


if __name__ == '__main__':
    build()
