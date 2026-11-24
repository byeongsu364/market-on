"""Ollama 대화·임베딩. 외부 HTTP는 core.http를 통해서만 호출해요."""

import base64
from typing import Literal
from app.core import http
from app.core.config import settings
from app.core.errors import AppError
from .base import LLMProvider


class OllamaProvider(LLMProvider):
    def _url(self, path: str) -> str:
        if not settings.OLLAMA_BASE_URL:
            raise AppError('LLM_NOT_CONFIGURED', 'OLLAMA_BASE_URL이 필요합니다.', 503)
        return settings.OLLAMA_BASE_URL.rstrip('/') + path

    def embed(self, texts: list[str], *, task: Literal['document', 'query']) -> list[list[float]]:
        """bge-m3는 문서·질문 구분이 없으므로 task를 무시해요."""
        url = self._url('/api/embed')
        vectors = []
        for start in range(0, len(texts), 32):
            batch = texts[start : start + 32]
            rows = http.post_sync(
                url,
                json={
                    'model': settings.OLLAMA_EMBEDDING_MODEL,
                    'input': batch,
                },
                timeout=120.0,
            ).json()['embeddings']
            if any(len(row) != settings.EMBEDDING_DIM for row in rows):
                raise AppError('EMBEDDING_DIM_MISMATCH', '임베딩 차원이 설정과 다릅니다.')
            if len(rows) != len(batch):
                raise AppError('INVALID_EMBEDDING', '임베딩 개수가 입력과 다릅니다.')
            vectors.extend(rows)
        return vectors

    def generate(
        self, prompt: str, *, images: list[bytes | str] | None = None, system: str | None = None
    ) -> str:
        url = self._url('/api/chat')
        messages = []
        if system is not None:
            messages.append({'role': 'system', 'content': system})
        message = {'role': 'user', 'content': prompt}
        if images:
            message['images'] = [
                base64.b64encode(img).decode('ascii') if isinstance(img, bytes) else img
                for img in images
            ]
        messages.append(message)
        return http.post_sync(
            url,
            json={
                'model': settings.OLLAMA_CHAT_MODEL,
                'messages': messages,
                'stream': False,
                'think': False,
            },
            timeout=180.0,
        ).json()['message']['content']
