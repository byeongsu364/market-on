"""Integration checklist against the explicitly isolated test database."""

import json
import os
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from pgvector import Vector

from app.db.repositories import ontology_repo
from app.deps import get_db
from app.knowledge.ingest import upsert_document
from app.knowledge.intents import DOC_TYPE_TO_INTENT
from app.knowledge.retriever import search
from app.llm.fake import FakeProvider
from app.main import app
from app.schemas.knowledge import Document
from tests.test_ingest_db import db  # noqa: F401 -- guarded marketon_test migration fixture

pytestmark = pytest.mark.skipif(not os.getenv('TEST_DATABASE_URL'), reason='test DB required')


@pytest.fixture
def graph_db(db):  # noqa: F811 -- imported pytest fixture
    # Roll back each fixture so tests can run independently in the shared migrated schema.
    class Rollback(Exception):
        pass

    try:
        with db.transaction():
            db.execute(
                "insert into sources(source_key,title,kind) values('src:graph','그래프','team_written')"
            )
            sid = db.execute("select id from sources where source_key='src:graph'").fetchone()[0]
            for kind in (
                'item',
                'variety',
                'criterion',
                'unit',
                'category',
                'season',
                'region',
                'store_category',
            ):
                db.execute(
                    'insert into entities(id,type,name_ko,source_id) values(%s,%s,%s,%s)',
                    (f'{kind}:graph', kind, '후지' if kind == 'variety' else kind, sid),
                )
            db.execute(
                "insert into entity_labels(entity_id,label,lang) values('variety:graph','후지','ko')"
            )
            for pred, obj in [
                ('hasGrade', 'variety:graph'),
                ('hasCriterion', 'criterion:graph'),
                ('isA', 'category:graph'),
                ('soldBy', 'unit:graph'),
            ]:
                db.execute(
                    "insert into entity_relations(subject_id,predicate,object_id,source_id) values('item:graph',%s,%s,%s)",
                    (pred, obj, sid),
                )
            db.execute(
                "insert into entity_relations(subject_id,predicate,object_value,source_id) values('item:graph','harvestPeriod','{}',%s)",
                (sid,),
            )
            db.execute(
                "insert into markets(id,name_ko,source) values('market:graph','시장','manual')"
            )
            db.execute(
                "insert into zones(id,market_id,name_ko) values('zone:graph','market:graph','구역')"
            )
            db.execute(
                "insert into stores(id,market_id,zone_id,name_ko,source) values('store:graph','market:graph','zone:graph','상점','manual'),('store:outside','market:graph',null,'상점2','manual')"
            )
            db.execute("insert into store_items values('store:graph','item:graph','manual')")
            db.execute(
                "insert into closing_sales(store_id,item_id,sale_price,starts_at,ends_at) values('store:graph','item:graph',1000,date_trunc('day',now()),date_trunc('day',now())+interval '1 hour')"
            )
            db.execute(
                "insert into price_observations(exmn_ymd,se_cd,item_cd,vrty_cd,grd_cd,item_nm,vrty_nm,grd_nm,sgg_nm,mrkt_cd,mrkt_nm,market_type,price,item_id,variety_id,source) values(current_date,'01','1','1','1','사과','후지','상품','서울','1','시장','traditional',1000,'item:graph','variety:graph','aT')"
            )
            db.execute(
                "insert into price_reports(market_id,store_id,item_id,price,method,device_hash) values('market:graph','store:graph','item:graph',1000,'manual','PRIVATE_DEVICE'),('market:graph',null,'item:graph',1200,'manual','PRIVATE_DEVICE')"
            )
            db.execute(
                "insert into users(id,login_id,password_hash,role,status,store_id) values('00000000-0000-0000-0000-000000000042','graphuser','unused','merchant','approved','store:graph')"
            )
            db.execute(
                "insert into store_price_confirmations(store_id,item_id,unit_id,price,confirmed_by) values('store:graph','item:graph','unit:graph',1000,'00000000-0000-0000-0000-000000000042')"
            )
            db.execute(
                "insert into market_demand values('market:graph',current_date,'PRIVATE_DEVICE','request'),('market:graph',current_date,'OTHER_DEVICE','nearby')"
            )
            yield db
            raise Rollback
    except Rollback:
        pass


def document(**kwargs):
    return Document(
        **(
            {
                'doc_key': 'graph.md',
                'source_key': 'src:graph',
                'doc_type': 'storage',
                'lang': 'ko',
                'title': '보관',
                'body': '후지 0℃ 90~95% 한두 달',
                'entities': ['item:graph'],
            }
            | kwargs
        )
    )


def test_views_types_counts_provenance_and_privacy(graph_db):
    conn = graph_db
    upsert_document(conn, document())
    assert (
        conn.execute(
            "select count(*) from pg_class where relname in ('onto_node','onto_edge','rag_chunk') and relkind='v'"
        ).fetchone()[0]
        == 3
    )
    columns = [
        r[0]
        for r in conn.execute(
            "select column_name from information_schema.columns where table_schema='public' and table_name='rag_chunk' order by ordinal_position"
        )
    ]
    assert columns == [
        'chunk_id',
        'document_id',
        'item_ids',
        'node_type',
        'intent',
        'variety_id',
        'numbers',
        'review_status',
        'source_key',
        'license',
        'quote_only',
        'chunk_hash',
        'lang',
        # 039 레시피 청크 메타데이터
        'main_item_id',
        'dish_type',
        'cook_method',
        'season_months',
        'weather_tags',
    ]
    types = {r[0] for r in conn.execute('select distinct type from onto_node')}
    assert {
        'item',
        'variety',
        'criterion',
        'unit',
        'category',
        'season',
        'region',
        'store_category',
        'source',
        'document',
        'market',
        'zone',
        'store',
        'sale',
        'price',
        'report',
        'market_request',
    } <= types
    expected = sum(
        conn.execute(f'select count(*) from {table}').fetchone()[0]
        for table in (
            'entities',
            'sources',
            'documents',
            'markets',
            'zones',
            'stores',
            'closing_sales',
            'price_observations',
            'price_reports',
        )
    )
    expected += conn.execute(
        "select count(distinct market_id) from market_demand where kind='request'"
    ).fetchone()[0]
    assert conn.execute('select count(*) from onto_node').fetchone()[0] == expected
    predicates = {r[0] for r in conn.execute('select distinct pred from onto_edge')}
    assert {
        'hasGrade',
        'hasCriterion',
        'isA',
        'soldBy',
        'sells',
        'contains',
        'posts',
        'about',
        'hasPrice',
        'reportedAt',
        'confirmedBy',
        'requests',
        'supportedBy',
        'describes',
    } <= predicates
    for table, marker in [
        ('entities', "not (props ? 'relation_id') and subj not like 'doc:%'"),
        ('entity_relations', "props ? 'relation_id'"),
        ('documents', "subj like 'doc:%'"),
    ]:
        expected = conn.execute(
            f'select count(*) from {table} where source_id is not null'
        ).fetchone()[0]
        assert (
            conn.execute(
                f"select count(*) from onto_edge where pred='supportedBy' and {marker}"
            ).fetchone()[0]
            == expected
        )
    for view in ('onto_node', 'onto_edge'):
        payload = json.dumps(conn.execute(f'select * from {view}').fetchall(), default=str)
        assert 'device_hash' not in payload and 'PRIVATE_DEVICE' not in payload
        assert '00000000-0000-0000-0000-000000000042' not in payload
    assert conn.execute("select obj from onto_edge where pred='confirmedBy'").fetchone() == (
        'merchant',
    )
    assert conn.execute(
        "select props->>'request_count' from onto_node where type='market_request'"
    ).fetchone() == ('1',)
    # Projections reflect updates immediately; nothing was copied.
    conn.execute("update price_reports set price=2345 where item_id='item:graph'")
    assert all(
        r[0] == 2345
        for r in conn.execute("select (props->>'price')::int from onto_node where type='report'")
    )


def test_chunk_metadata_and_intent_mapping(graph_db):
    conn = graph_db
    for kind in [*DOC_TYPE_TO_INTENT, 'season']:
        upsert_document(
            conn, document(doc_key=f'{kind}.md', doc_type=kind, review_status='reviewed')
        )
    for kind, intent, review, variety, numbers in conn.execute(
        'select node_type,intent,review_status,variety_id,numbers from rag_chunk'
    ):
        assert intent == DOC_TYPE_TO_INTENT.get(kind)
        assert review == 'reviewed' and variety == 'variety:graph'
        assert numbers == ['0℃', '90~95%', '한두 달']
    doc = document(varieties=['variety:graph'], body='품종 이름 없는 문서')
    result = upsert_document(conn, doc)
    assert conn.execute(
        'select variety_id from chunks where document_id=%s', (result.document_id,)
    ).fetchone() == ('variety:graph',)
    assert upsert_document(conn, replace(doc, review_status='rejected')).status == 'changed'
    with pytest.raises(ValueError):
        upsert_document(conn, replace(doc, review_status='invalid'))
    with pytest.raises(ValueError):
        upsert_document(conn, replace(doc, varieties=['unit:graph']))


def test_retrieval_rejected_and_variety_priority(graph_db):
    conn = graph_db
    fake = FakeProvider()
    upsert_document(conn, document(doc_key='generic.md', body='일반 보관'), embedder=fake)
    upsert_document(conn, document(doc_key='variety.md', body='후지 보관'), embedder=fake)
    upsert_document(conn, document(doc_key='rejected.md', review_status='rejected'), embedder=fake)
    results = search(conn, fake, '후지 보관', entity_ids=['item:graph'], k=1)
    assert len(results) == 1 and '후지 보관' in results[0].content
    results = search(conn, fake, '후지 보관', k=10)
    assert len(results) == 2 and '후지 보관' in results[0].content
    assert (
        conn.execute(
            'select count(*) from match_chunks(%s,null,null,null,100,0)',
            (Vector(fake.embed(['보관'], task='query')[0]),),
        ).fetchone()[0]
        == 2
    )


def test_ambiguous_variety(graph_db):
    conn = graph_db
    conn.execute("insert into entities(id,type,name_ko) values('variety:other','variety','홍로')")
    conn.execute(
        "insert into entity_labels(entity_id,label,lang) values('variety:other','홍로','ko')"
    )
    conn.execute(
        "insert into entity_relations(subject_id,predicate,object_id) values('item:graph','hasGrade','variety:other')"
    )
    result = upsert_document(conn, document(body='후지와 홍로'))
    assert conn.execute(
        'select variety_id from chunks where document_id=%s', (result.document_id,)
    ).fetchone() == (None,)


def test_graph_recent_depth_and_privacy(graph_db):
    conn = graph_db
    conn.execute(
        "insert into price_reports(market_id,item_id,price,method,device_hash,reported_at) values('market:graph','item:graph',2000,'manual','OLD_PRIVATE',now()-interval '8 days')"
    )
    old_id = conn.execute(
        "select 'report:'||id from price_reports where device_hash='OLD_PRIVATE'"
    ).fetchone()[0]
    app.dependency_overrides[get_db] = lambda: conn
    try:
        with TestClient(app) as client:
            one = client.get('/ontology/items/item:graph/graph').json()
            two = client.get('/ontology/items/item:graph/graph?depth=2').json()
    finally:
        app.dependency_overrides.clear()
    assert 'market:graph' not in {n['id'] for n in one['nodes']}
    assert 'market:graph' in {n['id'] for n in two['nodes']}
    assert old_id not in {n['id'] for n in two['nodes']}
    payload = json.dumps(two, default=str)
    assert 'device_hash' not in payload and 'PRIVATE' not in payload
    assert '00000000-0000-0000-0000-000000000042' not in payload
    assert any(e['pred'] == 'confirmedBy' and e['obj'] == 'merchant' for e in two['edges'])
    conn.execute(
        "insert into stores(id,market_id,name_ko,source) select 'store:bulk-'||i,'market:graph','상점','manual' from generate_series(1,250) i"
    )
    conn.execute(
        "insert into store_items select 'store:bulk-'||i,'item:graph','manual' from generate_series(1,250) i"
    )
    capped = ontology_repo.graph(conn, 'item:graph', 2)
    assert len(capped['nodes']) <= 200 and len(capped['edges']) <= 200
