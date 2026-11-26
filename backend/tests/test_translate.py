"""Translation boundaries tested without a database or a provider connection."""

from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.core.config import Settings, settings
from app.knowledge.fact_check import translation_check
from app.llm import router
from app.llm import translate as tr


@pytest.mark.parametrize(
    ('original', 'target', 'lang', 'ok'),
    [
        ('0~2도, 90~95%, 1개월', '0~2°C, 90~95%, 1 month', 'en', True),
        ('0~2℃, 1달', '0~3℃, 1 month', 'en', False),
        ('10kg 500g 2000원 2개', '10kg 500g 2000원 2개', 'en', True),
        ('10kg', '10g', 'en', False),
        (
            '2kg 3g 1000원 2개 2℃',
            '2 kilograms 3 grams 1000 won 2 pieces 2 degrees Celsius',
            'en',
            True,
        ),
        ('1000원', '1000', 'en', False),
        ('1개월', '1 month 2 days', 'en', False),
        ('2일 보관해요.', 'Store for 2 days. Recommended!', 'en', False),
        ('보관해요.', '新鲜，推荐购买。', 'zh', False),
        ('보관해요.', '新鮮でおすすめです。', 'ja', False),
        ('보관해요.', 'Nên mua vì tươi.', 'vi', False),
        ('1~3개월', '1–3 months', 'en', True),
        ('1~3개월', '1~3个月', 'zh', True),
        ('1~3개월', '1~3か月', 'ja', True),
        ('1~3개월', '1~3 tháng', 'vi', True),
    ],
)
def test_check(original, target, lang, ok):
    assert bool(translation_check(original, target, lang)) is ok


@pytest.fixture
def gemma(monkeypatch):
    monkeypatch.setattr(settings, 'OLLAMA_BASE_URL', 'http://never.invalid')
    monkeypatch.setattr(settings, 'LLM_ROUTES', {'translate': ['gemini', 'openai']})
    provider = Mock()
    factory = Mock(return_value=provider)
    monkeypatch.setattr(router, '_provider', factory)
    monkeypatch.setattr(router.llm_call_repo, 'record', Mock())
    return provider, factory


def test_translate_gemma_only_failure_and_rejection(gemma):
    provider, factory = gemma
    provider.generate.side_effect = TimeoutError('offline')
    assert tr.translate('2℃ 보관', 'en') == ('2℃ 보관', False)
    factory.assert_called_once_with('gemma')
    provider.generate.side_effect = None
    provider.generate.return_value = 'Store at 3℃'
    assert tr.translate('2℃ 보관', 'en') == ('2℃ 보관', False)
    assert {call.args[0] for call in factory.call_args_list} == {'gemma'}
    assert Settings(_env_file=None, LLM_ROUTES={'translate': ['openai']}).LLM_ROUTES[
        'translate'
    ] == ['gemma']


def test_translation_cache_and_placeholder(gemma, monkeypatch):
    provider, _ = gemma
    cache = {}
    monkeypatch.setattr(tr.ask_repo, 'get_cache', lambda c, k: cache.get(k))
    monkeypatch.setattr(tr.ask_repo, 'put_cache', lambda c, k, v, m: cache.update({k: v}))
    provider.generate.return_value = 'Store {name} at 2℃'
    source = '{name} 2℃ 보관'
    assert tr.translate(source, 'en', object()) == ('Store {name} at 2℃', True)
    assert tr.translate(source, 'en', object())[1]
    provider.generate.assert_called_once()
    assert next(iter(cache)).startswith('tr:en:')
    provider.generate.return_value = '保存 2℃'
    assert tr.translate(source, 'ja')[1] is False
    assert tr.translate(source, 'ko') == (source, False)
    # Recheck corrupt/old cache entries instead of trusting them.
    cache[next(iter(cache))] = {'text': 'Store {name} at 99℃'}
    provider.generate.return_value = 'Store {name} at 2℃'
    assert tr.translate(source, 'en', object())[1]
    assert provider.generate.call_count == 3


def test_language_negotiation():
    from app.core.language import preferred_language

    request = SimpleNamespace(
        query_params={}, headers={'accept-language': 'fr;q=1, ja-JP;q=0.9, en;q=0.5'}
    )
    assert preferred_language(request) == 'ja'
    request.query_params = {'lang': 'vi'}
    assert preferred_language(request) == 'vi'


def test_structured_names_leave_sources_alone(monkeypatch):
    from app.knowledge import i18n

    monkeypatch.setattr(
        i18n,
        'label',
        lambda c, eid, lang, fallback: {'item:apple': 'apple', 'variety:apple-fuji': 'Fuji'}.get(
            eid, fallback
        ),
    )
    original = {
        'item_id': 'item:apple',
        'name': '사과',
        'source': {'title': '사과 자료'},
        'varieties': [{'variety_id': 'variety:apple-fuji', 'name': '후지'}],
    }
    result = i18n.localize(None, original, 'en')
    assert result['name'] == 'apple'
    assert result['varieties'][0]['name'] == 'Fuji'
    assert result['source'] == original['source']
    assert original['name'] == '사과'


def test_recipe_templates_keep_season_and_weather(monkeypatch):
    from app.services import recipe_service

    monkeypatch.setattr(recipe_service.i18n, 'label', lambda c, eid, lang, fallback: 'scallion')
    seasonal = recipe_service.reason('대파', '국', [3], 3, None, [], lang='en')
    # 요리 종류까지 번역돼 있으면 영어 문장, 한 조각이라도 없으면 섞지 않고 한국어 원문 전체
    hangul = any('가' <= ch <= '힣' for ch in seasonal)
    assert (not hangul and '3' in seasonal and 'scallion' in seasonal) or (
        seasonal == '3월 제철 대파로 만드는 국'
    )
    original_text = recipe_service.i18n.text
    monkeypatch.setattr(
        recipe_service.i18n,
        'text',
        lambda key, lang, fallback, section='entities': (
            'soup' if key == '국' else original_text(key, lang, fallback, section=section)
        ),
    )
    seasonal = recipe_service.reason('대파', '국', [3], 3, None, [], lang='en')
    assert '3' in seasonal and 'scallion' in seasonal and 'soup' in seasonal
    # An untranslated weather qualifier keeps the complete Korean reason.
    weather = recipe_service.reason('대파', '국', [3], 3, 'cold', ['cold'], lang='en')
    # 날씨 이유도 모두 번역되면 영어, 한 조각이라도 없으면 한국어 원문 전체 (섞지 않음)
    assert weather in ('boiled on a cold day soup', '추운 날 끓이는 국') or not any(
        '가' <= ch <= '힣' for ch in weather
    )
