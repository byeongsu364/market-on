"""Season ontology, deterministic answers and API contract without DB/network."""

from pathlib import Path
from unittest.mock import Mock

import pytest
import yaml
from fastapi.testclient import TestClient

from app.db.repositories import knowledge_repo
from app.deps import get_db
from app.knowledge import ask_intent, season
from app.main import app
from app.schemas.ask import AskRequest
from app.services import ask_service

DATA = Path(__file__).resolve().parents[2] / 'data'


@pytest.fixture
def catalog(monkeypatch):
    entities = {
        e['id']: e
        for p in (DATA / 'ontology').glob('*.yaml')
        for e in yaml.safe_load(p.read_text())['entities']
    }
    sources = yaml.safe_load((DATA / 'sources.yaml').read_text())

    def relations(conn, item_id):
        item = entities.get(item_id, {})
        ids = [item_id] + [r['o'] for r in item.get('relations', []) if r['p'] == 'hasGrade']
        result = []
        for eid in ids:
            for r in entities.get(eid, {}).get('relations', []):
                if r['p'] not in ('inSeason', 'harvestPeriod', 'producedIn'):
                    continue
                source = sources[r['source']]
                result.append(
                    dict(
                        subject_id=eid,
                        subject_name=entities[eid]['name_ko'],
                        predicate=r['p'],
                        object_id=r.get('o'),
                        object_value=r.get('v'),
                        object_name=entities.get(r.get('o'), {}).get('name_ko'),
                        **{k: source[k] for k in ('title', 'publisher', 'url', 'license')},
                    )
                )
        return result

    monkeypatch.setattr(knowledge_repo, 'season_relations', relations)
    return entities


def test_data_and_facts(catalog):
    assert len([e for e in catalog.values() if e['type'] == 'season']) == 12
    assert len([e for e in catalog.values() if e['type'] == 'region']) == 4
    edges = [
        r
        for e in catalog.values()
        for r in e.get('relations', [])
        if r['p'] in ('inSeason', 'harvestPeriod', 'producedIn')
    ]
    # 기존 제철·수확·산지 관계 14개 + 귤 12월 제철 관계 1개
    assert len(edges) == 26  # 047 이달의 식재료 11품목 추가
    assert all(r.get('source') for r in edges)
    assert not list((DATA / 'rag_docs').glob('*/season.md'))
    assert len(list((DATA / 'rag_docs').glob('*/varieties.md'))) == 6
    facts = season.season_facts(None, 'item:sweet_persimmon')
    assert facts['featured_months'] == [11]
    assert facts['harvest'][0]['variety_name'] == '부유'
    assert facts['harvest'][0]['label'] == '10월 하순~11월 상순'
    apple = season.season_facts(None, 'item:apple')
    assert apple['featured_months'] == [11]
    assert {h['variety_name'] for h in apple['harvest']} == {'후지', '홍로'}
    assert [r['name'] for r in season.season_facts(None, 'item:green_onion')['regions']] == [
        '부산 북구 명지',
        '전남 해안지방',
        '충남 아산',
    ]
    assert season.season_facts(None, 'item:missing') == {
        'featured_months': [],
        'harvest': [],
        'regions': [],
        'sources': [],
    }
    assert season.season_facts(None, 'item:apple', 11)['featured_months'] == [11]
    assert season.season_facts(None, 'item:apple', 9)['featured_months'] == []


def test_ask_without_retrieval_or_llm(catalog, monkeypatch):
    monkeypatch.setattr(knowledge_repo, 'get_item', lambda c, i: catalog.get(i))
    monkeypatch.setattr(
        ask_service.ontology,
        'match_variety',
        lambda c, i, q: next(
            (e['id'] for e in catalog.values() if e['type'] == 'variety' and e['name_ko'] in q),
            None,
        ),
    )
    search, generate, embed, cache = (
        Mock(side_effect=AssertionError),
        Mock(side_effect=AssertionError),
        Mock(side_effect=AssertionError),
        Mock(side_effect=AssertionError),
    )
    monkeypatch.setattr(ask_service.retriever, 'search', search)
    monkeypatch.setattr(ask_service.ask_llm, 'generate', generate)
    monkeypatch.setattr(ask_service, 'get_embedder', embed)
    monkeypatch.setattr(ask_service.answer_cache, 'cache_key', cache)
    result = ask_service.ask(
        None, AskRequest(intent='season', item_id='item:sweet_persimmon'), 'd', consume=False
    )
    assert result.kind == 'answer' and result.model is None
    assert '단감을 11월 식재료로 소개해요.' in result.answer
    assert '부유는 10월 하순~11월 상순에 수확해요(남부 주산지는 대개 11월 상순).' in result.answer
    # 11월 식재료는 공공데이터포털 API 목록, 부유 수확 시기는 이달의 농업기술(2유형) → 출처 2개
    assert {c.title for c in result.citations} == {
        '농식품 이달의 식재료 목록 (월별)',
        '단감 수확 후 관리 요령 (이달의 농업기술)',
    }
    for variety, kind in [('후지', 'answer'), ('시나노골드', 'no_evidence')]:
        result = ask_service.ask(
            None,
            AskRequest(question=f'{variety} 품종 언제', item_id='item:apple'),
            'd',
            consume=False,
        )
        assert result.kind == kind
        assert '홍로' not in result.answer and '식재료' not in result.answer
    assert not search.called and not generate.called and not embed.called and not cache.called


@pytest.mark.parametrize(
    'text,intent',
    [
        ('사과 특징', 'story'),
        ('사과 종류', 'story'),
        ('사과 맛이 어때', 'story'),
        ('사과 차이', 'story'),
        ('사과 품종 특징', 'story'),
        ('후지 품종 언제 수확', 'season'),
    ],
)
def test_intents(text, intent):
    assert ask_intent.rule_intent(text) == intent


def test_in_season_contract(monkeypatch):
    conn = object()
    read = Mock(return_value=[{'item_id': 'item:sweet_persimmon', 'name': '단감'}])
    monkeypatch.setattr(knowledge_repo, 'in_season', read)
    app.dependency_overrides[get_db] = lambda: conn
    try:
        with TestClient(app) as client:
            response = client.get('/items/in-season?month=11')
            assert response.status_code == 200
            assert response.json() == [
                {'item_id': 'item:sweet_persimmon', 'name': '단감', 'label': '11월 식재료'}
            ]
            assert set(response.json()[0]) == {'item_id', 'name', 'label'}
            for month in (0, 13):
                assert client.get(f'/items/in-season?month={month}').status_code == 422
            read.return_value = []
            assert client.get('/items/in-season?month=1').json() == []
            client.get('/items/in-season')
            assert 1 <= read.call_args.args[1] <= 12
    finally:
        app.dependency_overrides.pop(get_db)


def test_variety_only_question_resolves_parent(catalog, monkeypatch):
    monkeypatch.setattr(
        knowledge_repo, 'get_item', lambda c, i: catalog.get(i) if i.startswith('item:') else None
    )
    monkeypatch.setattr(knowledge_repo, 'variety_items', lambda *a: ['item:apple'])
    monkeypatch.setattr(ask_service.ontology, 'resolve_entities', lambda *a: ['variety:apple-fuji'])
    monkeypatch.setattr(ask_service.ontology, 'match_variety', lambda *a: 'variety:apple-fuji')
    result = ask_service.ask(None, AskRequest(question='후지 언제 수확해'), 'd', consume=False)
    assert result.kind == 'answer' and result.item_id == 'item:apple'
    assert result.answer == '후지는 10월 하순 이후에 수확해요(만생종).'


def test_mandarin_december_api(catalog, monkeypatch):
    assert season.season_facts(None, 'item:mandarin')['featured_months'] == [12]

    def in_season(conn, month):
        return [
            {'item_id': e['id'], 'name': e['name_ko']}
            for e in catalog.values()
            if e['type'] == 'item'
            and any(
                r['p'] == 'inSeason' and r.get('o') == f'season:{month:02}'
                for r in e.get('relations', [])
            )
        ]

    monkeypatch.setattr(knowledge_repo, 'in_season', in_season)
    app.dependency_overrides[get_db] = lambda: object()
    try:
        with TestClient(app) as client:
            assert client.get('/items/in-season?month=12').json() == [
                {'item_id': 'item:mandarin', 'name': '귤', 'label': '12월 식재료'},
                *[
                    {'item_id': 'item:' + slug, 'name': name, 'label': '12월 식재료'}
                    for slug, name in [
                        ('red_bean', '팥'),
                        ('sweet_potato', '고구마'),
                        ('spinach', '시금치'),
                        ('broccoli', '브로콜리'),
                    ]
                ],
            ]
    finally:
        app.dependency_overrides.pop(get_db)
