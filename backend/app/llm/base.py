"""LLM 인터페이스. 허용 의존성: 표준 라이브러리."""
from abc import ABC, abstractmethod
from typing import Any, Literal

class LLMProvider(ABC):
    @abstractmethod
    def generate(self, prompt: str, *, images: list[Any] | None = None, system: str | None = None) -> str:
        raise NotImplementedError

    @abstractmethod
    def embed(self, texts: list[str], *, task: Literal['document', 'query']) -> list[list[float]]:
        raise NotImplementedError
