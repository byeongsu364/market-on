"""오프라인 aT 계약, 판매 단위 환산 및 수집 검증."""

import json
import logging
from datetime import date
from pathlib import Path
from unittest.mock import Mock
import httpx
import pytest
from app.clients import at_price
from app.core import http
from app.core.errors import AppError
from app.db.repositories import price_repo
from scripts.update_prices import update_prices

FIXTURES = Path(__file__).parent / 'fixtures'


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(at_price.settings, 'DATA_GO_KR_KEY', 'test-secret')
    monkeypatch.setattr(at_price, '_last_call', None)
    monkeypatch.setattr(at_price.time, 'sleep', Mock())


def fetch():
    return at_price.fetch_period_retail(
        '200', '246', '00', start=date(2026, 11, 20), end=date(2026, 11, 22)
    )


def payload():
    return json.loads((FIXTURES / 'at_period_retail_green_onion.json').read_text())


def test_pages_single_item_and_spacing(configured, monkeypatch):
    first = payload()
    rows = first['response']['body']['items']['item']
    first['response']['body']['items']['item'] = rows[:9]
    second = payload()
    second['response']['body']['items']['item'] = rows[9]
    call = Mock(side_effect=[Mock(json=lambda: first), Mock(json=lambda: second)])
    monkeypatch.setattr(http, 'get_sync', call)
    assert len(fetch()) == 10
    assert [c.kwargs['params']['pageNo'] for c in call.call_args_list] == [1, 2]
    assert call.call_args.kwargs['params']['cond[exmn_ymd::GTE]'] == '20261120'
    assert at_price.time.sleep.call_args.args[0] > 1


def test_retry_and_error(configured, monkeypatch):
    error = json.loads((FIXTURES / 'at_period_retail_error.json').read_text())
    call = Mock(return_value=Mock(json=lambda: error))
    monkeypatch.setattr(http, 'get_sync', call)
    with pytest.raises(AppError) as exc:
        fetch()
    assert exc.value.code == 'AT_API_ERROR'
    assert call.call_count == 3
    assert [c.args for c in at_price.time.sleep.call_args_list].count((30,)) == 2
    call.side_effect = [Mock(json=lambda: error), Mock(json=payload)]
    assert len(fetch()) == 10


def test_missing_key(monkeypatch):
    monkeypatch.setattr(at_price.settings, 'DATA_GO_KR_KEY', None)
    with pytest.raises(AppError) as exc:
        fetch()
    assert exc.value.code == 'AT_NOT_CONFIGURED'


def test_key_log_masking(configured, monkeypatch, caplog):
    transport = httpx.MockTransport(lambda req: httpx.Response(200, json=payload()))
    real_client = httpx.Client
    monkeypatch.setattr(http.httpx, 'Client', lambda **kw: real_client(transport=transport, **kw))
    with caplog.at_level(logging.INFO):
        fetch()
    assert 'test-secret' not in caplog.text
    assert 'serviceKey=***' in caplog.text


def test_collect_and_continue(configured, monkeypatch):
    monkeypatch.setattr(price_repo, 'varieties', lambda *a: [])
    entities = [
        dict(
            id='item:green_onion',
            type='item',
            kamis=dict(ctgry_cd='200', item_cd='246', vrty_cd='00'),
        ),
        dict(id='item:bad', type='item', kamis={}),
    ]
    monkeypatch.setattr(price_repo, 'kamis_entities', lambda c: entities)
    monkeypatch.setattr(
        at_price,
        'fetch_period_retail',
        lambda *a, **kw: payload()['response']['body']['items']['item'],
    )
    saved = Mock(return_value=(8, 0))
    monkeypatch.setattr(price_repo, 'upsert_observations', saved)
    result = update_prices(None, end=date(2026, 11, 22))
    assert result['item:green_onion'] == dict(received=10, added=8, changed=0, skipped=2)
    assert 'error' in result['item:bad']
    rows = saved.call_args.args[1]
    assert rows[0]['item_id'] == 'item:green_onion'
    assert rows[4]['market_type'] == 'wholesale'


def test_non_retry_error_and_single_empty(configured, monkeypatch):
    error = {'OpenAPI_ServiceResponse': {'cmmMsgHeader': {'errMsg': 'INVALID_KEY test-secret'}}}
    call = Mock(return_value=Mock(json=lambda: error))
    monkeypatch.setattr(http, 'get_sync', call)
    with pytest.raises(AppError) as exc:
        fetch()
    assert 'test-secret' not in str(exc.value) and call.call_count == 1
    monkeypatch.setattr(
        http,
        'get_sync',
        lambda *a, **kw: Mock(
            json=lambda: {'response': {'body': {'totalCount': 0, 'items': None}}}
        ),
    )
    assert fetch() == []


def test_baseline_selection_without_db(monkeypatch):
    rows = [
        dict(
            exmn_ymd=date(2026, 11, 20),
            unit='kg',
            unit_sz='1',
            sgg_nm=region,
            mrkt_cd=code,
            mrkt_nm=name,
            price=price,
            market_type=kind,
        )
        for region, code, name, price, kind in [
            ('서울', '0', '경동', 2500, 'traditional'),
            ('서울', '1', 'B-유통', 2000, 'large_retail'),
            ('부산', '2', '부전', 3000, 'traditional'),
        ]
    ]
    rows.append(rows[0] | dict(exmn_ymd=date(2026, 11, 19), price=1000))
    monkeypatch.setattr(price_repo, 'fetch_rows', lambda *a: rows)
    result = price_repo.baseline(
        None, 'item:green_onion', on_date=date(2026, 11, 22), sgg_nm='서울', market_at_cd='0'
    )
    assert result['traditional']['avg'] == 2500 and result['large_retail']['avg'] == 2000
    assert result['this_market']['price'] == 2500 and result['scope'] == 'region'
    assert (
        price_repo.baseline(None, 'item:green_onion', on_date=date(2026, 11, 22), sgg_nm='제주')[
            'traditional'
        ]['avg']
        == 2750
    )
    monkeypatch.setattr(price_repo, 'fetch_rows', lambda *a: [])
    assert price_repo.baseline(None, 'item:green_onion', on_date=date(2026, 11, 22)) is None


def test_candidate_output_only(tmp_path):
    from scripts.sync_kamis_codes import candidates

    path = tmp_path / 'items.yaml'
    text = 'entities:\n- {id: "item:test", type: item, name_ko: 대파, kamis: null}\n'
    path.write_text(text)
    rows = list(candidates(tmp_path))
    assert rows[0][2]['item_cd'] == '246' and rows[0][2]['vrty_cd'] == '00'
    assert path.read_text() == text
