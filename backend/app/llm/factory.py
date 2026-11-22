"""Independent generation and embedding provider selection."""
from app.core.config import settings
from app.core.errors import AppError
from .base import LLMProvider
from .gemini import GeminiProvider
from .ollama import OllamaProvider
from .fake import FakeProvider

def _provider(name: str) -> LLMProvider:
    providers = {'gemini': GeminiProvider, 'ollama': OllamaProvider, 'gemma': OllamaProvider, 'fake': FakeProvider}
    if name not in providers:
        raise AppError('INVALID_LLM_PROVIDER', f'지원하지 않는 공급자: {name}')
    return providers[name]()

def get_llm() -> LLMProvider:
    return _provider(settings.LLM_PROVIDER)

def get_embedder() -> LLMProvider:
    return _provider(settings.EMBEDDING_PROVIDER)
