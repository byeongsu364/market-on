"""Recognition SQL and actual media rows, restricted to marketon_test."""

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from psycopg import Rollback

from app.core.config import settings
from app.db.repositories import knowledge_repo, media_repo
from app.deps import get_db
from app.knowledge.ontology import match_vision_labels
from app.llm import json_output
from app.main import app
from scripts.load_ontology import load_ontology
from scripts.load_sources import load_sources
from tests.test_ingest_db import db as database_fixture
from tests.test_ingest_db import pytestmark as database_marks
from tests.test_recognize import JPEG

db = database_fixture
pytestmark = database_marks


def test_recognition_sql_and_media(db, monkeypatch, tmp_path):
    data = Path(__file__).resolve().parents[2] / 'data'
    with db.transaction():
        load_sources(db, data / 'sources.yaml')
        load_ontology(db, data / 'ontology')
        db.execute("""insert into entities(id,type,name_ko,kamis) values
            ('item:test-similar','item','쪽파',
             (select kamis from entities where id='item:green_onion')),
            ('item:test-substitute','item','대체품',null),
            ('cat:test-vision','category','분류',null)""")
        db.execute("""insert into entity_relations(subject_id,predicate,object_id)
            values('item:test-substitute','substituteFor','item:green_onion')""")
        db.execute("""insert into entity_labels(entity_id,label,lang,kind) values
            ('cat:test-vision','scallion','en','vision'),
            ('item:apple','scallion','ko','synonym')""")
        result = match_vision_labels(db, ['scallion'])
        assert result[0] == {'item_id': 'item:green_onion', 'name': '대파', 'confidence': 1.0}
        assert {r['item_id'] for r in result[1:]} == {'item:test-similar', 'item:test-substitute'}
        assert all(r['confidence'] == 0.6 for r in result[1:])
        monkeypatch.setattr(settings, 'MEDIA_DIR', tmp_path)
        provider = type('Provider', (), {'generate': lambda *a, **k: '{"labels": ["scallion"]}'})()
        monkeypatch.setattr(json_output, 'get_llm', lambda: provider)
        app.dependency_overrides[get_db] = lambda: db
        try:
            with TestClient(app) as client:
                assert (
                    client.post('/recognize', files={'photo': ('a.jpg', JPEG)}).status_code == 200
                )
            path = next(tmp_path.glob('photos/*/*.jpg'))
            row = db.execute('select id from media where path=%s', (str(path),)).fetchone()
            assert row is not None
            assert media_repo.get_media(db, row[0])['kind'] == 'photo'
            assert path.read_bytes() == JPEG
        finally:
            app.dependency_overrides.pop(get_db, None)
        # A failed media insert must leave the outer transaction usable.
        monkeypatch.setattr(
            media_repo, 'insert_media', lambda conn, **k: conn.execute('select 1/0')
        )
        from app.services.scan_service import save_photo

        save_photo(db, JPEG, 'jpg', 'image/jpeg')
        assert knowledge_repo.vision_item_labels(db)
        raise Rollback()


@pytest.mark.skipif(os.getenv('RUN_OLLAMA_TESTS') != '1', reason='RUN_OLLAMA_TESTS=1 required')
def test_real_ollama_photos(db, monkeypatch, tmp_path):
    sample_dir = os.getenv('RECOGNIZE_SAMPLE_DIR')
    assert sample_dir, 'RECOGNIZE_SAMPLE_DIR is required'
    samples = [
        p
        for p in Path(sample_dir).iterdir()
        if p.suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp')
    ]
    assert samples, 'No sample photos found'
    data = Path(__file__).resolve().parents[2] / 'data'
    with db.transaction():
        load_sources(db, data / 'sources.yaml')
        load_ontology(db, data / 'ontology')
        monkeypatch.setattr(settings, 'LLM_PROVIDER', 'gemma')
        monkeypatch.setattr(settings, 'MEDIA_DIR', tmp_path)
        app.dependency_overrides[get_db] = lambda: db
        try:
            with TestClient(app) as client:
                for path in samples:
                    response = client.post(
                        '/recognize', files={'photo': (path.name, path.read_bytes())}
                    )
                    assert response.status_code == 200, response.text
                    assert response.json()['candidates'], path.name
        finally:
            app.dependency_overrides.pop(get_db, None)
        raise Rollback()


def test_item_vocabulary_sql(db):
    with db.transaction():
        db.execute("""insert into entities(id,type,name_ko) values
            ('item:test-vocab-preferred','item','대표'),
            ('item:test-vocab-fallback','item','대체'),
            ('item:test-vocab-missing','item','없음'),
            ('cat:test-vocab','category','분류')""")
        db.execute("""insert into entity_labels(entity_id,label,lang,kind) values
            ('item:test-vocab-preferred','z preferred','en','preferred'),
            ('item:test-vocab-preferred','a vision','en','vision'),
            ('item:test-vocab-fallback','b vision','en','vision'),
            ('item:test-vocab-fallback','a vision','en','vision'),
            ('item:test-vocab-missing','synonym only','en','synonym'),
            ('cat:test-vocab','category','en','preferred')""")
        vocabulary = knowledge_repo.item_vocabulary(db)
        names = {row['item_id']: row['name_en'] for row in vocabulary}
        assert names['item:test-vocab-preferred'] == 'z preferred'
        assert names['item:test-vocab-fallback'] == 'a vision'
        assert 'item:test-vocab-missing' not in names
        assert 'cat:test-vocab' not in names
        assert [row['name_en'] for row in vocabulary] == sorted(
            row['name_en'] for row in vocabulary
        )
        raise Rollback()
