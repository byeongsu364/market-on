"""Offline composition policy, evidence and HTTP tests."""

from types import SimpleNamespace as NS
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.deps import get_db
from app.llm.router import Routed
from app.main import app
from app.schemas.knowledge import RetrievedChunk
from app.schemas.recommend import RecommendRequest
from app.services import recommend_service as svc

HEADERS = {'X-Requested-With': 'market-on', 'X-Device-Id': '11111111-1111-1111-1111-111111111111'}


def candidate(i='a', category='cat:fruit', price=1000, unit='unit:piece'):
    return {'item_id': i, 'category': category, 'unit': unit, 'unit_price': price}


@pytest.mark.parametrize(
    'purpose,primary,secondary',
    [
        ('집밥', 'cat:vegetable', 'cat:fruit'),
        ('모임', 'cat:fruit', 'cat:vegetable'),
        ('선물', 'cat:fruit', None),
    ],
)
def test_categories_and_determinism(purpose, primary, secondary):
    candidates = [
        candidate(str(i), c) for i, c in enumerate(['cat:fruit'] * 3 + ['cat:vegetable'] * 3)
    ]
    result = svc.compose(candidates, purpose, 2, 20000)
    assert result == svc.compose(list(reversed(candidates)), purpose, 2, 20000)
    assert result[0]['category'] == primary
    assert len(result) <= 4
    assert sum(c['category'] != primary for c in result) <= (1 if secondary else 0)


@pytest.mark.parametrize('people', [1, 2, 3, 4, 20])
def test_quantities(people):
    assert svc.quantity('cat:fruit', 'unit:piece', '집밥', people) == people
    assert svc.quantity('cat:fruit', 'unit:piece', '선물', people) == max(3, people * 2)
    for unit in ['unit:bunch', 'unit:kg']:
        assert svc.quantity('cat:vegetable', unit, '집밥', people) == (people + 2) // 3


def test_budget_reduction_removal_fill_and_empty():
    assert svc.compose([], '집밥', 2, 5000) == []
    result = svc.compose([candidate(price=3000)], '선물', 4, 5000)
    assert result[0]['quantity'] == 1
    result = svc.compose([candidate('a', price=6000), candidate('b', price=2000)], '선물', 4, 5000)
    assert [i['item_id'] for i in result] == ['b']
    assert result[0]['subtotal'] <= 5000
    result = svc.compose([candidate()], '모임', 1, 10000)
    assert result[0]['subtotal'] == 6000
    assert svc.compose([candidate(price=6000)], '선물', 1, 5000) == []


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr(svc.season, 'season_statements', lambda *a, **kw: [])
    conn = Mock()
    cache = {}
    version = ['v1']
    monkeypatch.setattr(svc.ask_service.ask_repo, 'consume_quota', lambda *a: True)
    monkeypatch.setattr(svc.store_repo, 'get_market', lambda *a: {'id': 'm'})
    monkeypatch.setattr(svc.store_repo, 'market_items', lambda *a: [{'item_id': 'item:apple'}])
    monkeypatch.setattr(svc.ask_repo, 'document_version', lambda *a: version)
    monkeypatch.setattr(svc.ask_repo, 'get_cache', lambda c, k: cache.get(k))
    monkeypatch.setattr(svc.ask_repo, 'put_cache', lambda c, k, v, m: cache.update({k: v}))
    monkeypatch.setattr(svc.sale_repo, 'latest_active_by_store', lambda *a: [{'store_id': 'z'}])
    monkeypatch.setattr(
        svc.market_service,
        'selling_stores',
        lambda *a: [{'store_id': i, 'name': i} for i in 'abcz'],
    )
    monkeypatch.setattr(
        svc.knowledge_repo,
        'item_relations',
        lambda *a: [
            {'predicate': 'isA', 'object_id': 'cat:fruit'},
            {'predicate': 'soldBy', 'object_id': 'unit:piece', 'name_ko': '개'},
        ],
    )
    monkeypatch.setattr(
        svc.item_service, 'get_item', lambda *a: NS(name='사과', default_unit='unit:piece')
    )
    monkeypatch.setattr(
        svc.price_service,
        'get_price',
        lambda *a, **kw: NS(
            mock=False,
            unit='unit:piece',
            region='서울',
            by_market_type={'traditional': NS(price=1000)},
        ),
    )
    monkeypatch.setattr(
        svc.ask_repo, 'item_dictionary', lambda *a: [('사과', 'item:apple', '사과')]
    )
    monkeypatch.setattr(
        svc.ask_repo,
        'sources',
        lambda *a: [
            {
                'title': '자료',
                'publisher': None,
                'url': None,
                'license': None,
                'body': '> 초안\n사과',
            }
        ],
    )
    search = Mock(
        return_value=[
            RetrievedChunk(
                1,
                '> 초안\n사과는 껍질을 확인해요.\n출처: 숨김',
                0.1,
                'criterion',
                '확인',
                None,
                '자료',
                None,
                None,
            )
        ]
    )
    monkeypatch.setattr(svc.retriever, 'search', search)
    monkeypatch.setattr(svc, 'get_embedder', lambda: object())
    output = {'reasons': {'item:apple': {'text': '껍질을 확인해요.', 'used': ['1']}}}
    generate = Mock(
        side_effect=lambda context, accept: Routed(
            output, 'fake', 'gemma4:fake', False, accept(output)
        )
    )
    monkeypatch.setattr(svc.recommend_llm, 'generate', generate)
    app.dependency_overrides[get_db] = lambda: conn
    with TestClient(app) as client:
        yield NS(
            conn=conn,
            cache=cache,
            version=version,
            output=output,
            generate=generate,
            search=search,
            client=client,
        )
    app.dependency_overrides.pop(get_db)


def request(env, **kw):
    return svc.recommend(
        env.conn,
        RecommendRequest(purpose='선물', headcount=2, budget=10000, market_id='m', **kw),
        'device',
    )


def test_reasons_cache_versions_and_stores(env):
    result = request(env)
    assert result.model == 'gemma4:fake' and result.items[0].sources[0].draft
    assert result.items[0].stores[0].store_id == 'z' and len(result.items[0].stores) == 3
    assert request(env) == result and env.generate.call_count == 1
    assert '초안' not in str(env.generate.call_args) and '출처:' not in str(env.generate.call_args)
    # 선물은 보관·제철·고르는 법 순서로 근거를 찾음 (용도별 근거 종류)
    assert env.search.call_args.kwargs['doc_types'] == svc.PURPOSE_DOC_TYPES['선물']
    assert svc.PURPOSE_DOC_TYPES['선물'][0] == 'storage'
    assert 'min_similarity' not in env.search.call_args.kwargs
    env.version.append('new')
    request(env)
    assert env.generate.call_count == 2
    request(env, event='생일')
    assert env.generate.call_count == 3


@pytest.mark.parametrize('text', ['5℃에 두어요.', '추천해요.', '99개 넣어요.', '10000원이에요.'])
def test_unsupported_defaults(env, text):
    env.output['reasons']['item:apple']['text'] = text
    result = request(env)
    assert (
        result.model is None
        and result.items[0].reason.endswith('넣었어요')
        and not result.items[0].sources
    )


def test_no_candidates_or_evidence(env, monkeypatch):
    env.search.return_value = []
    assert request(env).model is None and not env.generate.called
    env.cache.clear()
    monkeypatch.setattr(svc.store_repo, 'market_items', lambda *a: [])
    result = request(env)
    assert result.items == [] and result.total == 0 and result.left == 10000
    assert result.note == '이 시장에서 파는 품목의 시세가 아직 없어요'


def test_http(env, monkeypatch):
    body = {'purpose': '집밥', 'budget': 10000, 'headcount': 2, 'market_id': 'm'}
    assert env.client.post('/recommend', json=body).status_code == 403
    for change in [
        {'budget': 4999},
        {'budget': 500001},
        {'headcount': 0},
        {'headcount': 21},
        {'purpose': '기타'},
        {'relation': '기타'},
    ]:
        assert env.client.post('/recommend', json=body | change, headers=HEADERS).status_code == 422
    response = env.client.post('/recommend', json=body, headers=HEADERS)
    assert response.status_code == 200
    assert set(response.json()) == {'items', 'total', 'budget', 'left', 'note', 'model'}
    assert set(response.json()['items'][0]) == {
        'item_id',
        'name',
        'quantity',
        'unit',
        'unit_label',
        'unit_price',
        'subtotal',
        'reason',
        'stores',
        'sources',
    }
    monkeypatch.setattr(svc.store_repo, 'get_market', lambda *a: None)
    assert env.client.post('/recommend', json=body, headers=HEADERS).status_code == 422
    monkeypatch.setattr(svc.ask_service.ask_repo, 'consume_quota', lambda *a: False)
    assert env.client.post('/recommend', json=body, headers=HEADERS).status_code == 429


def test_actual_router_retries_broken_json(monkeypatch):
    from app.core.config import settings
    from app.llm import recommend, router

    monkeypatch.setattr(settings, 'LLM_ROUTES', {'reason': ['gemma', 'openai']})
    monkeypatch.setattr(router, '_configured', lambda *a: True)
    monkeypatch.setattr(router.llm_call_repo, 'record', Mock())
    providers = [
        Mock(generate=Mock(return_value='broken')),
        Mock(generate=Mock(return_value='{"reasons":{}}')),
    ]
    monkeypatch.setattr(router, '_provider', lambda name: providers[name == 'openai'])
    result = recommend.generate({}, lambda v: None if v else 'invalid_json')
    assert result.escalated and result.reason == 'invalid_json'


def test_fill_adds_same_category_without_crossing_limit():
    candidates = [candidate(str(i), price=7000) for i in range(4)] + [candidate('z', price=1000)]
    result = svc.compose(candidates, '선물', 1, 5000)
    assert result[0]['item_id'] == 'z' and result[0]['subtotal'] == 3000


def test_partial_reason_removal(env):
    env.output['reasons']['item:apple']['text'] = '껍질을 확인해요. 5℃에 두어요. 추천해요.'
    result = request(env)
    assert result.items[0].reason == '껍질을 확인해요.'
    assert result.model and result.items[0].sources


def test_prices_require_local_traditional_and_default_unit(env, monkeypatch):
    for price in [
        NS(
            mock=True,
            unit='unit:piece',
            region='서울',
            by_market_type={'traditional': NS(price=1000)},
        ),
        NS(
            mock=False,
            unit='unit:kg',
            region='서울',
            by_market_type={'traditional': NS(price=1000)},
        ),
        NS(
            mock=False,
            unit='unit:piece',
            region='전국',
            by_market_type={'traditional': NS(price=1000)},
        ),
        NS(mock=False, unit='unit:piece', region='서울', by_market_type={}),
    ]:
        env.cache.clear()
        monkeypatch.setattr(svc.price_service, 'get_price', lambda *a, price=price, **kw: price)
        assert request(env).items == []
    assert not env.generate.called


def test_gift_keeps_balanced_quantities():
    # 예산이 모자라도 한 품목만 1개로 줄이지 않고 고르게 (2026-11-26 검수: 선물에 배 1개)
    items = [
        candidate('apple', price=1540),
        candidate('pear', price=4110),
        candidate('persimmon', price=1222),
    ]
    result = {i['item_id']: i['quantity'] for i in svc.compose(items, '선물', 4, 30000)}
    assert (
        min(result.values()) >= 4
        and sum(q * p for q, p in zip(result.values(), (1540, 4110, 1222))) <= 30000
    )


def test_gift_season_evidence_and_sources(env, monkeypatch):
    from app.schemas.ask import Citation

    source = Citation(title='이달의 식재료', publisher='농사로', url=None, license=None)
    facts = Mock(
        return_value=[("농사로 '이달의 식재료'에서 사과를 9월, 10월 식재료로 소개해요.", [source])]
    )
    monkeypatch.setattr(svc.season, 'season_statements', facts)
    env.output['reasons']['item:apple'] = {'text': '10월 식재료로 소개해요.', 'used': [2]}
    result = request(env)
    evidence = env.generate.call_args.args[0]['items'][0]['evidence']
    assert evidence[-1]['number'] == 2 and '식재료' in evidence[-1]['text']
    assert evidence[-1]['sources'][0]['title'] == source.title
    assert result.items[0].reason == '10월 식재료로 소개해요.'
    assert result.items[0].sources == [source]
    assert 'season' not in env.search.call_args.kwargs['doc_types']
    assert 1 <= facts.call_args.kwargs['month'] <= 12
