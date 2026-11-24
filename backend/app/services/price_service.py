"""기준시세 조회와 온톨로지 판매 단위 환산."""

from datetime import date
from app.core.errors import AppError
from app.db.repositories import price_repo, store_repo
from app.schemas.price import PriceView


def get_price(conn, item_id, *, market_id=None, on_date=None, unit_id=None) -> PriceView:
    market = store_repo.get_market(conn, market_id) if market_id else None
    if market_id and market is None:
        raise AppError('MARKET_NOT_FOUND', '시장을 찾을 수 없습니다.', 404)
    baseline = price_repo.baseline(
        conn,
        item_id,
        on_date=on_date or date.today(),
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
    converted = False
    if target and baseline['unit'] in ('kg', 'g'):
        try:
            kg = float(baseline['unit_sz']) * (0.001 if baseline['unit'] == 'g' else 1)
            factor = float((target['props'] or {}).get('factor_kg', 0))
        except (ValueError, TypeError):
            kg = factor = 0
        if kg > 0 and factor > 0:
            multiplier = factor / kg
            for group in ('traditional', 'large_retail', 'all'):
                if baseline[group]:
                    baseline[group] = {
                        k: v if k == 'n' else v * multiplier for k, v in baseline[group].items()
                    }
            if baseline['this_market']:
                baseline['this_market'] = baseline['this_market'] | {
                    'price': baseline['this_market']['price'] * multiplier
                }
            baseline.update(unit=target['name_ko'], unit_sz='1', unit_id=target['id'])
            converted = True
    return PriceView(
        item_id=item_id,
        converted=converted,
        source=f'aT 기간별 소매가격, {baseline["exmn_ymd"].isoformat()} 조사',
        **baseline,
    )
