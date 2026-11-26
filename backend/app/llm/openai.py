"""OpenAI Chat Completions through the shared HTTP transport."""

import base64
import json

from app.core import http
from app.core.config import settings
from app.core.errors import AppError

from .base import LLMProvider
from .limits import http_timeout


class OpenAIProvider(LLMProvider):
    def generate(self, prompt, *, images=None, system=None):
        if not (settings.OPENAI_API_KEY and settings.OPENAI_CHAT_MODEL):
            raise AppError('LLM_NOT_CONFIGURED', 'OpenAI 설정이 필요합니다.', 503)
        messages = []
        if system is not None:
            messages.append({'role': 'system', 'content': system})
        content = [{'type': 'text', 'text': prompt}]
        for image in images or []:
            if isinstance(image, bytes):
                mime = (
                    'image/png'
                    if image.startswith(b'\x89PNG')
                    else ('image/webp' if image.startswith(b'RIFF') else 'image/jpeg')
                )
                image = f'data:{mime};base64,' + base64.b64encode(image).decode('ascii')
            elif not image.startswith('data:'):
                image = 'data:image/jpeg;base64,' + image
            content.append({'type': 'image_url', 'image_url': {'url': image}})
        messages.append({'role': 'user', 'content': content if images else prompt})
        try:
            return http.post_sync(
                settings.OPENAI_BASE_URL.rstrip('/') + '/chat/completions',
                headers={'Authorization': f'Bearer {settings.OPENAI_API_KEY}'},
                json={
                    'model': settings.OPENAI_CHAT_MODEL,
                    'messages': messages,
                    'max_completion_tokens': settings.LLM_MAX_OUTPUT_TOKENS,
                },
                timeout=http_timeout('openai'),
                retries=1,
            ).json()['choices'][0]['message']['content']
        except Exception:  # noqa: BLE001 - sanitize transport errors that may contain credentials
            # Transport exceptions can contain arbitrary server text, including credentials.
            raise AppError('OPENAI_UNAVAILABLE', 'OpenAI 요청에 실패했습니다.', 503) from None

    def embed(self, texts, *, task):
        raise NotImplementedError

    def chat(self, messages, tools):
        try:
            body = {
                'model': settings.OPENAI_CHAT_MODEL,
                'messages': messages,
                'max_completion_tokens': settings.LLM_MAX_OUTPUT_TOKENS,
            }
            if tools:
                body['tools'] = tools
            message = http.post_sync(
                settings.OPENAI_BASE_URL.rstrip('/') + '/chat/completions',
                headers={'Authorization': f'Bearer {settings.OPENAI_API_KEY}'},
                json=body,
                timeout=http_timeout('openai'),
                retries=1,
            ).json()['choices'][0]['message']
            return {
                'content': message.get('content'),
                'tool_calls': [
                    {
                        'id': c['id'],
                        'name': c['function']['name'],
                        'arguments': json.loads(c['function']['arguments']),
                    }
                    for c in message.get('tool_calls', [])
                ],
            }
        except Exception:  # noqa: BLE001 - sanitize transport errors that may contain credentials
            raise AppError('OPENAI_UNAVAILABLE', 'OpenAI 요청에 실패했습니다.', 503) from None
