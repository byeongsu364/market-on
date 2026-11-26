import json

from fastapi.testclient import TestClient

from app.deps import current_user, get_db, require_operator
from app.main import app
from app.services import pipeline_report_service as service


def test_report_operator_only_and_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(service, 'BUILD', tmp_path)
    app.dependency_overrides[get_db] = lambda: None
    client = TestClient(app)
    assert client.get('/admin/pipeline/report').status_code == 401
    app.dependency_overrides[require_operator] = lambda: {'role': 'operator'}
    try:
        assert client.get('/admin/pipeline/report').status_code == 404
        (tmp_path / 'load_report.json').write_text(json.dumps({'checks': [], 'started_at': 'now'}))
        response = client.get('/admin/pipeline/report')
        assert response.status_code == 200
        assert response.json()['load']['started_at'] == 'now'
        assert response.json()['eval'] is None
    finally:
        app.dependency_overrides.pop(require_operator, None)
        app.dependency_overrides.pop(get_db, None)


def test_non_operator_forbidden():
    app.dependency_overrides[current_user] = lambda: {'role': 'merchant', 'status': 'approved'}
    try:
        assert TestClient(app).get('/admin/pipeline/report').status_code == 403
    finally:
        app.dependency_overrides.pop(current_user, None)
