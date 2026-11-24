"""Pure aggregation boundaries and source precedence; no database needed."""

from datetime import UTC, datetime, timedelta
import pytest
from app.services.store_price_service import aggregate

NOW = datetime(2026, 11, 24, 6, tzinfo=UTC)
UNITS = [
    dict(id='unit:piece', props={'count': 1}),
    dict(id='unit:bunch', props={'factor_kg': 0.8}),
    dict(id='unit:kg', props={'factor_kg': 1}),
]


def report(price=1800, device='a', hours=0, **changes):
    return (
        dict(
            id=1,
            store_id='s',
            device_hash=device,
            price=price,
            quantity=1,
            unit_id='unit:piece',
            reported_at=NOW - timedelta(hours=hours),
        )
        | changes
    )


def run(rows, confirmations=(), unit='unit:piece'):
    return aggregate(rows, confirmations, UNITS, unit, now=NOW)


def test_latest_device_outliers_and_contract():
    customers, shown = run([report(100, hours=1), report(), report(2000, 'b'), report(9000, 'c')])
    assert shown == customers
    assert shown['price'] == 1900 and shown['reporters'] == 2
    assert set(shown) == {
        'price',
        'unit',
        'source',
        'reporters',
        'latest_at',
        'stale',
        'merchant_confirmed',
    }
    assert run([report(100), report(9000, 'b')])[1]['reporters'] == 2


def test_window_stale_and_seoul_midnight():
    assert run([report(hours=169)])[1] is None
    assert run([report(hours=24)])[1]['stale']
    assert not run([report(hours=14)])[1]['stale']
    assert run([report(hours=15.1)])[1]['stale']
    assert run([report(store_id=None)])[1] is None


@pytest.mark.parametrize(
    ('row', 'unit', 'expected'),
    [
        (report(5000, quantity=3), 'unit:piece', 1667),
        (report(5000, unit_id='unit:kg'), 'unit:bunch', 4000),
        (report(5000, unit_id='unit:piece'), 'unit:bunch', None),
    ],
)
def test_conversion(row, unit, expected):
    shown = run([row], unit=unit)[1]
    assert (shown['price'] if shown else None) == expected


def test_confirmation_precedence_and_expiry():
    confirmation = dict(price=2000, unit_id='unit:piece', confirmed_at=NOW - timedelta(hours=1))
    assert run([report(hours=2)], [confirmation])[1]['source'] == 'merchant'
    customers, shown = run([report()], [confirmation])
    assert shown['source'] == 'customers' and customers['merchant_confirmed']
    assert run([], [confirmation])[1]['reporters'] == 0
    assert run([], [confirmation | {'confirmed_at': NOW - timedelta(days=8)}])[1] is None
    # A filtered outlier is still the latest customer report for precedence.
    rows = [report(1800, 'a', 2), report(1800, 'b', 2), report(9000, 'c')]
    assert run(rows, [confirmation])[1]['source'] == 'customers'


def test_missing_quantity_counts_as_one_unit():
    # 직접 입력 제보는 quantity가 NULL로 저장돼요
    _, shown = run([report(2500, 'a', quantity=None), report(2400, 'b', quantity=None)])
    assert shown['price'] == 2450 and shown['reporters'] == 2
