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
