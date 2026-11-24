"""Read-time anonymous store price aggregation and merchant precedence."""

from datetime import UTC, datetime, timedelta
from statistics import median
from zoneinfo import ZoneInfo
from app.core.errors import AppError
from app.db.repositories import price_repo
from .price_service import unit_multiplier
from .item_service import get_item

WINDOW_DAYS = 7
OUTLIER_FRACTION = 0.30
SEOUL = ZoneInfo('Asia/Seoul')


def aggregate(reports, confirmations, units, target_id, *, now=None):
    now = now or datetime.now(UTC)
    cutoff = now - timedelta(days=WINDOW_DAYS)
    by_id = {u['id']: u for u in units}
    target = by_id.get(target_id, {'id': target_id})

    def converted(row):
        factor = unit_multiplier(by_id.get(row['unit_id'], {'id': row['unit_id']}), target)
        try:
            # 수량 없이 저장된 제보(직접 입력 등)는 1단위로 봐요
            quantity = float(row.get('quantity') or 1)
        except (TypeError, ValueError):
            return None
        return row['price'] / quantity * factor if factor is not None and quantity > 0 else None

    latest = {}
    for row in sorted(reports, key=lambda r: (r['reported_at'], r.get('id', 0)), reverse=True):
        if not row.get('store_id') or not cutoff <= row['reported_at'] <= now:
            continue
        value = converted(row)
        if value is not None and row.get('device_hash'):
            latest.setdefault(row['device_hash'], (value, row['reported_at']))
    values = list(latest.values())
    if len(values) >= 3:
        middle = median(v for v, _ in values)
        values = [(v, t) for v, t in values if abs(v - middle) <= middle * OUTLIER_FRACTION]
    recent = [c for c in confirmations if cutoff <= c['confirmed_at'] <= now]
    confirmation = max(recent, key=lambda c: (c['confirmed_at'], c.get('id', 0)), default=None)

    def result(price, timestamp, source, reporters):
        return dict(
            price=int(price + 0.5),
            unit=target_id,
            source=source,
            reporters=reporters,
            latest_at=timestamp,
            stale=timestamp.astimezone(SEOUL).date() < now.astimezone(SEOUL).date(),
            merchant_confirmed=bool(confirmation),
        )

    customers = (
        result(median(v for v, _ in values), max(t for _, t in values), 'customers', len(values))
        if values
        else None
    )
    newest_report = max((t for _, t in latest.values()), default=None)
    if confirmation and (newest_report is None or confirmation['confirmed_at'] > newest_report):
        value = converted(confirmation)
        if value is not None:
            return customers, result(value, confirmation['confirmed_at'], 'merchant', 0)
    return customers, customers


def store_price(conn, store, item_id, unit=None, *, reports=None):
    item = get_item(conn, item_id)
    target = unit or item.default_unit
    if target not in item.units:
        raise AppError('INVALID_UNIT', '판매 단위를 확인하세요.', 422)
    units = price_repo.sale_units(conn, item_id)
    reports = (
        reports
        if reports is not None
        else price_repo.list_reports(
            conn,
            store['market_id'],
            item_id,
            since=datetime.now(UTC) - timedelta(days=WINDOW_DAYS),
        )
    )
    return aggregate(
        [r for r in reports if r['store_id'] == store['id']],
        price_repo.store_confirmations(conn, store['id'], item_id),
        units,
        target,
    )
