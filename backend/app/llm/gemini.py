"""Gemini SDK calls are confined to the LLM layer."""

import base64
import json
import time
from typing import Any, Literal

from google import genai
from google.genai import errors, types

from app.core.config import settings
from app.core.errors import AppError

from .base import LLMProvider
from .limits import PROVIDER_TIMEOUTS


def _mime(image: bytes) -> str:
    if image.startswith(b'\x89PNG'):
        return 'image/png'
    if image.startswith(b'RIFF'):
        return 'image/webp'
    return 'image/jpeg'


def _config(system: str | None = None, tools: list[dict] | None = None):
    """출력 길이 상한, 시간 제한, 재시도 1번(총 2번 시도)."""
    return types.GenerateContentConfig(
        system_instruction=system,
        max_output_tokens=settings.LLM_MAX_OUTPUT_TOKENS,
        tools=[
            types.Tool(
                function_declarations=[
                    types.FunctionDeclaration(
                        name=t['function']['name'],
                        description=t['function'].get('description', ''),
                        parameters_json_schema=t['function'].get('parameters'),
                    )
                    for t in tools
                ]
            )
        ]
        if tools
        else None,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        http_options=types.HttpOptions(
            # SDK 기본(v1)에는 '-latest' 모델 이름이 없어 404 → v1beta (2026-11-26 노트북 실연결에서 확인)
            api_version='v1beta',
            timeout=int(PROVIDER_TIMEOUTS['gemini'] * 1000),
            retry_options=types.HttpRetryOptions(
                attempts=2, http_status_codes=[429, 500, 502, 503, 504]
            ),
        ),
    )


def _contents(messages: list[dict], signatures: dict | None = None) -> tuple[str | None, list]:
    """OpenAI 형식 대화(system·user·assistant·tool)를 제미나이 형식으로 바꿔요.

    signatures: 제미나이가 도구 호출에 붙여 준 서명(thought_signature). 다음 턴에 그대로 돌려줘야 해요.
    """
    signatures = signatures or {}
    system, contents = [], []
    for message in messages:
        role, text = message['role'], message.get('content') or ''
        if role == 'system':
            system.append(text)
        elif role == 'user':
            contents.append(types.Content(role='user', parts=[types.Part.from_text(text=text)]))
        elif role == 'assistant':
            parts = [types.Part.from_text(text=text)] if text else []
            for call in message.get('tool_calls') or []:
                args = call['function']['arguments']
                parts.append(
                    types.Part(
                        function_call=types.FunctionCall(
                            id=call.get('id'),
                            name=call['function']['name'],
                            args=json.loads(args) if isinstance(args, str) else args,
                        ),
                        thought_signature=signatures.get(call.get('id')),
                    )
                )
            if parts:
                contents.append(types.Content(role='model', parts=parts))
        elif role == 'tool':
            try:
                value = json.loads(text)
            except ValueError:
                value = text
            contents.append(
                types.Content(
                    role='user',
                    parts=[
                        types.Part(
                            function_response=types.FunctionResponse(
                                id=message.get('tool_call_id'),
                                name=message.get('name'),
                                response={'result': value},
                            )
                        )
                    ],
                )
            )
    return ('\n\n'.join(system) or None), contents


def _call(contents, config):
    if not settings.GEMINI_API_KEY:
        raise AppError('LLM_NOT_CONFIGURED', 'GEMINI_API_KEY가 필요합니다.', 503)
    try:
        with genai.Client(api_key=settings.GEMINI_API_KEY) as client:
            return client.models.generate_content(
                model=settings.GEMINI_CHAT_MODEL, contents=contents, config=config
            )
    except Exception:  # noqa: BLE001 - 오류 문구에 키·요청 내용이 섞일 수 있어 숨김
        raise AppError('GEMINI_UNAVAILABLE', '제미나이 요청에 실패했습니다.', 503) from None


def _parts(response) -> list:
    candidates = response.candidates or []
    if not candidates or not candidates[0].content:
        return []
    return list(candidates[0].content.parts or [])


class GeminiProvider(LLMProvider):
    def generate(
        self, prompt: str, *, images: list[Any] | None = None, system: str | None = None
    ) -> str:
        parts = [types.Part.from_text(text=prompt)]
        for image in images or []:
            if isinstance(image, str):
                image = base64.b64decode(image.split(',', 1)[-1])
            parts.append(types.Part.from_bytes(data=image, mime_type=_mime(image)))
        response = _call([types.Content(role='user', parts=parts)], _config(system))
        text = ''.join(p.text or '' for p in _parts(response) if not getattr(p, 'thought', False))
        if not text.strip():
            raise AppError('GEMINI_UNAVAILABLE', '제미나이 답변이 비어 있습니다.', 503)
        return text

    def __init__(self):
        # 같은 대화(도구 반복) 동안 도구 호출 서명을 기억 — 라우터가 한 번의 대화에 같은 객체를 써요
        self._signatures: dict[str, bytes] = {}

    def chat(self, messages, tools):
        system, contents = _contents(messages, self._signatures)
        parts = _parts(_call(contents, _config(system, tools)))
        calls = []
        for p in parts:
            if p.function_call:
                call_id = p.function_call.id or f'gemini-{len(self._signatures) + len(calls)}'
                p.function_call.id = call_id
                if p.thought_signature:
                    self._signatures[call_id] = p.thought_signature
                calls.append(p.function_call)
        return {
            'content': ''.join(
                p.text or '' for p in parts if p.text and not getattr(p, 'thought', False)
            )
            or None,
            'tool_calls': [
                {'id': c.id, 'name': c.name, 'arguments': dict(c.args or {})} for c in calls
            ],
        }

    def embed(self, texts: list[str], *, task: Literal['document', 'query']) -> list[list[float]]:
        tasks = {'document': 'RETRIEVAL_DOCUMENT', 'query': 'RETRIEVAL_QUERY'}
        if task not in tasks:
            raise ValueError(task)
        if not texts:
            return []
        if not settings.GEMINI_API_KEY:
            raise AppError('LLM_NOT_CONFIGURED', 'GEMINI_API_KEY가 필요합니다.', 503)
        vectors = []
        with genai.Client(api_key=settings.GEMINI_API_KEY) as client:
            for start in range(0, len(texts), 100):
                batch = texts[start : start + 100]
                for attempt in range(4):
                    try:
                        response = client.models.embed_content(
                            model=settings.GEMINI_EMBEDDING_MODEL,
                            contents=batch,
                            config=types.EmbedContentConfig(
                                task_type=tasks[task], output_dimensionality=settings.EMBEDDING_DIM
                            ),
                        )
                        break
                    except errors.APIError as exc:
                        if attempt == 3 or not (exc.code == 429 or 500 <= (exc.code or 0) < 600):
                            raise
                        time.sleep(2**attempt)
                rows = [list(row.values or []) for row in (response.embeddings or [])]
                if len(rows) != len(batch) or any(len(v) != settings.EMBEDDING_DIM for v in rows):
                    raise AppError('INVALID_EMBEDDING', '임베딩 개수 또는 차원이 설정과 다릅니다.')
                vectors.extend(rows)
        return vectors
