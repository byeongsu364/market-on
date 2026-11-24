"""Operational constraints and repositories, only on the guarded test database."""

from datetime import date, datetime, timezone, timedelta
import pytest
from psycopg import Rollback
from psycopg.errors import CheckViolation, ForeignKeyViolation
from tests.test_ingest_db import db, pytestmark
from app.db.repositories import price_repo, store_repo, sale_repo, media_repo, knowledge_repo


@pytest.fixture
def operational(db):
    with db.transaction():
        db.execute(
            "insert into entities(id,type,name_ko) values ('item:op-test','item','검증 품목')"
        )
        store_repo.upsert_market(db, id='market:op-test', name_ko='검증 시장', source='manual')
        store_repo.upsert_zone(
            db, id='zone:op-test', market_id='market:op-test', name_ko='검증 구역'
        )
        store_repo.upsert_store(
            db,
            id='store:op-test',
            market_id='market:op-test',
            zone_id='zone:op-test',
            name_ko='검증 점포',
            source='manual',
            hours={'mon': '09-18'},
        )
        yield db
        raise Rollback()


def observation(**changes):
    return (
        dict(
            source='at_period_retail',
            exmn_ymd=date(2026, 11, 20),
            se_cd='01',
            ctgry_cd='200',
            item_cd='245',
            vrty_cd='00',
            grd_cd='04',
            mrkt_cd='0110212',
            mrkt_nm='경동',
            sgg_nm='서울',
            item_nm='대파',
            vrty_nm='대파',
            grd_nm='상품',
            market_type='traditional',
            unit='kg',
            unit_sz='1',
            price=3000,
            item_id='item:op-test',
        )
        | changes
    )


def test_observations(operational):
    conn = operational
    assert price_repo.upsert_observations(conn, [observation()]) == (1, 0)
    assert price_repo.upsert_observations(conn, [observation(price=3100)]) == (0, 1)
    assert price_repo.latest_exmn_date(conn, 'item:op-test', on_date=date(2026, 11, 22)) == date(
        2026, 11, 20
    )
    assert price_repo.latest_exmn_date(conn, 'item:op-test', on_date=date(2026, 11, 19)) is None
    for change in ({'market_type': 'invalid'}, {'price': 0}, {'se_cd': '03'}):
        with pytest.raises(CheckViolation), conn.transaction():
            price_repo.upsert_observations(conn, [observation(**change)])


def test_stores_picks_reports_media(operational):
    conn = operational
    store_repo.set_store_items(conn, 'store:op-test', ['item:op-test'], 'merchant')
    assert store_repo.stores_selling(conn, 'market:op-test', 'item:op-test')[0]['hours'] == {
        'mon': '09-18'
    }
    assert store_repo.get_market(conn, 'market:op-test')['name_ko'] == '검증 시장'
    assert len(store_repo.list_zones(conn, 'market:op-test')) == 1
    with pytest.raises(ForeignKeyViolation), conn.transaction():
        conn.execute("delete from entities where id='item:op-test'")
    now = conn.execute('select now()').fetchone()[0]
    end = conn.execute(
        "select ((now() at time zone 'Asia/Seoul')::date+1)::timestamp at time zone 'Asia/Seoul'"
    ).fetchone()[0]
    pick = sale_repo.create(
        conn,
        'store:op-test',
        dict(item_id='item:op-test', sale_price=2000, starts_at=now, ends_at=end),
    )['id']
    assert sale_repo.active(conn, now, 'market:op-test')[0]['id'] == pick
    assert not sale_repo.active(conn, now + timedelta(days=2), 'market:op-test')
    media = media_repo.insert_media(
        conn, kind='photo', path='test/photo.jpg', mime='image/jpeg', bytes=10
    )
    assert media_repo.get_media(conn, media)['path'] == 'test/photo.jpg'
    report = price_repo.insert_report(
        conn,
        market_id='market:op-test',
        store_id='store:op-test',
        item_id='item:op-test',
        price=3000,
        method='manual',
        media_id=media,
    )
    assert price_repo.list_reports(conn, 'market:op-test', 'item:op-test', now)[0]['id'] == report
    conn.execute("delete from stores where id='store:op-test'")
    assert not conn.execute("select 1 from store_items where store_id='store:op-test'").fetchone()
    assert not conn.execute('select 1 from closing_sales where id=%s', (pick,)).fetchone()
    assert price_repo.list_reports(conn, 'market:op-test')[0]['store_id'] is None


def test_prune_files_and_references(operational, tmp_path, capsys):
    import yaml
    from scripts.load_ontology import load_ontology
    from scripts.load_sources import load_sources

    conn = operational
    directory = tmp_path / 'ontology'
    directory.mkdir()
    path = directory / 'items.yaml'
    store_repo.set_store_items(conn, 'store:op-test', ['item:op-test'], 'manual')
    path.write_text(
        yaml.safe_dump(
            {'entities': [{'id': 'item:prune-test', 'type': 'item', 'name_ko': '삭제 검증'}]}
        )
    )
    load_ontology(conn, directory)
    path.write_text('entities: []\n')
    # Repository pruning is also exercised by the CLI loader below.
    assert load_ontology(conn, directory, prune=True)['deleted'] >= 1
    assert 'item:prune-test' not in knowledge_repo.entity_ids(conn)
    store_repo.set_store_items(conn, 'store:op-test', ['item:op-test'], 'manual')
    load_ontology(conn, directory, prune=True)
    assert 'item:op-test' in knowledge_repo.entity_ids(conn)
    assert 'store_items.item_id' in capsys.readouterr().err
    sources = tmp_path / 'sources.yaml'
    sources.write_text('src:prune-test:\n  title: 검증\n  kind: team_written\n')
    load_sources(conn, sources)
    conn.execute(
        "insert into sources(source_key,title,kind) values('src:protected','보호','team_written')"
    )
    conn.execute(
        "insert into documents(source_id,doc_key,doc_type,title,lang,body,content_hash) values(%s,'prune-doc','guide','보호','ko','보호','prune-hash')",
        (knowledge_repo.source_id(conn, 'src:protected'),),
    )
    sources.write_text('{}\n')
    load_sources(conn, sources, prune=True)
    assert not conn.execute("select 1 from sources where source_key='src:prune-test'").fetchone()
    assert 'documents.source_id' in capsys.readouterr().err


@pytest.mark.parametrize(
    'operation',
    [
        lambda conn: store_repo.upsert_market(
            conn, id='market:bad', name_ko='오류', source='invalid'
        ),
        lambda conn: store_repo.upsert_store(
            conn, id='store:bad', market_id='market:op-test', name_ko='오류', source='invalid'
        ),
        lambda conn: store_repo.set_store_items(conn, 'store:op-test', ['item:op-test'], 'invalid'),
        lambda conn: media_repo.insert_media(conn, kind='video', path='bad'),
        lambda conn: price_repo.insert_report(
            conn, market_id='market:op-test', item_id='item:op-test', price=100, method='invalid'
        ),
        lambda conn: price_repo.insert_report(
            conn, market_id='market:op-test', item_id='item:op-test', price=0, method='manual'
        ),
        lambda conn: sale_repo.create(
            conn,
            'store:op-test',
            dict(
                item_id='item:op-test',
                sale_price=0,
                starts_at=datetime.now(timezone.utc),
                ends_at=datetime.now(timezone.utc) + timedelta(seconds=1),
            ),
        ),
    ],
)
def test_operational_checks(operational, operation):
    with pytest.raises(CheckViolation), operational.transaction():
        operation(operational)
