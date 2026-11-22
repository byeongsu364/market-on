"""Gemini SDK calls are confined to the LLM layer."""
import time
from typing import Any, Literal
from google import genai
from google.genai import types, errors
from app.core.config import settings
from app.core.errors import AppError
from .base import LLMProvider

class GeminiProvider(LLMProvider):
    def generate(self, prompt: str, *, images: list[Any] | None = None, system: str | None = None) -> str:
        raise NotImplementedError

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
                batch = texts[start:start+100]
                for attempt in range(4):
                    try:
                        response = client.models.embed_content(
                            model=settings.GEMINI_EMBEDDING_MODEL, contents=batch,
                            config=types.EmbedContentConfig(task_type=tasks[task],
                                output_dimensionality=settings.EMBEDDING_DIM))
                        break
                    except errors.APIError as exc:
                        if attempt == 3 or not (exc.code == 429 or 500 <= (exc.code or 0) < 600):
                            raise
                        time.sleep(2 ** attempt)
                rows = [list(row.values or []) for row in (response.embeddings or [])]
                if len(rows) != len(batch) or any(len(v) != settings.EMBEDDING_DIM for v in rows):
                    raise AppError('INVALID_EMBEDDING', '임베딩 개수 또는 차원이 설정과 다릅니다.')
                vectors.extend(rows)
        return vectors
