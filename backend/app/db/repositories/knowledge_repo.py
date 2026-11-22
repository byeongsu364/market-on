"""All knowledge SQL, including file-loader operations, lives here."""
from psycopg.types.json import Jsonb
from pgvector import Vector

def source_id(conn, key):
    row = conn.execute('select id from sources where source_key = %s', (key,)).fetchone()
    if row is None:
        raise ValueError(f'알 수 없는 출처: {key}')
    return row[0]

def upsert_source(conn, key, value):
    fields = ('title', 'publisher', 'url', 'license', 'kind', 'retrieved_at')
    values = tuple(value.get(k) for k in fields)
    old = conn.execute('select title,publisher,url,license,kind,retrieved_at from sources where source_key=%s', (key,)).fetchone()
    if old == values:
        return 'skipped'
    conn.execute("""insert into sources(source_key,title,publisher,url,license,kind,retrieved_at)
        values (%s,%s,%s,%s,%s,%s,%s) on conflict(source_key) do update set
        title=excluded.title,publisher=excluded.publisher,url=excluded.url,
        license=excluded.license,kind=excluded.kind,retrieved_at=excluded.retrieved_at""", (key, *values))
    return 'changed' if old else 'added'

def entity_ids(conn):
    return {r[0] for r in conn.execute('select id from entities')}

def entity_names(conn, ids):
    rows = dict(conn.execute('select id,name_ko from entities where id=any(%s)', (list(ids),)).fetchall())
    missing = set(ids) - rows.keys()
    if missing:
        raise ValueError(f'알 수 없는 엔터티: {sorted(missing)}')
    return [rows[e] for e in ids]

def upsert_entity(conn, entity, relations):
    eid = entity['id']
    values = (entity['type'], entity['name_ko'], entity.get('kamis'), entity.get('attrs', {}))
    old = conn.execute('select type,name_ko,kamis,attrs from entities where id=%s', (eid,)).fetchone()
    labels = sorted((label, lang, 'preferred' if i == 0 else 'synonym')
                    for lang, names in entity.get('labels', {}).items() for i, label in enumerate(names))
    old_labels = sorted(conn.execute('select label,lang,kind from entity_labels where entity_id=%s', (eid,)).fetchall())
    old_relations = conn.execute('select predicate,object_id,object_value,source_id from entity_relations where subject_id=%s order by id', (eid,)).fetchall()
    if old == values and old_labels == labels and old_relations == relations:
        return 'skipped'
    conn.execute("""insert into entities(id,type,name_ko,kamis,attrs) values(%s,%s,%s,%s,%s)
        on conflict(id) do update set type=excluded.type,name_ko=excluded.name_ko,
        kamis=excluded.kamis,attrs=excluded.attrs,updated_at=now()""",
        (eid, values[0], values[1], Jsonb(values[2]) if values[2] is not None else None, Jsonb(values[3])))
    conn.execute('delete from entity_labels where entity_id=%s', (eid,))
    for label, lang, kind in labels:
        conn.execute('insert into entity_labels(entity_id,label,lang,kind) values(%s,%s,%s,%s)', (eid,label,lang,kind))
    # Relations are inserted after all entity nodes have been upserted.
    return 'changed' if old else 'added'

def replace_relations(conn, eid, relations):
    conn.execute('delete from entity_relations where subject_id=%s', (eid,))
    for p, o, v, source in relations:
        conn.execute('insert into entity_relations(subject_id,predicate,object_id,object_value,source_id) values(%s,%s,%s,%s,%s)',
                     (eid,p,o,Jsonb(v) if v is not None else None,source))

def label_dictionary(conn):
    return conn.execute('select label_norm,entity_id,label from entity_labels order by length(label_norm) desc,entity_id,label').fetchall()

def find_document(conn, key):
    return conn.execute('select id,content_hash from documents where doc_key=%s', (key,)).fetchone()

def document_entities(conn, did):
    return {r[0] for r in conn.execute('select distinct ce.entity_id from chunk_entities ce join chunks c on c.id=ce.chunk_id where c.document_id=%s', (did,))}

def delete_document(conn, did):
    conn.execute('delete from documents where id=%s', (did,))

def insert_document(conn, doc, digest):
    return conn.execute("""insert into documents(doc_key,source_id,doc_type,lang,title,store_id,body,content_hash)
        values(%s,%s,%s,%s,%s,%s,%s,%s) returning id""",
        (doc.doc_key,source_id(conn,doc.source_key),doc.doc_type,doc.lang,doc.title,doc.store_id,doc.body,digest)).fetchone()[0]

def insert_chunk(conn, did, doc, chunk, digest):
    cid = conn.execute('insert into chunks(document_id,chunk_index,content,doc_type,lang,content_hash) values(%s,%s,%s,%s,%s,%s) returning id',
        (did,chunk.chunk_index,chunk.content,doc.doc_type,doc.lang,digest)).fetchone()[0]
    for eid in sorted(chunk.entity_ids):
        conn.execute('insert into chunk_entities(chunk_id,entity_id) values(%s,%s)', (cid,eid))
    return cid

def pending_chunks(conn, batch):
    return conn.execute('select id,content from chunks where embedding is null order by id limit %s for update', (batch,)).fetchall()

def update_embeddings(conn, ids, vectors):
    if len(ids) != len(vectors):
        raise ValueError('임베딩 개수가 조각 개수와 다릅니다.')
    for cid, vector in zip(ids, vectors):
        conn.execute('update chunks set embedding=%s where id=%s', (Vector(vector),cid))

def match_chunks(conn, vector, entity_ids, doc_types, lang, k, minimum):
    return conn.execute('select * from match_chunks(%s,%s,%s,%s,%s,%s)',
        (Vector(vector),entity_ids,doc_types,lang,k,minimum)).fetchall()

def invalidate_cache_for_entity(conn, eid):
    return conn.execute('select invalidate_cache_for_entity(%s)', (eid,)).fetchone()[0]

def prune_documents(conn, keys):
    rows = conn.execute("select id from documents where doc_key not like 'merchant_tip:%%' and not (doc_key=any(%s))", (list(keys),)).fetchall()
    for (did,) in rows:
        for eid in document_entities(conn, did):
            invalidate_cache_for_entity(conn, eid)
        delete_document(conn, did)
    return len(rows)

def lock_document(conn, key):
    conn.execute('select pg_advisory_xact_lock(hashtextextended(%s,0))', (key,))
