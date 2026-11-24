"""환경변수 설정. 허용 의존성: 표준 라이브러리 및 pydantic-settings."""

import logging
from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[3] / '.env', extra='ignore'
    )
    DEVICE_HASH_SALT: str = ''

    @model_validator(mode='after')
    def device_salt(self):
        if not self.DEVICE_HASH_SALT.strip():
            self.DEVICE_HASH_SALT = 'market-on-development-device-salt'
            logging.getLogger(__name__).warning(
                'DEVICE_HASH_SALT 미설정: 개발용 고정값을 사용합니다.'
            )
        return self

    COOKIE_SECURE: bool = False
    SESSION_DAYS: int = 30
    DATABASE_URL: str | None = None
    GEMINI_API_KEY: str | None = None
    GOOGLE_VISION_API_KEY: str | None = None
    DATA_GO_KR_KEY: str | None = None
    FOODSAFETY_KEY: str | None = None
    NAVER_MAP_CLIENT_ID: str | None = None
    NAVER_MAP_CLIENT_SECRET: str | None = None
    MEDIA_DIR: Path = Path(__file__).resolve().parents[2] / 'storage'
    LLM_PROVIDER: str = 'gemma'
    EMBEDDING_PROVIDER: str = 'ollama'
    GEMINI_EMBEDDING_MODEL: str = 'gemini-embedding-001'
    EMBEDDING_DIM: int = 1024
    OLLAMA_BASE_URL: str | None = None
    OLLAMA_CHAT_MODEL: str = 'gemma4:e4b'
    OLLAMA_EMBEDDING_MODEL: str = 'bge-m3:latest'
    CORS_ORIGINS: list[str] = ['http://localhost:5173']

    @field_validator('CORS_ORIGINS')
    @classmethod
    def no_wildcard_origin(cls, value: list[str]) -> list[str]:
        # 로그인 쿠키(allow_credentials=True)와 '*'를 같이 쓰면 아무 사이트나 로그인된 요청을 보낼 수 있음
        if any(origin.strip() == '*' for origin in value):
            raise ValueError('CORS_ORIGINS에 *를 쓸 수 없어요. 실제 주소를 적어요.')
        return value


settings = Settings()
