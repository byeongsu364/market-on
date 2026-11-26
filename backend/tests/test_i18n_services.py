"""Translation at Korean service boundaries, using offline providers."""

from unittest.mock import Mock

import pytest

from app.llm import translate as tr
from app.llm.router import Routed
from app.schemas.ask import AskRequest
from app.schemas.chat import ChatRequest, ChatResponse
from app.schemas.recommend import RecommendRequest
from app.services import ask_service, recommend_service
from app.services.agent import agent_service
from tests.test_ask import env as ask_env  # noqa: F401
from tests.test_chat import env as chat_env  # noqa: F401
from tests.test_recommend import env as recommend_env  # noqa: F401


@pytest.fixture
def translation(monkeypatch):
    provider = Mock()
    provider.generate.return_value = 'Store at 0~2℃ for 1 month.'
    monkeypatch.setattr(
        tr,
        'run',
        lambda role, call, accept, **kw: Routed(call(provider), 'gemma', 'fake', False, None),
    )
    monkeypatch.setattr(ask_service.knowledge_repo, 'item_labels', lambda *args: [])
    monkeypatch.setattr(ask_service.ontology, 'match_variety', lambda *args: None)
    return provider.generate


def test_rag_once_and_cache(ask_env, translation, monkeypatch):  # noqa: F811
    monkeypatch.setattr(ask_service.storage, 'storage_statements', lambda *args, **kw: [])
    data = AskRequest(intent='store', item_id='item:green_onion', lang='en')
    first = ask_service.ask(ask_env.conn, data, 'device')
    assert first.translated and first.lang == 'en' and first.original.startswith('대파')
    assert first.citations[0].title == '출처'
    second = ask_service.ask(ask_env.conn, data, 'device')
    assert second.cached and second.answer == first.answer
    assert len(ask_env.calls) == 1
    translation.assert_called_once()
    assert ask_env.search.call_args.kwargs['lang'] == 'ko'


def test_failed_translation(ask_env, translation, monkeypatch):  # noqa: F811
    monkeypatch.setattr(ask_service.storage, 'storage_statements', lambda *args, **kw: [])
    translation.return_value = 'Store at 9℃ for 1 month.'
    result = ask_service.ask(
        ask_env.conn, AskRequest(intent='store', item_id='item:green_onion', lang='en'), 'device'
    )
    assert not result.translated and result.answer == result.original


def test_foreign_question(ask_env, translation):  # noqa: F811
    translation.side_effect = ['대파 씻은 뒤 보관 방법', 'Store at 0~2℃ for 1 month.']
    result = ask_service.ask(
        ask_env.conn,
        AskRequest(
            intent='store',
            item_id='item:green_onion',
            question='How do I store washed scallions?',
            lang='en',
        ),
        'device',
    )
    assert result.translated
    assert ask_env.search.call_args.args[2] == '대파 씻은 뒤 보관 방법'
    assert translation.call_count == 2


@pytest.mark.parametrize('lang', ['en', 'zh', 'ja', 'vi'])
def test_season_no_llm(ask_env, translation, monkeypatch, lang):  # noqa: F811
    from app.knowledge import season

    monkeypatch.setattr(
        season.repo,
        'season_relations',
        lambda *args: [
            {
                'predicate': 'inSeason',
                'object_id': 'season:03',
                'title': '원문 제목',
                'publisher': None,
                'url': None,
                'license': None,
            }
        ],
    )
    result = ask_service.ask(
        ask_env.conn, AskRequest(intent='season', item_id='item:green_onion', lang=lang), 'device'
    )
    assert result.translated and result.original.startswith('농촌진흥청')
    assert result.citations[0].title == '원문 제목'
    assert not ask_env.calls
    translation.assert_not_called()
    ask_env.search.assert_not_called()


def test_storage_no_llm(ask_env, translation, monkeypatch):  # noqa: F811
    monkeypatch.setattr(
        ask_service.storage.knowledge_repo,
        'storage_relations',
        lambda *args: [
            {
                'object_value': {'label': '0℃'},
                'title': '보관 원문',
                'publisher': None,
                'url': None,
                'license': None,
            }
        ],
    )
    result = ask_service.ask(
        ask_env.conn,
        AskRequest(
            intent='store', item_id='item:green_onion', question='What temperature?', lang='en'
        ),
        'device',
    )
    # 단위 기호는 번역 초안에서 ℃ 또는 °C로 쓰일 수 있어요 (숫자 검사는 둘을 같게 봄)
    assert result.translated and ('0℃' in result.answer or '0°C' in result.answer)
    translation.assert_not_called()
    assert not ask_env.calls


def test_chat_final(chat_env, translation, monkeypatch):  # noqa: F811
    generate = Mock(
        return_value=Routed(
            ChatResponse(reply='대파는 0~2℃에서 1개월 보관해요.'), 'fake', 'fake', False, None
        )
    )
    monkeypatch.setattr(agent_service.chat_llm, 'generate', generate)
    request = ChatRequest(
        market_id='market:demo',
        lang='en',
        messages=[{'role': 'user', 'content': 'How do I store scallions?'}],
    )
    result = agent_service.chat(None, request, 'device')
    assert generate.call_args.args[0][0]['content'] == request.messages[0].content
    assert result.translated and result.original.startswith('대파') and result.reply_sig
    translation.assert_called_once()


def test_recommend_final(recommend_env, translation):  # noqa: F811
    data = RecommendRequest(purpose='집밥', budget=10000, headcount=2, market_id='m', lang='en')
    translation.return_value = 'Check the peel of the apple.'
    result = recommend_service.recommend(recommend_env.conn, data, 'device')
    assert result.items[0].translated and result.items[0].original == '껍질을 확인해요.'
    translation.assert_called_once()
    recommend_service.recommend(recommend_env.conn, data, 'device')
    translation.assert_called_once()


def test_template_with_korean_falls_back_to_gemma(ask_env, translation, monkeypatch):  # noqa: F811
    """문장 틀에 번역이 빠져 한국어가 섞이면 템플릿 대신 젬마 번역, 실패하면 원문 (045 검수)."""
    monkeypatch.setattr(
        ask_service.storage,
        'storage_statements',
        lambda conn, item, name, lang='ko', **kw: [
            ('사과는 0℃에서 보관하는 게 알맞다고 안내해요.', [])
        ],
    )
    request = AskRequest(intent='store', item_id='item:green_onion', lang='en')
    translation.return_value = 'Store apples at 0℃.'
    result = ask_service.ask(ask_env.conn, request, 'device')
    translation.assert_called()
    assert result.translated and result.answer == 'Store apples at 0℃.'
