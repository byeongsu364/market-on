"""제미나이 연결: 답변·사진·도구 호출(채팅), 서명(thought_signature) 왕복, 오류 숨김. 실제 호출 없음."""

import json

import httpx
import pytest
from google import genai

from app.core.config import settings
from app.core.errors import AppError
from app.llm import chat as chat_llm
from app.llm import gemini
from app.llm.gemini import GeminiProvider
from app.services.agent import tools

KEY = 'AQ.test-gemini-secret'
TOOLS = [
    {
        'type': 'function',
        'function': {
            'name': 'search_items',
            'description': '품목 찾기',
            'parameters': {'type': 'object', 'properties': {'query': {'type': 'string'}}},
        },
    }
]


def reply(*parts):
    return {'candidates': [{'content': {'role': 'model', 'parts': list(parts)}}]}


@pytest.fixture
def wire(monkeypatch):
    """제미나이 SDK가 보내는 실제 HTTP 본문을 잡고, 정해 둔 응답을 돌려줘요."""
    monkeypatch.setattr(settings, 'GEMINI_API_KEY', KEY)
    monkeypatch.setattr(settings, 'GEMINI_CHAT_MODEL', 'gemini-test')
    sent, queue = [], []

    def handler(request):
        sent.append(
            {
                'url': str(request.url),
                'key': request.headers.get('x-goog-api-key'),
                'body': json.loads(request.content),
            }
        )
        item = queue.pop(0)
        return item if isinstance(item, httpx.Response) else httpx.Response(200, json=item)

    real = genai.Client
    monkeypatch.setattr(
        gemini.genai,
        'Client',
        lambda api_key: real(
            api_key=api_key,
            http_options={'httpx_client': httpx.Client(transport=httpx.MockTransport(handler))},
        ),
    )
    return sent, queue


def test_generate_text_and_photo(wire):
    sent, queue = wire
    queue.append(reply({'text': '생각 중', 'thought': True}, {'text': '대파'}))
    png = b'\x89PNG\r\n\x1a\nimage'
    assert GeminiProvider().generate('무엇?', images=[png], system='규칙') == '대파'
    (request,) = sent
    assert '/v1beta/models/gemini-test:generateContent' in request['url']
    assert KEY not in request['url']
    assert request['key'] == KEY
    body = request['body']
    assert body['systemInstruction']['parts'] == [{'text': '규칙'}]
    parts = body['contents'][0]['parts']
    assert parts[0] == {'text': '무엇?'}
    assert parts[1]['inlineData']['mime_type'] == 'image/png'
    assert body['generationConfig']['maxOutputTokens'] == settings.LLM_MAX_OUTPUT_TOKENS


def test_empty_answer_is_failure(wire):
    _, queue = wire
    queue.append(reply())
    with pytest.raises(AppError) as error:
        GeminiProvider().generate('무엇?')
    assert error.value.code == 'GEMINI_UNAVAILABLE'


def test_errors_hide_details_and_retry_once(wire):
    sent, queue = wire
    queue.extend([httpx.Response(503, json={'error': {'message': f'busy {KEY}'}})] * 2)
    with pytest.raises(AppError) as error:
        GeminiProvider().generate('무엇?')
    assert error.value.code == 'GEMINI_UNAVAILABLE'
    assert KEY not in str(error.value) and error.value.__cause__ is None
    assert len(sent) == 2  # 처음 1번 + 재시도 1번


def test_without_key(monkeypatch):
    monkeypatch.setattr(settings, 'GEMINI_API_KEY', None)
    with pytest.raises(AppError) as error:
        GeminiProvider().generate('무엇?')
    assert error.value.code == 'LLM_NOT_CONFIGURED'


def test_chat_tool_loop_returns_signature(wire, monkeypatch):
    """제미나이 3은 도구 호출 서명을 다음 턴에 돌려줘야 해요 (없으면 400)."""
    sent, queue = wire
    queue.extend(
        [
            reply(
                {
                    'functionCall': {
                        'id': 'call_9',
                        'name': 'search_items',
                        'args': {'query': '대파'},
                    },
                    'thoughtSignature': 'c2lnbmF0dXJl',
                }
            ),
            reply({'text': '잎이 싱싱한 걸 골라요.'}),
        ]
    )
    provider = GeminiProvider()
    monkeypatch.setattr(chat_llm, 'run', lambda task, call, accept: call(provider))
    calls = []
    result = chat_llm.generate(
        [{'role': 'user', 'content': '대파 어떻게 골라?'}],
        TOOLS,
        lambda name, args: calls.append((name, args)) or [{'item_id': 'item:green_onion'}],
        lambda text, results: text,
    )
    assert result == '잎이 싱싱한 걸 골라요.'
    assert calls == [('search_items', {'query': '대파'})]
    assert all('/v1beta/' in r['url'] for r in sent)
    first, second = (r['body'] for r in sent)
    assert first['tools'][0]['functionDeclarations'][0]['name'] == 'search_items'
    assert 'systemInstruction' in first
    model_turn, tool_turn = second['contents'][1], second['contents'][2]
    assert model_turn == {
        'role': 'model',
        'parts': [
            {
                'functionCall': {'id': 'call_9', 'name': 'search_items', 'args': {'query': '대파'}},
                'thoughtSignature': 'c2lnbmF0dXJl',
            }
        ],
    }
    response = tool_turn['parts'][0]['functionResponse']
    assert (response['id'], response['name']) == ('call_9', 'search_items')
    assert response['response'] == {'result': [{'item_id': 'item:green_onion'}]}


def test_chat_call_without_id_gets_one(wire):
    _, queue = wire
    queue.append(reply({'functionCall': {'name': 'search_items', 'args': {'query': '양파'}}}))
    out = GeminiProvider().chat([{'role': 'user', 'content': '양파'}], TOOLS)
    assert out == {
        'content': None,
        'tool_calls': [{'id': 'gemini-0', 'name': 'search_items', 'arguments': {'query': '양파'}}],
    }


def test_real_tool_schemas_are_accepted_by_sdk(wire):
    _, queue = wire
    queue.append(reply({'text': '네'}))
    assert GeminiProvider().chat([{'role': 'user', 'content': '안녕'}], tools.get_tools()) == {
        'content': '네',
        'tool_calls': [],
    }
