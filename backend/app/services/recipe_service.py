"""Recipe shopping cards: deterministic rules and unchanged source instructions."""

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.errors import AppError
from app.db.repositories import recipe_repo, store_repo
from app.knowledge import i18n
from app.knowledge.recipes import body_parts, parse_ingredients, rules
from app.llm.factory import get_embedder

logger = logging.getLogger(__name__)

CATEGORY_ALIASES = {
    '과일': ('store_category:fruit', 'store_category:produce'),
    '채소': ('store_category:vegetable', 'store_category:produce'),
    '정육': ('store_category:meat',),
    '수산': ('store_category:seafood',),
    '반찬': ('store_category:side_dish',),
    '떡': ('store_category:snack',),
    '건어물': ('store_category:dried',),
}


def minimum_stores(choices):
    """Exact set cover, branching on the ingredient with the fewest sellers."""
    pending = {frozenset(c) for c in choices if c}
    best = set().union(*pending) if pending else set()

    visited = {}

    def visit(left, selected):
        nonlocal best
        if not left:
            if len(selected) < len(best):
                best = selected
            return
        if len(selected) >= len(best):
            return
        key = frozenset(left)
        if visited.get(key, len(best) + 1) <= len(selected):
            return
        visited[key] = len(selected)
        target = min(left, key=lambda c: (len(c), sorted(c)))
        for store in sorted(target, key=lambda s: (-sum(s in c for c in left), s)):
            visit({c for c in left if store not in c}, selected | {store})

    visit(pending, set())
    return len(best)


def _ro(name):
    """'로/으로': 받침이 없거나 ㄹ 받침이면 '로' (사과로·귤로), 그 밖의 받침은 '으로' (단감으로)."""
    last = (name or ' ')[-1]
    if not '가' <= last <= '힣':
        return '로'
    final = (ord(last) - 0xAC00) % 28
    return '로' if final in (0, 8) else '으로'


def reason(name, dish, months, month, weather, tags, *, lang='ko', conn=None, item_id=None):
    dish = '요리' if not dish or dish == '기타' else dish
    translated_dish = i18n.text(dish, lang, dish, section='phrases')
    rule = rules('weather_rules')['rules'].get(weather, {})
    if weather in tags and rule.get('reason'):
        original = f'{rule["reason"]} {dish}'
        prefix = i18n.text(rule['reason'], lang, '', section='phrases')
        if lang == 'ko' or not prefix:
            return original
        localized = f'{prefix} {translated_dish}'
        # 한 조각이라도 번역이 없어 한국어가 섞이면 섞인 문장 대신 한국어 원문 전체
        return original if _has_hangul(localized) else localized
    original = (
        f'{str(month) + "월 제철 " if month in months else ""}{name}{_ro(name)} 만드는 {dish}'
    )
    if lang == 'ko':
        return original
    localized = i18n.template(
        'recipe_season_reason' if month in months else 'recipe_reason',
        lang,
        original,
        name=i18n.label(conn, item_id, lang, name),
        dish=translated_dish,
        month=month,
    )
    return original if _has_hangul(localized) else localized


def _has_hangul(text):
    return any('가' <= ch <= '힣' for ch in text or '')


def _card(row, stores, assortment, month, weather):
    lines, steps = body_parts(row['body'])
    ingredients = parse_ingredients(row['name'], lines)
    choices = []
    for ingredient in ingredients:
        if ingredient['where'] == 'item':
            sellers = {
                s['id'] for s in stores if ingredient['item_id'] in assortment.get(s['id'], set())
            }
        elif ingredient['where'] == 'category':
            cat = ingredient['store_category']
            sellers = {
                s['id']
                for s in stores
                if s.get('store_category_id') in CATEGORY_ALIASES.get(cat, (cat,))
            }
        else:
            sellers = set()
        ingredient['stores'] = len(sellers)
        choices.append(sellers)
    props, attrs = row['props'], row['attrs']
    main_id = props.get('main_item_id')
    main_name = row.get('main_item_name') or row['name']
    source = {
        'title': row['source_title'],
        'publisher': row['publisher'],
        'url': row['url'],
        'license': row['license'],
    }
    return {
        'recipe_id': row['recipe_id'],
        'name': row['name'],
        'dish_type': attrs.get('dish_type', ''),
        'cook_method': attrs.get('cook_method', ''),
        'kcal': attrs.get('kcal'),
        'main_item_id': main_id,
        'reason': reason(
            main_name or row['name'],
            attrs.get('dish_type', ''),
            props.get('season_months', []),
            month,
            weather,
            props.get('weather_tags', []),
        ),
        'coverage': {
            'total': len(ingredients),
            'in_market': sum(bool(c) for c in choices),
            'stores': minimum_stores(choices),
        },
        'ingredients': ingredients,
        'source': source,
        'steps': steps,
        'ingredient_lines': lines,
    }


def find_recipes(
    conn,
    *,
    item_id=None,
    market_id=None,
    month=None,
    weather=None,
    q=None,
    limit=3,
    embedder=None,
    recipe_id=None,
    lang='ko',
):
    month = month or datetime.now(ZoneInfo('Asia/Seoul')).month
    if market_id and not store_repo.get_market(conn, market_id):
        raise AppError('MARKET_NOT_FOUND', '시장을 찾을 수 없습니다.', 404)
    stores = (
        [s for s in store_repo.list_stores(conn, market_id) if s['active']] if market_id else []
    )
    assortment = {}
    for item in store_repo.market_items(conn, market_id) if market_id else []:
        assortment.setdefault(item['store_id'], set()).add(item['item_id'])
    rows = recipe_repo.candidates(conn, item_id, month, weather, recipe_id)
    cards = [_card(r, stores, assortment, month, weather) for r in rows]
    by_id = {r['recipe_id']: r for r in rows}
    # SQL determines main-item eligibility; metadata and coverage determine structural order.
    cards.sort(
        key=lambda c: (
            -int(month in by_id[c['recipe_id']]['props'].get('season_months', [])),
            -int(weather in by_id[c['recipe_id']]['props'].get('weather_tags', [])),
            -c['coverage']['in_market'],
            c['coverage']['stores'],
            c['recipe_id'],
        )
    )
    if q and q.strip() and cards:
        try:
            # Savepoint protects the structural fallback if the vector query fails.
            with conn.transaction():
                vector = (embedder or get_embedder()).embed([q], task='query')[0]
                keys = [by_id[c['recipe_id']]['attrs']['doc_key'] for c in cards]
                ranked = recipe_repo.vector_order(conn, keys, vector)
            order = {key: i for i, key in enumerate(ranked)}
            cards.sort(
                key=lambda c: order.get(by_id[c['recipe_id']]['attrs']['doc_key'], len(order))
            )
        except Exception:  # noqa: BLE001 - embedding unavailable: keep structural order
            logger.info('Recipe vector ranking unavailable; kept structural order')
    for card in cards:
        if recipe_id is None:
            card.pop('steps')
            card.pop('ingredient_lines')
    if lang != 'ko':
        for card in cards:
            row = by_id[card['recipe_id']]
            card['reason'] = reason(
                row.get('main_item_name') or card['name'],
                card['dish_type'],
                row['props'].get('season_months', []),
                month,
                weather,
                row['props'].get('weather_tags', []),
                lang=lang,
                conn=conn,
                item_id=card['main_item_id'],
            )
            for key in ('dish_type', 'cook_method'):
                card[key] = i18n.text(card[key], lang, card[key], section='phrases')
        cards = i18n.localize(conn, cards, lang)
    return cards[:limit]


def get_recipe(conn, recipe_id, **kwargs):
    cards = find_recipes(conn, recipe_id=recipe_id, **kwargs)
    if not cards:
        raise AppError('RECIPE_NOT_FOUND', '레시피를 찾을 수 없습니다.', 404)
    return cards[0]
