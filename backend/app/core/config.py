"""환경변수 설정. 허용 의존성: 표준 라이브러리 및 pydantic-settings."""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[3] / '.env', extra='ignore')
    DATABASE_URL: str | None = None
    GEMINI_API_KEY: str | None = None
    GOOGLE_VISION_API_KEY: str | None = None
    KAMIS_SERVICE_KEY: str | None = None
    KAKAO_REST_API_KEY: str | None = None
    KMA_SERVICE_KEY: str | None = None
    LLM_PROVIDER: str = 'gemma'
    EMBEDDING_PROVIDER: str = 'ollama'
    GEMINI_EMBEDDING_MODEL: str = 'gemini-embedding-001'
    EMBEDDING_DIM: int = 1024
    OLLAMA_BASE_URL: str | None = None
    OLLAMA_CHAT_MODEL: str = 'gemma4:e4b'
    OLLAMA_EMBEDDING_MODEL: str = 'bge-m3:latest'
    CORS_ORIGINS: list[str] = ['http://localhost:5173']

settings = Settings()
