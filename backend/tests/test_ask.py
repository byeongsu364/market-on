"""Offline ask pipeline and router escalation checks."""

from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.deps import get_db
from app.knowledge import ask_intent, fact_check
from app.llm import ask as llm
from app.llm.router import Routed
from app.main import app
from app.schemas.ask import AskRequest
from app.schemas.knowledge import RetrievedChunk
from app.services import ask_service as svc

HEADERS = {'X-Requested-With': 'market-on', 'X-Device-Id': '11111111-1111-1111-1111-111111111111'}
DICTIONARY = [('대파', 'item:green_onion', '대파'), ('사과', 'item:apple', '사과')]


@pytest.mark.parametrize(
    'question,intent',
    [
        ('대파 보관', 'store'),
        ('냉장해요?', 'store'),
        ('냉동 방법', 'store'),
        ('손질 방법', 'prep'),
        ('씻어요?', 'prep'),
        ('다듬는 법', 'prep'),
        ('제철', 'season'),
        ('언제 나와요', 'season'),
        ('품종', 'season'),
        ('산지', 'season'),
        ('고르는 법', 'select'),
        ('고를 때', 'select'),
        ('확인할 점', 'select'),
        ('좋은 거', 'select'),
        ('얼마', 'price'),
        ('가격', 'price'),
        ('시세', 'price'),
        ('어디', 'where'),
        ('파는 곳', 'where'),
        ('가게', 'where'),
        ('점포', 'where'),
    ],
)
def test_rules(question, intent):
    assert ask_intent.rule_intent(question) == intent


@pytest.fixture
def env(monkeypatch):
    conn = Mock(transaction=nullcontext)
    cache = {}
    version = ['v1']
    monkeypatch.setattr(svc.ask_repo, 'consume_quota', lambda *a: True)
    monkeypatch.setattr(svc.ask_repo, 'document_version', lambda *a: version)
    monkeypatch.setattr(svc.ask_repo, 'get_cache', lambda c, k: cache.get(k))
    monkeypatch.setattr(svc.ask_repo, 'put_cache', lambda c, k, a, m: cache.update({k: a}))
    monkeypatch.setattr(svc.ask_repo, 'item_dictionary', lambda *a: DICTIONARY)
    monkeypatch.setattr(
        svc.ask_repo,
        'sources',
        lambda *a: [{'title': '출처', 'publisher': '기관', 'url': None, 'license': None}],
    )
    monkeypatch.setattr(
        svc.knowledge_repo,
        'get_item',
        lambda c, i: {'name_ko': '대파'} if i.startswith('item:') else None,
    )
    monkeypatch.setattr(svc.ontology, 'resolve_entities', lambda c, q: ['item:green_onion'])
    monkeypatch.setattr(
        svc.item_service,
        'search',
        lambda *a: [SimpleNamespace(item_id='item:green_onion', name='대파')],
    )
    chunk = RetrievedChunk(
        1,
        '[대파 · 저장 조건] > 초안 · 검수 전\n대파는 0~2℃에서 보관해요. 한 달 보관해요.\n출처: 숨김',
        0.9,
        'storage',
        '보관',
        None,
        '출처',
        None,
        None,
    )
    search = Mock(return_value=[chunk])
    monkeypatch.setattr(svc.retriever, 'search', search)
    monkeypatch.setattr(svc, 'get_embedder', Mock(return_value=object()))
    calls = []
    outputs = [{'answer': '대파는 0~2℃에서 보관해요. 1개월 보관해요.', 'used': [1]}]

    def generate(q, chunks, accept):
        calls.append(chunks)
        for value in outputs:
            reason = accept(value)
            if reason is None:
                break
        return Routed(value, 'fake', 'fake', len(outputs) > 1, reason)

    monkeypatch.setattr(svc.ask_llm, 'generate', generate)
    app.dependency_overrides[get_db] = lambda: conn
    with TestClient(app) as client:
        yield SimpleNamespace(
            conn=conn, client=client, calls=calls, outputs=outputs, search=search, version=version
        )
    app.dependency_overrides.pop(get_db, None)


def ask(env, **kw):
    return svc.ask(
        env.conn,
        AskRequest(intent='store', item_id='item:green_onion', **kw),
        HEADERS['X-Device-Id'],
    )


def test_cache_and_cleaning(env):
    first = ask(env)
    assert first.kind == 'answer' and len(first.citations) == 1
    assert '초안' not in str(env.calls) and '출처:' not in str(env.calls)
    second = ask(env)
    assert second.cached and second.model is None and len(env.calls) == 1
    env.version.append('changed body')
    assert not ask(env).cached and len(env.calls) == 2
    ask(env, question='어떻게 보관?')
    assert ask(env, question='어떻게  보관？？').cached
    assert not ask(env, question='오래 보관?').cached


def test_empty_evidence(env):
    env.search.return_value = []
    assert ask(env).kind == 'no_evidence' and not env.calls


@pytest.mark.parametrize(
    'sentence,removed',
    [
        ('0~2℃에 두어요.', 0),
        ('5℃에 두어요.', 1),
        ('1개월 두어요.', 0),
        ('사과를 두어요.', 1),
        ('신선해요.', 1),
        ('A등급이에요.', 1),
        ('구매 추천해요.', 1),
    ],
)
def test_facts(sentence, removed):
    answer, count = fact_check.check(
        sentence, '대파는 0~2℃에 한 달 두어요.', 'item:green_onion', DICTIONARY
    )
    assert count == removed and bool(answer) != bool(removed)


def test_escalation(env):
    env.outputs[:] = [
        {'answer': '5℃에 두어요. 신선해요.', 'used': [1]},
        {'answer': '대파를 0~2℃에 두어요. 한 달 보관해요.', 'used': [1]},
    ]
    assert ask(env).kind == 'answer'
    env.version.append('new')
    env.outputs[-1] = {'answer': '사과를 사세요.', 'used': [1]}
    result = ask(env)
    assert result.kind == 'no_evidence' and result.removed == 1 and result.model is None


def test_need_item_and_outside(env, monkeypatch):
    for ids in ([], ['item:green_onion', 'item:apple']):
        monkeypatch.setattr(svc.ontology, 'resolve_entities', lambda *a, ids=ids: ids)
        result = svc.ask(env.conn, AskRequest(question='보관'), 'device')
        assert result.kind == 'need_item' and len(result.candidates) <= 5
    classify = Mock(return_value='outside')
    monkeypatch.setattr(svc.ask_llm, 'classify', classify)
    assert svc.ask(env.conn, AskRequest(question='안녕'), 'device').kind == 'out_of_scope'
    classify.assert_called_once()
    classify.return_value = 'store'
    monkeypatch.setattr(svc.ontology, 'resolve_entities', lambda *a: ['item:green_onion'])
    assert svc.ask(env.conn, AskRequest(question='설명해 줘'), 'device').kind == 'answer'


def test_price_where_no_generation(env, monkeypatch):
    price = Mock(return_value=None)
    stores = Mock(return_value=[{'store_id': 's', 'name': '가게'}])
    monkeypatch.setattr(svc.price_service, 'get_price', price)
    monkeypatch.setattr(svc.market_service, 'selling_stores', stores)
    for intent in ('price', 'where'):
        result = svc.ask(
            env.conn, AskRequest(intent=intent, item_id='item:apple', market_id='m'), 'device'
        )
        assert result.kind == intent
    assert not env.calls and not env.search.called
    assert price.call_args.kwargs == {'market_id': 'm'}
    assert (
        env.client.post(
            '/ask', json={'intent': 'where', 'item_id': 'item:apple'}, headers=HEADERS
        ).status_code
        == 422
    )


def test_api_validation_and_contract(env, monkeypatch):
    assert env.client.post('/ask', json={'intent': 'store'}).status_code == 403
    for body in (
        {},
        {'question': '가' * 201},
        {'intent': 'bad'},
        {'question': ' '},
        {'intent': 'store', 'lang': 'en'},
    ):
        assert env.client.post('/ask', json=body, headers=HEADERS).status_code == 422
    response = env.client.post(
        '/ask', json={'intent': 'store', 'item_id': 'item:green_onion'}, headers=HEADERS
    )
    assert response.status_code == 200
    assert set(response.json()) == {
        'kind',
        'intent',
        'item_id',
        'item_name',
        'answer',
        'citations',
        'model',
        'cached',
        'removed',
    }
    monkeypatch.setattr(svc.ask_repo, 'consume_quota', lambda *a: False)
    response = env.client.post('/ask', json={'intent': 'store'}, headers=HEADERS)
    assert response.status_code == 429 and response.json()['error']['code'] == 'TOO_MANY_QUESTIONS'


def test_real_router_retries_invalid_and_unsupported(monkeypatch):
    from app.core.config import settings
    from app.llm import router

    monkeypatch.setattr(settings, 'LLM_ROUTES', {'ask': ['fake', 'openai']})
    monkeypatch.setattr(router, '_configured', lambda name: True)
    monkeypatch.setattr(router.llm_call_repo, 'record', Mock())
    providers = [
        Mock(generate=Mock(return_value='broken')),
        Mock(generate=Mock(return_value='{"answer":"근거 답이에요.","used":[1]}')),
    ]
    monkeypatch.setattr(router, '_provider', lambda name: providers[0 if name == 'fake' else 1])
    result = llm.generate('질문', ['근거'], lambda value: 'invalid_json' if value is None else None)
    assert result.escalated and result.reason == 'invalid_json'
    providers[0].generate.return_value = '{"answer":"5℃", "used":[1]}'
    result = llm.generate(
        '질문', ['근거'], lambda v: 'unsupported' if v['answer'] == '5℃' else None
    )
    assert result.escalated and result.reason == 'unsupported'


def test_partial_removal_and_used_only_sources(env, monkeypatch):
    second = RetrievedChunk(
        2, '사과는 5℃에서 보관해요.', 0.8, 'storage', '다른 자료', None, '다른 출처', None, None
    )
    env.search.return_value.append(second)
    sources = Mock(
        return_value=[{'title': '출처', 'publisher': None, 'url': None, 'license': None}]
    )
    monkeypatch.setattr(svc.ask_repo, 'sources', sources)
    env.outputs[:] = [{'answer': '대파는 0~2℃에서 보관해요. 5℃에서도 보관해요.', 'used': [1]}]
    result = ask(env)
    assert result.kind == 'answer' and result.removed == 1
    assert '5℃' not in result.answer
    sources.assert_called_once_with(env.conn, [1])


@pytest.mark.parametrize(
    'value',
    [
        None,
        {},
        {'answer': None, 'used': []},
        {'answer': '신선해요.', 'used': [True]},
        {'answer': '근거예요.', 'used': [8]},
    ],
)
def test_rejected_final_response_is_not_cached(env, value):
    env.outputs[:] = [value, value]
    assert ask(env).kind == 'no_evidence'
    assert not ask(env).cached


def test_quota_boundary_without_db():
    from app.db.repositories import ask_repo

    conn = Mock(transaction=nullcontext)
    conn.execute.return_value.fetchone.return_value = (59,)
    assert ask_repo.consume_quota(conn, 'hashed-device')
    assert any('insert into response_cache' in call.args[0] for call in conn.execute.call_args_list)
    conn.reset_mock()
    conn.execute.return_value.fetchone.return_value = (60,)
    assert not ask_repo.consume_quota(conn, 'hashed-device')
    assert not any(
        'insert into response_cache' in call.args[0] for call in conn.execute.call_args_list
    )


@pytest.mark.parametrize(
    'text,expected', [('{"intent":"store"}', 'store'), ('{"intent":"outside"}', 'outside')]
)
def test_classifier_closed_result(monkeypatch, text, expected):
    from app.core.config import settings
    from app.llm import router

    monkeypatch.setattr(settings, 'LLM_ROUTES', {'ask': ['fake']})
    monkeypatch.setattr(router.llm_call_repo, 'record', Mock())
    monkeypatch.setattr(router, '_provider', lambda *a: Mock(generate=Mock(return_value=text)))
    assert llm.classify('설명해 줘') == expected


def test_model_unavailable_is_no_evidence(env, monkeypatch):
    monkeypatch.setattr(svc.ask_llm, 'generate', Mock(side_effect=TimeoutError))
    assert ask(env).kind == 'no_evidence'


@pytest.mark.parametrize(
    'sentence', ['신선도가 높아요.', '1등급이에요.', '구매하세요.', '구입해요.']
)
def test_additional_prohibited_judgments(sentence):
    assert fact_check.check(sentence, sentence, 'item:green_onion', DICTIONARY) == (None, 1)
