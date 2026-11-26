"""aT 관측값 일일 수집. 품목별 트랜잭션과 실패 격리."""

import argparse
from datetime import date, datetime, timedelta

from app.clients import at_price
from app.db.pool import connection
from app.db.repositories import price_repo
from app.utils.market_type import classify_market_type

from ._common import run


def observations(rows, entities, code):
    result = []
    skipped = 0
    for row in rows:
        try:
            price = int(str(row.get('exmn_dd_prc', '')).replace(',', ''))
            if price <= 0:
                raise ValueError()
            mapped = [
                e
                for e in entities
                if all(
                    str(e['kamis'].get(k)) == str(row.get(k, code.get(k)))
                    for k in ('ctgry_cd', 'item_cd', 'vrty_cd')
                )
            ]
            item = next((e['id'] for e in mapped if e['type'] == 'item'), None)
            variety_entity = next((e for e in mapped if e['type'] == 'variety'), None)
            variety = variety_entity['id'] if variety_entity else None
            item = variety_entity['item_id'] if variety_entity else item
            if item is None:
                raise ValueError('매핑되지 않은 품목 코드')
            values = {
                k: str(row.get(k, code.get(k, '')))
                for k in (
                    'ctgry_cd',
                    'item_cd',
                    'vrty_cd',
                    'grd_cd',
                    'se_cd',
                    'item_nm',
                    'vrty_nm',
                    'grd_nm',
                    'sgg_nm',
                    'mrkt_cd',
                    'mrkt_nm',
                    'unit',
                    'unit_sz',
                )
            }
            values.update(
                exmn_ymd=datetime.strptime(row['exmn_ymd'].replace('-', ''), '%Y%m%d').date(),
                price=price,
                item_id=item,
                variety_id=variety,
                source='at_period_retail',
                market_type=classify_market_type(values['se_cd'], values['mrkt_nm']),
            )
            result.append(values)
        except (ValueError, TypeError, KeyError):
            skipped += 1
    return result, skipped


def update_prices(conn, *, days=7, end=None, item_id=None):
    if days < 1:
        raise ValueError('days는 양수여야 합니다.')
    at_price.require_key()
    end = end or date.today()
    entities = [e for e in price_repo.kamis_entities(conn) if e['type'] == 'item']
    targets = [e for e in entities if e['type'] == 'item' and (not item_id or e['id'] == item_id)]
    collection = []
    for entity in targets:
        # 예시 품종(attrs.mock, aT 코드 없음)은 aT에서 받을 게 없어 수집 대상에서 빼요 (046)
        children = [c for c in price_repo.varieties(conn, entity['id']) if c.get('kamis')]
        entities.extend(children)
        collection.extend(children or [entity])
    report = {}
    for entity in collection:
        eid, code = entity['id'], entity['kamis']
        parent_id = entity.get('item_id', eid)
        try:
            rows = at_price.fetch_period_retail(
                code['ctgry_cd'],
                code['item_cd'],
                code.get('vrty_cd'),
                start=end - timedelta(days=days - 1),
                end=end,
                grd_cd=str(code.get('grd_cd') or '04'),
            )
            prepared, skipped = observations(rows, entities, code)
            added, changed = price_repo.upsert_observations(conn, prepared)
            totals = report.setdefault(
                parent_id, {'received': 0, 'added': 0, 'changed': 0, 'skipped': 0}
            )
            for key, count in {
                'received': len(rows),
                'added': added,
                'changed': changed,
                'skipped': skipped,
            }.items():
                totals[key] += count
            print(f'{eid}: 받은 행={len(rows)} 추가={added} 변경={changed} 건너뜀={skipped}')
        except Exception as exc:  # noqa: BLE001 -- 한 품종의 실패가 나머지 수집을 막지 않게 격리
            # Client exceptions never include request URLs or credentials.
            message = str(exc).replace(at_price.settings.DATA_GO_KR_KEY or '<unset>', '***')
            report.setdefault(parent_id, {'received': 0, 'added': 0, 'changed': 0, 'skipped': 0})[
                'error'
            ] = message
            print(f'{eid}: 실패 {message}')
    failures = [eid for eid, result in report.items() if 'error' in result]
    print(f'실패한 품목: {", ".join(failures) or "없음"}')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--days', type=int, default=7)
    parser.add_argument('--date', type=date.fromisoformat, default=None)
    parser.add_argument('--item')
    parser.add_argument('--backfill-varieties', action='store_true')
    args = parser.parse_args()
    if args.days < 1:
        parser.error('--days는 양수여야 합니다.')
    if args.backfill_varieties:
        with connection() as conn:
            print(f'품종 백필: {price_repo.backfill_varieties(conn, args.item)}행')
        return
    at_price.require_key()  # Missing key must fail before attempting a DB connection.
    with connection() as conn:
        results = update_prices(conn, days=args.days, end=args.date, item_id=args.item)
    if any('error' in r for r in results.values()):
        raise SystemExit(1)


if __name__ == '__main__':
    run(main)
