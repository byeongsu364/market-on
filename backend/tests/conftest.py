"""공통 테스트 설정."""

import pytest
from app.core import captcha
from app.core.config import settings


@pytest.fixture(autouse=True)
def captcha_off_by_default(monkeypatch):
    """기존 테스트는 캡차 없이 돌고, 캡차 테스트만 켜서 확인해요."""
    monkeypatch.setattr(settings, 'CAPTCHA_ENABLED', False)
    captcha._reset_for_tests()
    yield
    captcha._reset_for_tests()


@pytest.fixture(autouse=True)
def no_external_ai_by_default(monkeypatch):
    """노트북 .env에 실제 키가 있어도 테스트가 제미나이·GPT를 부르지 않게 해요. 필요한 테스트만 켜요."""
    from app.llm import quota

    monkeypatch.setattr(settings, 'GEMINI_API_KEY', None)
    monkeypatch.setattr(settings, 'OPENAI_API_KEY', None)
    quota.reset()
    yield
    quota.reset()


@pytest.fixture(autouse=True)
def no_real_push(monkeypatch):
    from unittest.mock import Mock

    from app.services import web_push

    sender = Mock(return_value=201)
    monkeypatch.setattr(web_push, 'send', sender)
    yield sender
