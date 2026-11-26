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
    # 자동입력 방지 문자: 회원가입·입점 신청은 항상, 로그인은 같은 아이디로 2번 틀린 뒤부터
    CAPTCHA_ENABLED: bool = True
    SESSION_DAYS: int = 30
    DATABASE_URL: str | None = None
    GEMINI_API_KEY: str | None = None
    GOOGLE_VISION_API_KEY: str | None = None
    DATA_GO_KR_KEY: str | None = None
    FOODSAFETY_KEY: str | None = None
    NAVER_MAP_CLIENT_ID: str | None = None
    NAVER_MAP_CLIENT_SECRET: str | None = None
    # 카카오 로컬(키워드로 장소 검색): 점포 위치 찾기(scripts.load_kakao_places)에만 씀. 서버 전용
    KAKAO_REST_API_KEY: str | None = None
    MEDIA_DIR: Path = Path(__file__).resolve().parents[2] / 'storage'
    LLM_PROVIDER: str = 'gemma'
    OPENAI_API_KEY: str | None = None
    OPENAI_CHAT_MODEL: str | None = None
    OPENAI_BASE_URL: str = 'https://api.openai.com/v1'
    GEMINI_CHAT_MODEL: str = 'gemini-flash-lite-latest'
    # 젬마(학교 서버)가 먼저 답하고, 막히면 제미나이, 그래도 막히면 GPT
    LLM_ROUTES: dict[str, list[str]] = {
        'recognize': ['gemma', 'gemini', 'openai'],
        'ask': ['gemma', 'gemini', 'openai'],
        'recommend': ['gemma', 'gemini', 'openai'],
        'chat': ['gemma', 'gemini', 'openai'],
    }
    # 외부 AI(제미나이·GPT) 사용 규칙: 모델별 하루 전체 횟수, 손님(기기·IP)별 1시간 횟수, 답변 길이
    EXTERNAL_LLM_DAILY_LIMIT: int = 500
    EXTERNAL_LLM_HOURLY_PER_CLIENT: int = 20
    LLM_MAX_OUTPUT_TOKENS: int = 2048
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
