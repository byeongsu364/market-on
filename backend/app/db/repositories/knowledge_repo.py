"""All knowledge SQL, including file-loader operations, lives here."""

from psycopg.types.json import Jsonb
from pgvector import Vector


def source_id(conn, key):
    row = conn.execute('select id from sources where source_key = %s', (key,)).fetchone()
    if row is None:
        raise ValueError(f'알 수 없는 출처: {key}')
    return row[0]


def upsert_source(conn, key, value):
    fields = ('title', 'publisher', 'url', 'license', 'kind', 'retrieved_at', 'quote_only')
    value = {'quote_only': False, **value}
    values = tuple(value.get(k) for k in fields)
    old = conn.execute(
        'select title,publisher,url,license,kind,retrieved_at,quote_only from sources where source_key=%s',
        (key,),
    ).fetchone()
    if old == values:
        return 'skipped'
    conn.execute(
        """insert into sources(source_key,title,publisher,url,license,kind,retrieved_at,quote_only)
        values (%s,%s,%s,%s,%s,%s,%s,%s) on conflict(source_key) do update set
        title=excluded.title,publisher=excluded.publisher,url=excluded.url,
        license=excluded.license,kind=excluded.kind,retrieved_at=excluded.retrieved_at,quote_only=excluded.quote_only""",
        (key, *values),
    )
    return 'changed' if old else 'added'


def entity_ids(conn):
    return {r[0] for r in conn.execute('select id from entities')}


def entity_names(conn, ids):
    rows = dict(
        conn.execute('select id,name_ko from entities where id=any(%s)', (list(ids),)).fetchall()
    )
    missing = set(ids) - rows.keys()
    if missing:
        raise ValueError(f'알 수 없는 엔터티: {sorted(missing)}')
    return [rows[e] for e in ids]


def upsert_entity(conn, entity, relations):
    eid = entity['id']
    values = (
        entity['type'],
        entity['name_ko'],
        entity.get('kamis'),
        entity.get('attrs', {}),
        source_id(conn, entity['source']) if entity.get('source') else None,
    )
    old = conn.execute(
        'select type,name_ko,kamis,attrs,source_id from entities where id=%s', (eid,)
    ).fetchone()
    labels = sorted(
        (label, lang, 'preferred' if i == 0 else 'synonym')
        for lang, names in entity.get('labels', {}).items()
        for i, label in enumerate(names)
    )
    vision = set(entity.get('vision', []))
    labels = [row for row in labels if not (row[1] == 'en' and row[0] in vision)]
    labels = sorted(labels + [(label, 'en', 'vision') for label in vision])
    old_labels = sorted(
        conn.execute(
            'select label,lang,kind from entity_labels where entity_id=%s', (eid,)
        ).fetchall()
    )
    old_relations = conn.execute(
        'select predicate,object_id,object_value,source_id,props from entity_relations where subject_id=%s order by id',
        (eid,),
    ).fetchall()
    if old == values and old_labels == labels and old_relations == relations:
        return 'skipped'
    conn.execute(
        """insert into entities(id,type,name_ko,kamis,attrs,source_id) values(%s,%s,%s,%s,%s,%s)
        on conflict(id) do update set type=excluded.type,name_ko=excluded.name_ko,
        kamis=excluded.kamis,attrs=excluded.attrs,source_id=excluded.source_id,updated_at=now()""",
        (
            eid,
            values[0],
            values[1],
            Jsonb(values[2]) if values[2] is not None else None,
            Jsonb(values[3]),
            values[4],
        ),
    )
    conn.execute('delete from entity_labels where entity_id=%s', (eid,))
    for label, lang, kind in labels:
        conn.execute(
            'insert into entity_labels(entity_id,label,lang,kind) values(%s,%s,%s,%s)',
            (eid, label, lang, kind),
        )
    # Relations are inserted after all entity nodes have been upserted.
    return 'changed' if old else 'added'


def replace_relations(conn, eid, relations):
    conn.execute('delete from entity_relations where subject_id=%s', (eid,))
    for p, o, v, source, props in relations:
        conn.execute(
            'insert into entity_relations(subject_id,predicate,object_id,object_value,source_id,props) values(%s,%s,%s,%s,%s,%s)',
            (
                eid,
                p,
                o,
                Jsonb(v) if v is not None else None,
                source,
                Jsonb(props) if props is not None else None,
            ),
        )


def label_dictionary(conn):
    return conn.execute(
        'select label_norm,entity_id,label from entity_labels order by length(label_norm) desc,entity_id,label'
    ).fetchall()


def find_document(conn, key):
    return conn.execute('select id,content_hash from documents where doc_key=%s', (key,)).fetchone()


def document_entities(conn, did):
    return {
        r[0]
        for r in conn.execute(
            'select distinct ce.entity_id from chunk_entities ce join chunks c on c.id=ce.chunk_id where c.document_id=%s',
            (did,),
        )
    }


def delete_document(conn, did):
    conn.execute('delete from documents where id=%s', (did,))


def insert_document(conn, doc, digest):
    return conn.execute(
        """insert into documents(doc_key,source_id,doc_type,lang,title,store_id,body,content_hash,market_id,published)
        values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id""",
        (
            doc.doc_key,
            source_id(conn, doc.source_key),
            doc.doc_type,
            doc.lang,
            doc.title,
            doc.store_id,
            doc.body,
            digest,
            doc.market_id,
            doc.published,
        ),
    ).fetchone()[0]


def insert_chunk(conn, did, doc, chunk, digest):
    cid = conn.execute(
        'insert into chunks(document_id,chunk_index,content,doc_type,lang,content_hash) values(%s,%s,%s,%s,%s,%s) returning id',
        (did, chunk.chunk_index, chunk.content, doc.doc_type, doc.lang, digest),
    ).fetchone()[0]
    for eid in sorted(chunk.entity_ids):
        conn.execute('insert into chunk_entities(chunk_id,entity_id) values(%s,%s)', (cid, eid))
    return cid


def pending_chunks(conn, batch):
    return conn.execute(
        'select id,content from chunks where embedding is null order by id limit %s for update',
        (batch,),
    ).fetchall()


def update_embeddings(conn, ids, vectors):
    if len(ids) != len(vectors):
        raise ValueError('임베딩 개수가 조각 개수와 다릅니다.')
    for cid, vector in zip(ids, vectors):
        conn.execute('update chunks set embedding=%s where id=%s', (Vector(vector), cid))


def match_chunks(conn, vector, entity_ids, doc_types, lang, k, minimum):
    return conn.execute(
        """select m.chunk_id,m.content,m.similarity,m.doc_type,m.document_title,m.store_id,m.source_title,m.source_url,m.license, s.quote_only, d.published, d.market_id
        from match_chunks(%s,%s,%s,%s,%s,%s) with ordinality as m
        join chunks c on c.id=m.chunk_id
        join documents d on d.id=c.document_id
        join sources s on s.id=d.source_id order by m.ordinality""",
        (Vector(vector), entity_ids, doc_types, lang, k, minimum),
    ).fetchall()


def invalidate_cache_for_entity(conn, eid):
    return conn.execute('select invalidate_cache_for_entity(%s)', (eid,)).fetchone()[0]


def prune_documents(conn, keys):
    rows = conn.execute(
        "select id from documents where doc_key not like 'merchant_tip:%%' and not (doc_key=any(%s))",
        (list(keys),),
    ).fetchall()
    for (did,) in rows:
        for eid in document_entities(conn, did):
            invalidate_cache_for_entity(conn, eid)
        delete_document(conn, did)
    return len(rows)


def lock_document(conn, key):
    conn.execute('select pg_advisory_xact_lock(hashtextextended(%s,0))', (key,))


def _prune_unreferenced(conn, table, key, candidates):
    """Inspect every inbound FK, including operational references, before deletion.

    Owned labels, outgoing edges and derived chunk tags cascade on deletion.
    Incoming ontology, document and operational references protect entities.
    Row locks also prevent new FK references racing the check and delete.
    """
    import sys
    from psycopg import sql

    deleted = 0
    fks = conn.execute(
        """select ns.nspname, cl.relname, a.attname
        from pg_constraint c
        join pg_class cl on cl.oid=c.conrelid
        join pg_namespace ns on ns.oid=cl.relnamespace
        join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
        where c.contype='f' and c.confrelid=%s::regclass""",
        (table,),
    ).fetchall()
    for candidate in sorted(candidates):
        row = conn.execute(
            sql.SQL('select id from {} where {}=%s for update').format(
                sql.Identifier(table), sql.Identifier(key)
            ),
            (candidate,),
        ).fetchone()
        if row is None:
            continue
        blockers = []
        for schema, child, column in fks:
            if table == 'entities' and (
                child in ('entity_labels', 'chunk_entities')
                or (child == 'entity_relations' and column == 'subject_id')
            ):
                continue
            if conn.execute(
                sql.SQL('select 1 from {}.{} where {}=%s limit 1').format(
                    sql.Identifier(schema), sql.Identifier(child), sql.Identifier(column)
                ),
                (row[0],),
            ).fetchone():
                blockers.append(f'{child}.{column}')
        if blockers:
            print(
                f'경고: {candidate} 삭제 건너뜀 — 참조 중: {", ".join(blockers)}', file=sys.stderr
            )
            continue
        if table == 'entities':
            conn.execute(
                """update documents set content_hash='retag:' || id::text
                where id in (select c.document_id from chunks c join chunk_entities ce
                on ce.chunk_id=c.id where ce.entity_id=%s)""",
                (candidate,),
            )
            invalidate_cache_for_entity(conn, candidate)
        conn.execute(sql.SQL('delete from {} where id=%s').format(sql.Identifier(table)), (row[0],))
        deleted += 1
    return deleted


def prune_entities(conn, ids):
    candidates = entity_ids(conn) - set(ids)
    return _prune_unreferenced(conn, 'entities', 'id', candidates)


def prune_sources(conn, keys):
    candidates = {r[0] for r in conn.execute('select source_key from sources')} - set(keys)
    return _prune_unreferenced(conn, 'sources', 'source_key', candidates)


def prune_generated_criteria(conn, ids):
    candidates = {
        r[0]
        for r in conn.execute(
            """select id from entities
        where type='criterion' and attrs @> '{"generated_criterion": true}'::jsonb
        and not (id=any(%s))""",
            (ids,),
        )
    }
    return _prune_unreferenced(conn, 'entities', 'id', candidates)
