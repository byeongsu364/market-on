"""Destructive integration setup is restricted to the explicitly named test database."""

import os
import shutil
from pathlib import Path
from urllib.parse import urlparse

import psycopg
import pytest

from app.core.config import settings
from app.db.pool import close_pool, connection
from app.db.repositories import knowledge_repo as repo
from app.knowledge.ingest import upsert_document
from app.knowledge.ontology import normalize
from app.knowledge.retriever import search
from app.llm.fake import FakeProvider

pytestmark = pytest.mark.skipif(
    not os.getenv('TEST_DATABASE_URL'), reason='TEST_DATABASE_URL is not set'
)


@pytest.fixture(scope='module')
def db():
    url = os.environ['TEST_DATABASE_URL']
    if urlparse(url).path != '/marketon_test':
        pytest.fail('스키마 초기화는 marketon_test에서만 허용합니다.')
    # 격리 실행 환경에서 Unix 소켓이 차단되면 30초 풀 재시도를 반복하지 않아요.
    try:
        with psycopg.connect(url, connect_timeout=1):
            pass
    except psycopg.OperationalError as exc:
        if 'Operation not permitted' in str(exc):
            pytest.skip('marketon_test DB 소켓 접근 차단: Operation not permitted')
        raise
    pytest.importorskip('yaml', reason='PyYAML installation required')
    from scripts.migrate import migrate

    old = settings.DATABASE_URL
    close_pool()
    settings.DATABASE_URL = url
    try:
        with connection() as conn:
            conn.execute('drop schema public cascade')
            conn.execute('create schema public')
        close_pool()
        migrate()
        close_pool()  # register newly created vector type
        with connection() as conn:
            yield conn
    finally:
        close_pool()
        settings.DATABASE_URL = old


def test_load_replace_search_cache_and_prune(db, tmp_path):
    from app.knowledge.embedder import embed_pending
    from scripts.load_all import load_all
    from scripts.load_documents import load_documents, read_document

    source = Path(__file__).resolve().parents[2] / 'data'
    shutil.copytree(source, tmp_path / 'data')
    data = tmp_path / 'data'
    fake = FakeProvider()
    first = load_all(db, data_dir=data, embedder=fake)
    # 식품안전나라 레시피(scripts.import_recipes 생성)는 받은 만큼 늘어나서 따로 셈
    recipes = len(list((data / 'rag_docs' / 'recipes').glob('foodsafety-*.md')))
    # 16 sources + 54 explicit(예시 품종 10 포함)/24 generated entities + 25 documents + 레시피
    assert first['added'] == 416 + recipes * 2  # 047: 26출처 + 292명시 + 40확인 + 58문서
    ids = db.execute('select id from chunks order by id').fetchall()
    second = load_all(db, data_dir=data, embedder=fake)
    assert second['added'] == second['changed'] == second['deleted'] == 0
    assert db.execute('select id from chunks order by id').fetchall() == ids
    # fake 임베딩은 의미 순위가 없어서 1순위 대신 포함 여부만 확인
    results = search(db, fake, '파 고르는 법', intent='select', k=10)
    assert '대파 고를 때 확인할 점' in {r.document_title for r in results}
    assert results[0].doc_type == 'criterion'
    assert (
        search(db, fake, '파 고르는 법', doc_types=['storage'], lang='ko')[0].doc_type == 'storage'
    )
    assert search(db, fake, '파 고르는 법', min_similarity=1.1) == []
    path = data / 'rag_docs/green_onion/criterion.md'
    doc = read_document(path, data / 'rag_docs')
    old = repo.find_document(db, doc.doc_key)[0]
    old_chunks = [r[0] for r in db.execute('select id from chunks where document_id=%s', (old,))]
    db.execute(
        "insert into response_cache(cache_key,answer,model) values('item:green_onion:criterion:20261122:ko','{}','fake'),('item:apple:criterion:20261122:ko','{}','fake')"
    )
    path.write_text(path.read_text() + '\n변경된 내용입니다.\n')
    changed = load_all(db, data_dir=data, embedder=fake)
    assert changed['added'] == 0 and changed['changed'] == 2  # one document and its embedding
    assert not db.execute('select id from chunks where id=any(%s)', (old_chunks,)).fetchall()
    did = repo.find_document(db, doc.doc_key)[0]
    assert db.execute('select count(*) from chunks where document_id=%s', (did,)).fetchone()[0] == 1
    assert db.execute('select cache_key from response_cache').fetchall() == [
        ('item:apple:criterion:20261122:ko',)
    ]
    assert embed_pending(db, fake) == 0
    # Inline embedding and rollback on provider error are also shared by future API callers.
    doc.doc_key = 'merchant_tip:11111111-1111-1111-1111-111111111111'
    doc.body += ' 새로운 노하우'
    tip = upsert_document(db, doc, embedder=fake)
    assert db.execute(
        'select embedding is not null from chunks where document_id=%s', (tip.document_id,)
    ).fetchone()[0]

    class Broken:
        def embed(self, *args, **kwargs):
            raise RuntimeError('offline failure')

    doc.body += ' 실패'
    with pytest.raises(RuntimeError):
        upsert_document(db, doc, embedder=Broken())
    assert repo.find_document(db, doc.doc_key)[0] == tip.document_id
    path.unlink()
    assert load_documents(db, data / 'rag_docs', prune=True)['deleted'] == 1
    assert repo.find_document(db, doc.doc_key) is not None


@pytest.mark.parametrize('text', [' GREEN\tOnion\n ', ' 대 파 ', 'SCALLION\r\n'])
def test_sql_normalization(db, text):
    value = db.execute(
        "select regexp_replace(lower(%s), '[[:space:]]+', '', 'g')", (text,)
    ).fetchone()[0]
    assert normalize(text) == value


def test_missing_relation_reports_line_and_rolls_back(db, tmp_path):
    from scripts.load_ontology import load_ontology

    path = tmp_path / 'broken.yaml'
    path.write_text(
        'entities:\n  - id: item:broken\n    type: item\n    name_ko: 오류\n    relations:\n      - {p: isA, o: cat:missing}\n'
    )
    with pytest.raises(ValueError, match=r'broken.yaml:6:.*cat:missing'):
        load_ontology(db, tmp_path)
    assert 'item:broken' not in repo.entity_ids(db)


def test_alignment(db, tmp_path):
    from datetime import date

    import yaml

    from app.knowledge.ontology import resolve_entities
    from app.schemas.knowledge import Document
    from scripts.load_all import load_all
    from scripts.load_ontology import load_ontology

    shutil.copytree(Path(__file__).resolve().parents[2] / 'data', tmp_path / 'data')
    data = tmp_path / 'data'
    fake = FakeProvider()
    load_all(db, data_dir=data, embedder=fake)
    assert resolve_entities(db, 'scallion') == ['item:green_onion']
    assert db.execute("select kind,lang from entity_labels where label='scallion'").fetchone() == (
        'vision',
        'en',
    )
    assert (
        db.execute(
            "select count(*) from entities where type='criterion' and source_id is not null"
        ).fetchone()[0]
        == 40  # 047 기존 24 + 원문 인용 16
    )
    assert (
        db.execute(
            "select count(*) from entity_relations where predicate='hasCriterion' and source_id is not null"
        ).fetchone()[0]
        == 40
    )
    assert db.execute("select props from entity_relations where predicate='soldBy'").fetchone()[
        0
    ] == {'factor_kg': 0.8, 'default': True}
    ids = db.execute('select id from entity_relations order by id').fetchall()
    counts = load_ontology(db, data / 'ontology')
    assert counts['added'] == counts['changed'] == counts['deleted'] == 0
    assert db.execute('select id from entity_relations order by id').fetchall() == ids
    path = data / 'ontology/items.yaml'
    value = yaml.safe_load(path.read_text())
    item = next(e for e in value['entities'] if e['id'] == 'item:green_onion')
    removed = item['criteria'].pop()
    path.write_text(yaml.safe_dump(value, allow_unicode=True))
    assert load_ontology(db, data / 'ontology')['deleted'] == 1
    assert f'crit:green_onion-{removed["key"]}' not in repo.entity_ids(db)
    assert load_ontology(db, data / 'ontology')['changed'] == 0
    doc = Document(
        doc_key='alignment-metadata',
        source_key='src:team-draft',
        doc_type='storage',
        lang='ko',
        title='발행일 검증',
        body='대파 보관 샘플',
        entities=['item:green_onion'],
        market_id='market:sample',
        published=date(2026, 11, 22),
    )
    db.execute("update sources set quote_only=true where source_key='src:team-draft'")
    upsert_document(db, doc, embedder=fake)
    results = search(db, fake, 'scallion', intent='store', k=100)
    assert results and all(r.doc_type == 'storage' for r in results)
    result = next(r for r in results if r.document_title == doc.title)
    assert result.quote_only  # 출처의 quote_only가 검색 결과에 실림
    assert result.market_id == doc.market_id and result.published == doc.published
    doc.published = date(2026, 11, 21)
    assert upsert_document(db, doc).status == 'changed'
    db.execute("update sources set quote_only=false where source_key='src:team-draft'")


@pytest.mark.parametrize('predicate', ['invalid', 'soldAt'])
def test_alignment_rejects_predicate(db, predicate):
    from psycopg.errors import CheckViolation

    with pytest.raises(CheckViolation), db.transaction():
        db.execute(
            "insert into entity_relations(subject_id,predicate,object_value) values('item:green_onion',%s,'{}')",
            (predicate,),
        )


def test_recipe_ontology_chunks_and_candidate_sql(db, tmp_path):
    """Exercise migration 0024 and recipe-scoped SQL with a local import fixture."""
    from pgvector import Vector

    from app.services import recipe_service
    from scripts import import_recipes as ir
    from scripts.load_all import load_all
    from scripts.load_documents import read_document

    data = Path(__file__).resolve().parents[2] / 'data'
    load_all(db, data_dir=data, embed=False)
    row = {
        'RCP_SEQ': '999999',
        'RCP_NM': '테스트 대파 요리',
        'RCP_PARTS_DTLS': '대파 1대, 양파 1/2개, 소금 약간',
        'RCP_PAT2': '국&찌개',
        'RCP_WAY2': '끓이기',
        'INFO_ENG': '100',
        'MANUAL01': '1. 테스트 원문 그대로.',
        'RCP_NA_TIP': '제외할 팁',
    }
    chosen = ir.select([row], ir.item_labels())
    ir.write_docs(chosen, tmp_path)
    ontology = tmp_path / 'ontology'
    ontology.mkdir()
    shutil.copy(data / 'ontology/items.yaml', ontology / 'items.yaml')
    ir.write_ontology(chosen, ontology / 'recipes.yaml')
    from scripts.load_ontology import load_ontology

    load_ontology(db, ontology, cleanup=False)
    doc = read_document(tmp_path / 'foodsafety-999999.md', tmp_path)
    doc.doc_key = 'recipes/foodsafety-999999.md'
    upsert_document(db, doc)
    values = db.execute(
        'select main_item_id,dish_type,season_months,weather_tags,quote_only from rag_chunk where document_id=(select id from documents where doc_key=%s)',
        (doc.doc_key,),
    ).fetchall()
    assert len(values) == 2
    assert all(v == ('item:green_onion', '국&찌개', [3], ['cold', 'snow'], True) for v in values)
    db.execute(
        'update chunks set embedding=%s where document_id=(select id from documents where doc_key=%s)',
        (Vector([1.0] * 1024), doc.doc_key),
    )
    fake = FakeProvider()
    cards = recipe_service.find_recipes(
        db, item_id='item:green_onion', month=3, q='요리', embedder=fake
    )
    assert cards[0]['recipe_id'] == 'recipe:foodsafety-999999'
    detail = recipe_service.get_recipe(db, 'recipe:foodsafety-999999')
    assert detail['steps'] == '1. 테스트 원문 그대로.' and '팁' not in str(detail)
    assert recipe_service.find_recipes(db, item_id='item:onion') == []
