"""앱 상태 확인. 허용 의존성: app 및 FastAPI 테스트 도구."""

from fastapi.testclient import TestClient
from app.main import app


def test_health():
    with TestClient(app) as client:
        response = client.get('/health')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}
