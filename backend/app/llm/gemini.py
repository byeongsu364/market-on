"""gemini 구현체 자리. 허용 의존성: llm.base 및 core."""
from typing import Any
from .base import LLMProvider

class GeminiProvider(LLMProvider):
    def generate(self, prompt: str, *, images: list[Any] | None = None, system: str | None = None) -> str:
        raise NotImplementedError

    def embed(self, texts: list[str], *, task: str) -> list[list[float]]:
        raise NotImplementedError
