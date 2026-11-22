"""DB 설정 누락 시 지연 연결 오류 확인."""
import pytest
from app.core.config import settings
from app.core.errors import AppError
from app.db.pool import get_pool


def test_get_pool_without_database_url(monkeypatch):
    monkeypatch.setattr(settings, 'DATABASE_URL', None)
    with pytest.raises(AppError) as error:
        get_pool()
    assert error.value.code == 'DB_NOT_CONFIGURED'
    assert error.value.status_code == 503
    assert 'DATABASE_URL' in error.value.message
