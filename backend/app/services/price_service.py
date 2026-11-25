"""기준시세 조회와 온톨로지 판매 단위 환산."""

from datetime import date

from app.core.errors import AppError
from app.db.repositories import knowledge_repo, price_repo, store_repo
from app.schemas.price import MarketPrice, PriceResponse, PriceStat


def get_price(conn, item_id, *, market_id=None, on_date=None, unit_id=None, seen_price=None):
    if knowledge_repo.get_item(conn, item_id) is None:
        raise AppError('ITEM_NOT_FOUND', '품목을 찾을 수 없습니다.', 404)
    market = store_repo.get_market(conn, market_id) if market_id else None
    if market_id and market is None:
        raise AppError('MARKET_NOT_FOUND', '시장을 찾을 수 없습니다.', 404)
    today = on_date or date.today()
    baseline = price_repo.baseline(
        conn,
        item_id,
        on_date=today,
        sgg_nm=market.get('at_sgg_nm') if market else None,
        market_at_cd=market.get('at_mrkt_cd') if market else None,
    )
    if baseline is None:
        raise AppError('PRICE_NOT_FOUND', '최근 기준시세가 없습니다.', 404)
    units = price_repo.sale_units(conn, item_id)
    target = (
        next((u for u in units if u['id'] == unit_id), None)
        if unit_id
        else next((u for u in units if (u['props'] or {}).get('default')), None)
    )
    multiplier = 1
    # Preserve the complete survey denomination when no existing unit ID represents it.
    raw_unit = baseline['unit'] or ''
    size = baseline['unit_sz'] or '1'
    unit = f'{size}{raw_unit}'
    represented = price_repo.observation_unit_id(conn, raw_unit, size)
    if represented:
        unit = represented
    if target:
        try:
            survey_size = float(size)
        except (TypeError, ValueError):
            survey_size = 0
        props = {}
        if raw_unit in ('kg', 'g'):
            props['factor_kg'] = survey_size * (0.001 if raw_unit == 'g' else 1)
        elif raw_unit in ('개', '포기', '마리', '송이', '손'):
            props['count'] = survey_size
        factor = unit_multiplier({'id': 'survey', 'props': props}, target)
        if factor is not None:
            multiplier = factor
            unit = target['id']
    reference = baseline['traditional'] or baseline['all']
    reference_price = round(reference['avg'] * multiplier)
    fallback = (
        'national_avg'
        if baseline['scope'] == 'national'
        else 'region_avg'
        if baseline['traditional'] is None
        else None
    )
    if (today - baseline['exmn_ymd']).days > 7:
        fallback = 'last_valid'
    values = {
        'item_id': item_id,
        'unit': unit,
        'reference_price': reference_price,
        'diff_pct': round((seen_price - reference_price) / reference_price * 100)
        if seen_price is not None
        else None,
        'region': market['at_sgg_nm'] if baseline['scope'] == 'region' else '전국',
        'observed_on': baseline['exmn_ymd'],
        'fallback': fallback,
        'source': f'aT 기간별 소매가격 · {baseline["exmn_ymd"].isoformat()} 조사',
        'by_market_type': {
            group: PriceStat(
                price=round(baseline[group]['avg'] * multiplier), count=baseline[group]['n']
            )
            for group in ('traditional', 'large_retail')
            if baseline[group]
        },
    }
    if seen_price is not None:
        values['seen_price'] = seen_price
    if baseline['this_market']:
        values['this_market'] = MarketPrice(
            price=round(baseline['this_market']['price'] * multiplier), name=market['name_ko']
        )
    return PriceResponse(**values)


def unit_multiplier(source, target):
    """Convert one sale unit using the same kg/count ontology denominations as baselines."""
    if source['id'] == target['id']:
        return 1

    def amount(unit, key):
        implicit = {'unit:kg': 1, 'unit:g': 0.001} if key == 'factor_kg' else {}
        try:
            return float((unit.get('props') or {}).get(key, implicit.get(unit['id'], 0)))
        except (TypeError, ValueError):
            return 0

    for key in ('factor_kg', 'count'):
        a, b = amount(source, key), amount(target, key)
        if a > 0 and b > 0:
            return b / a
    return None
