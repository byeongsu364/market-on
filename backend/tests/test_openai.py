from app.llm.limits import http_timeout

"""OpenAI REST request and credential redaction without networking."""

import logging
from unittest.mock import Mock
import httpx
import pytest
from app.core import http
from app.core.config import settings
from app.core.errors import AppError
from app.llm.openai import OpenAIProvider


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, 'OPENAI_API_KEY', 'test-super-secret')
    monkeypatch.setattr(settings, 'OPENAI_CHAT_MODEL', 'chosen-model')
    monkeypatch.setattr(settings, 'OPENAI_BASE_URL', 'https://example.invalid/v1/')
    return OpenAIProvider()


@pytest.mark.parametrize(
    'image,mime', [(b'jpeg', 'jpeg'), (b'\x89PNGx', 'png'), (b'RIFFx', 'webp')]
)
def test_request(configured, monkeypatch, image, mime):
    import base64

    captured = Mock(
        return_value=httpx.Response(
            200,
            json={'choices': [{'message': {'content': 'answer'}}]},
            request=httpx.Request('POST', 'https://example.invalid'),
        )
    )
    client = Mock()
    client.request = captured
    manager = Mock()
    manager.__enter__ = Mock(return_value=client)
    manager.__exit__ = Mock(return_value=False)
    constructor = Mock(return_value=manager)
    monkeypatch.setattr(http.httpx, 'Client', constructor)
    assert configured.generate('prompt', images=[image], system='rules') == 'answer'
    args, kwargs = captured.call_args
    assert args == ('POST', 'https://example.invalid/v1/chat/completions')
    assert kwargs['headers'] == {'Authorization': 'Bearer test-super-secret'}
    assert kwargs['json'] == {
        'model': 'chosen-model',
        'messages': [
            {'role': 'system', 'content': 'rules'},
            {
                'role': 'user',
                'content': [
                    {'type': 'text', 'text': 'prompt'},
                    {
                        'type': 'image_url',
                        'image_url': {
                            'url': f'data:image/{mime};base64,'
                            + base64.b64encode(image).decode('ascii')
                        },
                    },
                ],
            },
        ],
    }
    constructor.assert_called_once_with(timeout=http_timeout('openai'))


def test_secret_redaction(configured, monkeypatch, caplog):
    def failed(*args, **kwargs):
        logging.getLogger('httpx').warning('Authorization: Bearer test-super-secret')
        raise httpx.ConnectError('test-super-secret')

    monkeypatch.setattr(http, 'post_sync', failed)
    with pytest.raises(AppError) as caught:
        configured.generate('prompt')
    assert 'test-super-secret' not in caplog.text
    import traceback

    assert 'test-super-secret' not in ''.join(traceback.format_exception(caught.value))


def test_not_configured(configured, monkeypatch):
    monkeypatch.setattr(settings, 'OPENAI_CHAT_MODEL', None)
    with pytest.raises(AppError) as caught:
        configured.generate('prompt')
    assert caught.value.code == 'LLM_NOT_CONFIGURED'


def test_secret_in_logged_traceback(configured, caplog):
    try:
        raise ValueError(settings.OPENAI_API_KEY)
    except ValueError:
        logging.getLogger('httpx').exception('failed')
    assert 'test-super-secret' not in caplog.text
