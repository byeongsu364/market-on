"""Offline recipes: source preservation, shopping rules, endpoints and vector fallback."""

from contextlib import nullcontext
from unittest.mock import Mock

import pytest
import yaml
from fastapi.testclient import TestClient

from app.deps import get_db
from app.knowledge import recipes
from app.knowledge.ask_intent import rule_intent
from app.knowledge.ingest import chunk_document
from app.main import app
from app.schemas.knowledge import Document
from app.services import recipe_service as svc
from scripts import import_recipes as ir
from scripts.load_ontology import load_ontology


@pytest.mark.parametrize(
    'text,item',
    [
        ('다진 대파 5g', 'item:green_onion'),
        ('양파 1/2개', 'item:onion'),
        ('대파 1대', 'item:green_onion'),
    ],
)
def test_ingredients(text, item):
    parsed = recipes.parse_ingredients('대파 요리', [text, '소고기 20g', '소금 약간'])
    assert parsed[0]['item_id'] == item and parsed[0]['role'] == '주재료'
    assert parsed[1]['store_category'] == '정육' and parsed[1]['where'] == 'category'
    assert parsed[2]['where'] == 'outside'


def test_main_roles_and_two_chunks():
    lines = ['두부 1모', '다진 대파 5g', '양파 1/2개']
    parsed = recipes.parse_ingredients('대파 요리', lines)
    assert [i['role'] for i in parsed] == ['부재료', '주재료', '부재료']
    body = (
        '요리 종류: 반찬\n## 재료\n'
        + '\n'.join('- ' + s for s in lines)
        + '\n## 만드는 법\n1. 원문 그대로.\n## 팁\n건강 주장\n출처: 원문'
    )
    doc = Document(
        'a.md',
        ir.SOURCE_KEY,
        'recipe',
        'ko',
        '대파 요리',
        body,
        entities=['item:green_onion', 'item:onion'],
        main_item='item:green_onion',
        main_items=['item:green_onion'],
        dish_type='국&찌개',
        cook_method='끓이기',
    )
    chunks = chunk_document(doc)
    assert len(chunks) == 2
    assert all(c.entity_ids == set(doc.entities) for c in chunks)
    assert '건강 주장' not in ''.join(c.content for c in chunks)
    assert '1. 원문 그대로.' in chunks[1].content
    props = recipes.metadata(doc, {'item:green_onion': [3]})
    assert props['season_months'] == [3] and props['main_item_id'] == doc.main_item
    assert props['weather_tags'] == ['cold', 'snow'] and props['quote_only'] is True
    doc.main_items.append('item:onion')
    assert (
        recipes.metadata(doc, {'item:green_onion': [3], 'item:onion': [6]})['season_months'] == []
    )


def test_import_ontology_top_level_relations(tmp_path, monkeypatch):
    row = {
        'RCP_SEQ': '1',
        'RCP_NM': '대파 요리',
        'RCP_PARTS_DTLS': '대파 1대, 양파 1/2개',
        'INFO_ENG': '100',
    }
    chosen = ir.select([row], ir.item_labels())
    ir.write_ontology(chosen, tmp_path / 'recipes.yaml')
    value = yaml.safe_load((tmp_path / 'recipes.yaml').read_text())
    assert len(value['relations']) == 2
    assert value['relations'][0]['props'] == {'role': '주재료', 'amount_text': '대파 1대'}
    (tmp_path / 'items.yaml').write_text(
        yaml.safe_dump(
            {
                'entities': [
                    {'id': iid, 'type': 'item', 'name_ko': iid}
                    for iid in ['item:green_onion', 'item:onion']
                ]
            }
        )
    )
    (tmp_path / 'relations.yaml').write_text(yaml.safe_dump({'relations': value['relations']}))
    (tmp_path / 'recipes.yaml').write_text(yaml.safe_dump({'entities': value['entities']}))
    from scripts import load_ontology as loader

    monkeypatch.setattr(loader.repo, 'entity_ids', lambda c: set())
    monkeypatch.setattr(loader.repo, 'source_id', lambda *a: 1)
    monkeypatch.setattr(loader.repo, 'upsert_entity', lambda *a: 'added')
    replace = Mock()
    monkeypatch.setattr(loader.repo, 'replace_relations', replace)
    load_ontology(Mock(transaction=nullcontext), tmp_path, cleanup=False)
    relations = [r for call in replace.call_args_list for r in call.args[2]]
    assert sum(r[0] == 'usedIn' for r in relations) == 2


def test_minimum_store_cover():
    # Greedy first pick 'a' needs three stores; b+c is the true minimum.
    choices = [{'a', 'b'}, {'a', 'b'}, {'a', 'c'}, {'a', 'c'}, {'b'}, {'c'}]
    assert svc.minimum_stores(choices) == 2
    assert svc.minimum_stores([set()]) == 0


@pytest.fixture
def env(monkeypatch):
    conn = Mock(transaction=nullcontext)
    row = {
        'recipe_id': 'recipe:fixture',
        'name': '대파 요리',
        'attrs': {
            'dish_type': '국&찌개',
            'cook_method': '끓이기',
            'kcal': '100',
            'doc_key': 'recipes/fixture.md',
        },
        'body': '## 재료\n- 대파 1대\n- 소고기 20g\n- 소금 약간\n## 만드는 법\n1. 원문 그대로.\n## 팁\n건강 주장',
        'props': {
            'main_item_id': 'item:green_onion',
            'season_months': [3],
            'weather_tags': ['cold'],
        },
        'main_item_name': '대파',
        'source_title': '식약처',
        'publisher': '식약처',
        'url': None,
        'license': '제한 없음',
    }
    monkeypatch.setattr(svc.recipe_repo, 'candidates', lambda *a: [row])
    monkeypatch.setattr(svc.store_repo, 'get_market', lambda *a: {'id': 'm'})
    monkeypatch.setattr(
        svc.store_repo,
        'list_stores',
        lambda *a: [{'id': 's', 'active': True, 'store_category_id': 'store_category:meat'}],
    )
    monkeypatch.setattr(
        svc.store_repo,
        'market_items',
        lambda *a: [{'store_id': 's', 'item_id': 'item:green_onion'}],
    )
    return conn, row


def test_list_detail_embeddings_and_api(env, monkeypatch):
    conn, _row = env
    embed = Mock()
    embed.embed.return_value = [[0.0] * 1024]
    vector = Mock(return_value=['recipes/fixture.md'])
    monkeypatch.setattr(svc.recipe_repo, 'vector_order', vector)
    cards = svc.find_recipes(conn, market_id='m', month=3, embedder=embed)
    embed.embed.assert_not_called()
    assert cards[0]['coverage'] == {'total': 3, 'in_market': 2, 'stores': 1}
    assert cards[0]['reason'] == '3월 제철 대파로 만드는 국&찌개'
    assert 'steps' not in cards[0]
    svc.find_recipes(conn, q='간단한 요리', embedder=embed)
    embed.embed.assert_called_once_with(['간단한 요리'], task='query')
    vector.assert_called_once()
    embed.embed.side_effect = TimeoutError
    assert svc.find_recipes(conn, q='요리', month=3, embedder=embed) == svc.find_recipes(
        conn, month=3
    )
    detail = svc.get_recipe(conn, 'recipe:fixture', weather='cold')
    assert detail['steps'] == '1. 원문 그대로.' and '팁' not in str(detail)
    assert detail['reason'] == '추운 날 끓이는 국&찌개'
    app.dependency_overrides[get_db] = lambda: conn
    try:
        client = TestClient(app)
        assert client.get('/recipes?month=13').status_code == 422
        assert client.get('/recipes?weather=rain').status_code == 200
        assert client.get('/recipes/recipe:fixture').json()['steps'] == '1. 원문 그대로.'
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize('question', ['뭐 해 먹지', '요리', '레시피'])
def test_recipe_intent(question):
    assert rule_intent(question) == 'recipe'


def test_ask_and_chat_tool_return_cards_without_writing(env, monkeypatch):
    from app.schemas.ask import AskRequest
    from app.services import ask_service
    from app.services.agent import tools

    conn, _ = env
    monkeypatch.setattr(ask_service.knowledge_repo, 'get_item', lambda *a: {'name_ko': '대파'})
    monkeypatch.setattr(ask_service.ontology, 'resolve_entities', lambda *a: [])
    monkeypatch.setattr(tools.item_service, 'get_item', lambda *a: None)
    embed = Mock()
    embed.embed.side_effect = TimeoutError
    response = ask_service.ask(
        conn,
        AskRequest(question='대파 요리', item_id='item:green_onion'),
        'fixture',
        consume=False,
        embedder=embed,
    )
    assert response.kind == 'recipes' and response.answer is None and response.model is None
    assert response.recipes and response.citations
    result = ask_service.ask(
        conn, AskRequest(question='뭐 해 먹지'), 'fixture', consume=False, embedder=embed
    )
    assert result.kind == 'recipes'
    cards = tools.execute(conn, 'm', 'fixture', 'find_recipes', {'item_id': 'item:green_onion'})
    assert cards[0]['coverage']['stores'] == 1 and 'steps' not in cards[0]
    assert 'find_recipes' in {t['function']['name'] for t in tools.get_tools()}


def test_structural_and_vector_order(env, monkeypatch):
    conn, row = env
    from copy import deepcopy

    other = deepcopy(row)
    other['recipe_id'] = 'recipe:second'
    other['attrs']['doc_key'] = 'recipes/second.md'
    other['props']['season_months'] = [6]
    other['props']['weather_tags'] = ['rain']
    monkeypatch.setattr(svc.recipe_repo, 'candidates', lambda *a: [row, other])
    assert svc.find_recipes(conn, month=6)[0]['recipe_id'] == 'recipe:second'
    assert svc.find_recipes(conn, month=11, weather='rain')[0]['recipe_id'] == 'recipe:second'
    embed = Mock()
    embed.embed.return_value = [[0.0] * 1024]
    monkeypatch.setattr(
        svc.recipe_repo, 'vector_order', lambda *a: ['recipes/second.md', 'recipes/fixture.md']
    )
    assert (
        svc.find_recipes(conn, month=3, q='요리', embedder=embed)[0]['recipe_id'] == 'recipe:second'
    )
    embed.embed.assert_called_once()


def test_primary_order_and_no_false_main_alias():
    dictionary = ir.item_labels()
    assert recipes.main_items('양파 사과 요리', ['양파 1개', '사과 1개'], dictionary) == [
        'item:onion',
        'item:apple',
    ]
    assert recipes.main_items('파프리카 요리', ['파프리카 1개', '다진 대파 5g'], dictionary) == [
        'item:paprika'
    ]  # 047
    chosen = ir.select(
        [{'RCP_SEQ': '1', 'RCP_NM': '사과 요리', 'RCP_PARTS_DTLS': '사과 1개, 양파 1개'}],
        dictionary,
        only_items={'item:apple'},
    )
    assert chosen['1'][1] == ['item:apple', 'item:onion']
