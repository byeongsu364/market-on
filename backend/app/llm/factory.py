"""설정에 따른 LLM 선택. 허용 의존성: llm 및 core."""
from app.core.config import settings
from app.core.errors import AppError
from .base import LLMProvider
from .gemini import GeminiProvider
from .gemma import GemmaProvider

def get_llm() -> LLMProvider:
    providers = {'gemini': GeminiProvider, 'gemma': GemmaProvider}
    provider = providers.get(settings.LLM_PROVIDER)
    if provider is None:
        raise AppError('INVALID_LLM_PROVIDER', '지원하지 않는 LLM 공급자입니다.')
    return provider()
