"""Cache cleanup against the guarded marketon_test fixture."""

import os

import pytest

from app.knowledge.answer_cache import cache_key
from scripts.pipeline import stale_cache_rows
from tests.test_ingest_db import db  # noqa: F401 -- guarded test database fixture

pytestmark = pytest.mark.skipif(not os.getenv('TEST_DATABASE_URL'), reason='test DB required')


def test_cleanup_only_stale_versions(db):  # noqa: F811 -- imported fixture
    current = cache_key(db, 'item:apple', 'store', 'ko', '보관')
    other = cache_key(db, 'item:pear', 'store', 'ko', '보관')
    parts = current.split(':')
    parts[6] = 'old-version'
    stale = ':'.join(parts)
    keys = [current, other, stale, 'ask-rate:pipeline-test:quota']
    with db.transaction():
        for key in keys:
            db.execute(
                "insert into response_cache(cache_key,answer,model) values(%s,'{}','test') on conflict do nothing",
                (key,),
            )
        stale_cache_rows(db)
        remaining = {
            r[0]
            for r in db.execute(
                'select cache_key from response_cache where cache_key=any(%s)', (keys,)
            ).fetchall()
        }
        assert stale not in remaining
        assert {current, other, keys[3]} <= remaining
        db.execute('delete from response_cache where cache_key=any(%s)', (keys,))
