"""Market survey fallback and ordering without a database."""

from datetime import UTC, date, datetime
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.core.errors import AppError
from app.services import market_service, store_price_service
from tests import test_items_markets_api

public = test_items_markets_api.public


@pytest.mark.parametrize(
    'observed', [date(2026, 11, 25), datetime.now(store_price_service.SEOUL).date()]
)
def test_average_fills_only_missing_sellers_and_sorts(public, monkeypatch, observed):
    from app.db.repositories import store_repo

    monkeypatch.setattr(
        store_repo,
        'market_items',
        lambda *a: [
            {'store_id': f'store:demo-A{i:02}', 'item_id': 'item:green_onion'} for i in range(5, 9)
        ],
    )

    def actual(conn, row, item, unit):
        source = {
            'store:demo-A06': 'customers',
            'store:demo-A07': 'merchant',
            'store:demo-A08': 'customers',
        }.get(row['id'])
        return None, {
            'price': 1800,
            'unit': unit,
            'source': source,
            'reporters': 1,
            'latest_at': datetime.now(UTC),
            'stale': row['id'] != 'store:demo-A06',
            'merchant_confirmed': source == 'merchant',
        } if source else None

    monkeypatch.setattr(store_price_service, 'store_price', actual)
    get = Mock(
        return_value=SimpleNamespace(
            this_market=SimpleNamespace(price=2000), unit='unit:bunch', observed_on=observed
        )
    )
    monkeypatch.setattr(market_service, 'get_price', get)
    result = market_service.market_map(None, 'market:demo', 'item:green_onion', 'unit:bunch')
    get.assert_called_once_with(
        None, 'item:green_onion', market_id='market:demo', unit_id='unit:bunch'
    )
    assert [s.store_id for s in result.stores[:4]] == [
        'store:demo-A06',
        'store:demo-A07',
        'store:demo-A08',
        'store:demo-A05',
    ]
    average = result.stores[3].price
    assert average.model_dump() == {
        'price': 2000,
        'unit': 'unit:bunch',
        'source': 'market_avg',
        'reporters': 0,
        'latest_at': datetime.combine(
            observed, datetime.min.time(), tzinfo=store_price_service.SEOUL
        ),
        'observed_on': observed,
        'stale': observed < datetime.now(store_price_service.SEOUL).date(),
        'merchant_confirmed': False,
    }
    assert result.stores[0].price.source == 'customers'
    assert result.stores[1].price.source == 'merchant'
    assert all(s.price is None for s in result.stores[4:])


@pytest.mark.parametrize('code', [None, 'PRICE_NOT_FOUND', 'INVALID_UNIT'])
def test_missing_market_survey_and_other_errors(public, monkeypatch, code):
    get = Mock(return_value=SimpleNamespace(this_market=None, reference_price=9999))
    if code:
        get.side_effect = AppError(code, 'test', 422)
    monkeypatch.setattr(market_service, 'get_price', get)
    if code == 'INVALID_UNIT':
        with pytest.raises(AppError, match='test'):
            market_service.market_map(None, 'market:demo', 'item:green_onion')
    else:
        result = market_service.market_map(None, 'market:demo', 'item:green_onion')
        assert all(s.price is None for s in result.stores)
    assert get.call_count == 1
    get.reset_mock()
    market_service.market_map(None, 'market:demo')
    get.assert_not_called()
