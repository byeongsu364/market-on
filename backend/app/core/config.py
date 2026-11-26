"""환경변수 설정. 허용 의존성: 표준 라이브러리 및 pydantic-settings."""

import logging
from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_LLM_ROUTES: dict[str, list[str]] = {
    # route는 젬마가 맡고, 젬마 서버가 꺼졌을 때만 제미나이 → GPT
    # (040 완료 기준: 젬마 없이도 물어보기가 답해야 함)
    'route': ['gemma', 'gemini', 'openai'],
    'plan': ['gemini', 'openai'],
    'extract': ['gemini', 'openai'],
    'write': ['gemma', 'gemini', 'openai'],
    'reason': ['gemini', 'openai', 'gemma'],
}


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
    MEDIA_DIR: Path = Path(__file__).resolve().parents[2] / 'storage'
    LLM_PROVIDER: str = 'gemma'
    OPENAI_API_KEY: str | None = None
    OPENAI_CHAT_MODEL: str | None = None
    OPENAI_BASE_URL: str = 'https://api.openai.com/v1'
    GEMINI_CHAT_MODEL: str = 'gemini-flash-lite-latest'
    # 역할별 모델 순서 (작업 지시서 040). 앞 모델이 실패하거나 답이 검사를 통과하지 못하면 다음 모델
    # route: 규칙으로 못 나눈 질문 의도 나누기 / plan: 대화 도구 고르기 / extract: 긴 근거에서 사실만 뽑기
    # write: 최종 한국어 답 / reason: 장보기 이유 문장. 사진 품목 인식은 구글 비전만 써서 여기 없음
    LLM_ROUTES: dict[str, list[str]] = dict(DEFAULT_LLM_ROUTES)

    @field_validator('LLM_ROUTES')
    @classmethod
    def fill_routes(cls, value: dict[str, list[str]]) -> dict[str, list[str]]:
        # .env에 예전 이름(recognize·ask·recommend·chat)만 있어도 서버가 멈추지 않게
        # 모르는 이름은 버리고, 빠진 역할은 기본 순서로 채움
        return DEFAULT_LLM_ROUTES | {k: v for k, v in value.items() if k in DEFAULT_LLM_ROUTES}

    # 외부 AI(제미나이·GPT) 사용 규칙: 모델별 하루 전체 횟수, 손님(기기·IP)별 1시간 횟수, 답변 길이
    EXTERNAL_LLM_DAILY_LIMIT: int = 500
    EXTERNAL_LLM_HOURLY_PER_CLIENT: int = 20
    LLM_MAX_OUTPUT_TOKENS: int = 2048
    # 구글 비전(사진 품목·가격표 글자): 사진 1장 = 라벨 1건 + 글자 1건
    # 하루 상한·한 달 상한(사진 수). 한 달은 llm_calls 기록으로 세서 재시작해도 유지
    # 무료 범위(기능별 월 1,000건)를 넘지 않게
    VISION_DAILY_LIMIT: int = 300
    VISION_MONTHLY_LIMIT: int = 1000
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
