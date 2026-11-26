from app.llm.limits import http_timeout

"""Ollama 요청 계약은 HTTP를 monkeypatch하여 오프라인으로 검증해요."""

import base64
import os
from unittest.mock import Mock
import pytest
from app.core import http
from app.core.config import settings
from app.core.errors import AppError
from app.llm.ollama import OllamaProvider
from app.llm.factory import get_llm


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, 'OLLAMA_BASE_URL', 'http://localhost:11434/')
    return OllamaProvider()


@pytest.mark.parametrize('task', ['document', 'query'])
def test_batches(configured, monkeypatch, task):
    calls = []

    def post(url, *, json, timeout):
        calls.append((url, json, timeout))
        return Mock(
            json=lambda: {'embeddings': [[0.0] * settings.EMBEDDING_DIM for _ in json['input']]}
        )

    monkeypatch.setattr(http, 'post_sync', post)
    assert len(configured.embed(['x'] * 65, task=task)) == 65
    assert [len(c[1]['input']) for c in calls] == [32, 32, 1]
    assert all(
        c[0] == 'http://localhost:11434/api/embed' and c[2] == http_timeout('gemma', 120.0)
        for c in calls
    )
    assert all(c[1]['model'] == settings.OLLAMA_EMBEDDING_MODEL for c in calls)
    assert configured.embed([], task=task) == []
    assert len(calls) == 3


@pytest.mark.parametrize(
    'rows,code', [([[1.0]], 'EMBEDDING_DIM_MISMATCH'), ([], 'INVALID_EMBEDDING')]
)
def test_invalid_embeddings(configured, monkeypatch, rows, code):
    monkeypatch.setattr(http, 'post_sync', lambda *a, **k: Mock(json=lambda: {'embeddings': rows}))
    with pytest.raises(AppError) as exc:
        configured.embed(['x'], task='query')
    assert exc.value.code == code


def test_generate(configured, monkeypatch):
    post = Mock(return_value=Mock(json=lambda: {'message': {'content': '답변'}}))
    monkeypatch.setattr(http, 'post_sync', post)
    encoded = base64.b64encode(b'image').decode('ascii')
    assert configured.generate('질문', images=[b'image', encoded], system='지침') == '답변'
    post.assert_called_once_with(
        'http://localhost:11434/api/chat',
        json={
            'model': settings.OLLAMA_CHAT_MODEL,
            'messages': [
                {'role': 'system', 'content': '지침'},
                {'role': 'user', 'content': '질문', 'images': [encoded, encoded]},
            ],
            'stream': False,
            'think': False,
        },
        timeout=http_timeout('gemma'),
    )
    configured.generate('짧은 질문')
    assert post.call_args.kwargs['json']['messages'] == [{'role': 'user', 'content': '짧은 질문'}]


@pytest.mark.parametrize('method', ['embed', 'generate'])
def test_not_configured(monkeypatch, method):
    monkeypatch.setattr(settings, 'OLLAMA_BASE_URL', None)
    post = Mock()
    monkeypatch.setattr(http, 'post_sync', post)
    with pytest.raises(AppError) as exc:
        if method == 'embed':
            OllamaProvider().embed(['x'], task='document')
        else:
            OllamaProvider().generate('x')
    assert exc.value.code == 'LLM_NOT_CONFIGURED'
    assert exc.value.status_code == 503
    post.assert_not_called()


@pytest.mark.parametrize('name', ['ollama', 'gemma'])
def test_factory(monkeypatch, name):
    monkeypatch.setattr(settings, 'LLM_PROVIDER', name)
    assert isinstance(get_llm(), OllamaProvider)


@pytest.mark.skipif(os.getenv('RUN_OLLAMA_TESTS') != '1', reason='RUN_OLLAMA_TESTS=1 required')
def test_real_ollama():
    provider = OllamaProvider()
    rows = provider.embed(['대파 고르는 법'], task='query')
    assert len(rows) == 1 and len(rows[0]) == 1024
    assert provider.generate('안녕이라고 짧게 답하세요.').strip()
