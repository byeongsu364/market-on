"""036: sourced metadata, weekly boundaries and merchant variety validation."""

from datetime import date, timedelta

import pytest
import yaml

from app.db.repositories import knowledge_repo, price_repo
from app.services import price_service
from scripts._common import DATA
from tests.test_price_contract import api, QUERY, row
from tests.test_merchant_api import merchant, sale_payload
from tests.test_auth_api import memory, HEADER


def test_exact_descriptions_and_sources():
    entities = yaml.safe_load((DATA / 'ontology/items.yaml').read_text())['entities']
    sources = yaml.safe_load((DATA / 'sources.yaml').read_text())
    described = {e['id']: e['attrs'] for e in entities if e.get('attrs', {}).get('description')}
    assert {k: v['description'] for k, v in described.items()} == {
        'variety:apple-fuji': '완전히 익으면 과육 속에 꿀이 생기고 저장성이 좋아요.',
        'variety:apple-hongro': '국내에서 처음 육성한 품종이에요.',
        'variety:sweet_persimmon-fuyu': '한 개 220~230g 정도, 껍질은 등황색, 당도는 15~16°Bx 정도예요.',
    }
    for attrs in described.values():
        assert attrs['description_source'] in sources


@pytest.mark.parametrize('weeks', [0, 9, -1, 'bad'])
def test_history_weeks_range(api, weeks):
    assert api.get('/prices/history', params=QUERY | {'weeks': weeks}).status_code == 422


def test_weekly_boundaries_null_and_same_baseline(api, monkeypatch):
    monday = date(2026, 11, 23)
    days = [monday - timedelta(days=1), monday, monday + timedelta(days=1)]
    observations = [
        row(price=2501, exmn_ymd=days[0]),
        row(price=3000, exmn_ymd=days[1]),
        row(price=5000, exmn_ymd=days[2]),
        row(price=99999, region='부산', exmn_ymd=days[2]),
        row(price=99999, kind='large_retail', exmn_ymd=days[2]),
    ]
    monkeypatch.setattr(price_repo, 'fetch_rows', lambda *a: observations)
    monkeypatch.setattr(
        price_repo,
        'observation_dates',
        lambda c, i, v, start, end: [d for d in days if start <= d <= end],
    )
    result = price_service.get_history(
        None, QUERY['item_id'], market_id=QUERY['market_id'], weeks=4, on_date=days[2]
    )
    assert [p['week_start'] for p in result['points']] == [
        date(2026, 11, 2),
        date(2026, 11, 9),
        date(2026, 11, 16),
        monday,
    ]
    assert [p['price'] for p in result['points']] == [None, None, 2001, 3200]
    assert result['unit'] == 'unit:bunch'
    for day in days:
        assert (
            price_service.get_price(
                None, QUERY['item_id'], market_id=QUERY['market_id'], on_date=day
            ).unit
            == result['unit']
        )


def test_variety_metadata_list(api, monkeypatch):
    choice = dict(
        id='variety:apple-fuji',
        name_ko='후지',
        attrs={'description': '설명', 'description_source': 'src:apple'},
        props={'default': True},
    )
    monkeypatch.setattr(price_repo, 'varieties', lambda *a: [choice])
    monkeypatch.setattr(knowledge_repo, 'source_title', lambda c, key: '출처 제목')
    monkeypatch.setattr(
        knowledge_repo,
        'item_labels',
        lambda *a: [dict(lang='ko', label='후지'), dict(lang='ko', label='부사')],
    )
    monkeypatch.setattr(
        knowledge_repo,
        'season_relations',
        lambda *a: [
            dict(
                subject_id=choice['id'],
                subject_name='후지',
                predicate='harvestPeriod',
                object_value={'label': '10월 이후', 'from': '10'},
                title='출처',
                publisher=None,
                url=None,
                license=None,
            )
        ],
    )
    result = api.get('/items/item:apple/varieties').json()[0]
    assert result['synonyms'] == ['부사']
    assert result['description_source'] == '출처 제목'
    assert result['harvest'] == {'label': '10월 이후', 'from': '10'}
    assert api.get('/prices', params=QUERY).json()['varieties'][0]['description'] == '설명'


def test_sale_and_store_variety_validation(merchant, monkeypatch):
    monkeypatch.setattr(
        price_repo,
        'varieties',
        lambda c, item: [dict(id='variety:onion-onion')] if item == 'item:onion' else [],
    )
    client = merchant['client']
    invalid = client.post(
        '/merchant/sales', headers=HEADER, json=sale_payload(variety_id='variety:apple-fuji')
    )
    assert invalid.status_code == 422
    result = client.post(
        '/merchant/sales', headers=HEADER, json=sale_payload(variety_id='variety:onion-onion')
    )
    assert result.status_code == 201 and result.json()['variety_id'] == 'variety:onion-onion'
    for selections in [
        {'item:onion': ['variety:apple-fuji']},
        {'item:apple': ['variety:onion-onion']},
    ]:
        assert (
            client.patch(
                '/merchant/store', headers=HEADER, json={'varieties': selections}
            ).status_code
            == 422
        )
    selections = {'item:onion': ['variety:onion-onion']}
    assert (
        client.patch('/merchant/store', headers=HEADER, json={'varieties': selections}).json()[
            'varieties'
        ]
        == selections
    )
    assert client.get('/merchant/store').json()['varieties'] == selections
