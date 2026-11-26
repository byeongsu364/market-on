"""Translated labels and account preferences in guarded marketon_test only."""

import os

import pytest
import yaml
from fastapi.testclient import TestClient

from app.deps import current_user, get_db
from app.main import app
from app.services import item_service
from scripts.load_ontology import load_ontology
from tests.test_ingest_db import db  # noqa: F401

pytestmark = pytest.mark.skipif(not os.getenv('TEST_DATABASE_URL'), reason='test DB required')


def test_loader_labels(db, tmp_path):  # noqa: F811
    directory = tmp_path / 'ontology'
    directory.mkdir()
    (tmp_path / 'i18n').mkdir()
    (directory / 'items.yaml').write_text(
        yaml.safe_dump(
            {
                'entities': [
                    {
                        'id': 'item:i18n-test',
                        'type': 'item',
                        'name_ko': '시험',
                        'labels': {'ko': ['시험'], 'en': ['test']},
                        'criteria': [{'key': 'firm', 'text': '단단함'}],
                    }
                ]
            }
        )
    )
    (tmp_path / 'i18n/en.yaml').write_text(
        yaml.safe_dump(
            {
                'entities': {
                    'item:i18n-test': {'text': 'test', 'reviewed': False},
                    'crit:i18n-test-firm': {'text': 'Firm', 'reviewed': False},
                }
            }
        )
    )
    try:
        load_ontology(db, directory, cleanup=False)
        item = item_service.get_item(db, 'item:i18n-test', 'en')
        assert item.name == 'test' and item.criteria[0].text == 'Firm'
        assert item_service.get_item(db, 'item:i18n-test', 'ja').name == '시험'
        assert (
            db.execute(
                "select kind from entity_labels where entity_id='item:i18n-test' and lang='en'"
            ).fetchone()[0]
            == 'translated'
        )
        assert load_ontology(db, directory, cleanup=False)['skipped'] == 2
    finally:
        db.execute("delete from entities where id in ('item:i18n-test','crit:i18n-test-firm')")


def test_account_language(db):  # noqa: F811
    user = {'id': '00000000-0000-0000-0000-000000000045'}
    db.execute(
        "insert into users(id,login_id,password_hash,role,status) values(%s,'i18n_test','unused','customer','approved')",
        (user['id'],),
    )
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[current_user] = lambda: user
    try:
        with TestClient(app) as client:
            headers = {'X-Requested-With': 'market-on'}
            assert client.patch('/auth/me', json={'lang': 'ja'}, headers=headers).status_code == 200
            assert (
                db.execute('select lang from users where id=%s', (user['id'],)).fetchone()[0]
                == 'ja'
            )
            assert client.patch('/auth/me', json={'lang': 'fr'}, headers=headers).status_code == 422
    finally:
        app.dependency_overrides.pop(get_db)
        app.dependency_overrides.pop(current_user)
        db.execute('delete from users where id=%s', (user['id'],))
