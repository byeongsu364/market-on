"""All knowledge SQL, including file-loader operations, lives here."""

from pgvector import Vector
from psycopg.types.json import Jsonb


def source_id(conn, key):
    row = conn.execute('select id from sources where source_key = %s', (key,)).fetchone()
    if row is None:
        raise ValueError(f'알 수 없는 출처: {key}')
    return row[0]


def upsert_source(conn, key, value):
    fields = ('title', 'publisher', 'url', 'license', 'kind', 'retrieved_at', 'quote_only')
    value = {'quote_only': False, **value}
    if key == 'src:foodsafety-cookrcp01':
        value['quote_only'] = True
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
        """insert into documents(doc_key,source_id,doc_type,lang,title,store_id,body,content_hash,market_id,published,review_status)
        values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id""",
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
            doc.review_status,
        ),
    ).fetchone()[0]


def insert_chunk(conn, did, doc, chunk, digest):
    cid = conn.execute(
        'insert into chunks(document_id,chunk_index,content,doc_type,lang,content_hash,variety_id,numbers,props) values(%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id',
        (
            did,
            chunk.chunk_index,
            chunk.content,
            doc.doc_type,
            doc.lang,
            digest,
            chunk.variety_id,
            chunk.numbers,
            Jsonb(chunk.props),
        ),
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


def match_chunks(conn, vector, entity_ids, doc_types, lang, k, minimum, variety_id=None):
    if variety_id is None:
        # Keep the existing HNSW iterative-scan path for ordinary vector searches.
        return conn.execute(
            """select m.chunk_id,m.content,m.similarity,m.doc_type,m.document_title,
            m.store_id,m.source_title,m.source_url,m.license,(s.quote_only or d.doc_type='recipe'),d.published,d.market_id
            from match_chunks(%s,%s,%s,%s,%s,%s) with ordinality as m
            join chunks c on c.id=m.chunk_id
            join documents d on d.id=c.document_id
            join sources s on s.id=d.source_id order by m.ordinality""",
            (Vector(vector), entity_ids, doc_types, lang, k, minimum),
        ).fetchall()
    return conn.execute(
        """select c.id,c.content,1-(c.embedding <=> %(vector)s),c.doc_type,
        d.title,d.store_id,s.title,s.url,s.license,(s.quote_only or d.doc_type='recipe'),d.published,d.market_id
        from chunks c join documents d on d.id=c.document_id
        join sources s on s.id=d.source_id
        where d.review_status <> 'rejected' and c.embedding is not null
        and (%(entities)s::text[] is null or cardinality(%(entities)s::text[])=0 or exists (
          select 1 from chunk_entities ce where ce.chunk_id=c.id and ce.entity_id=any(%(entities)s)))
        and (%(types)s::text[] is null or c.doc_type=any(%(types)s))
        and (%(lang)s::text is null or c.lang=%(lang)s)
        and 1-(c.embedding <=> %(vector)s) >= %(minimum)s
        order by coalesce(c.variety_id=%(variety)s,false) desc,
        c.embedding <=> %(vector)s,c.id limit %(k)s""",
        {
            'vector': Vector(vector),
            'entities': entity_ids,
            'types': doc_types,
            'lang': lang,
            'minimum': minimum,
            'variety': variety_id,
            'k': k,
        },
    ).fetchall()


def document_varieties(conn, item_ids):
    return {
        r[0]
        for r in conn.execute(
            """select e.id from entity_relations r join entities e on e.id=r.object_id
        where r.subject_id=any(%s) and r.predicate='hasGrade' and e.type='variety'""",
            (item_ids,),
        )
    }


def ko_variety_labels(conn):
    return conn.execute(
        """select l.label_norm,l.entity_id,l.label from entity_labels l
        join entities e on e.id=l.entity_id where e.type='variety' and l.lang='ko'"""
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


def get_item(conn, item_id):
    from ._operational import rows

    result = rows(conn, "select * from entities where id=%s and type='item'", (item_id,))
    return result[0] if result else None


def item_labels(conn, entity_id):
    from ._operational import rows

    return rows(
        conn,
        'select * from entity_labels where entity_id=%s order by lang,kind,label',
        (entity_id,),
    )


def item_relations(conn, item_id):
    from ._operational import rows

    return rows(
        conn,
        """select r.*,e.name_ko,e.type,s.title as source_title
        from entity_relations r join entities e on e.id=r.object_id
        left join sources s on s.id=r.source_id
        where r.subject_id=%s and r.predicate in ('hasCriterion','soldBy','isA') order by r.id""",
        (item_id,),
    )


def search_items(conn, query):
    from ._operational import rows

    # strpos treats %, _ and backslashes as literal query characters.
    return rows(
        conn,
        """select entity_id, variety_id from (
        select distinct on (coalesce(r.subject_id,l.entity_id)) coalesce(r.subject_id,l.entity_id) as entity_id,
          case when e.type='variety' then e.id else null end as variety_id,
          case when l.label_norm=%s then 0
               when strpos(l.label_norm,%s)=1 then 1 else 2 end as rank,
          case when l.kind='preferred' then 0 else 1 end as preferred
        from entity_labels l join entities e on e.id=l.entity_id
        left join entity_relations r on r.object_id=e.id and r.predicate='hasGrade'
        where (e.type='item' or (e.type='variety' and r.subject_id is not null)) and strpos(l.label_norm,%s)>0
        order by coalesce(r.subject_id,l.entity_id),rank,preferred
        ) matches order by rank,preferred,entity_id limit 10""",
        (query, query, query),
    )


def vision_item_labels(conn):
    from ._operational import rows

    return rows(
        conn,
        """select e.id,e.name_ko,l.label,l.kind from entities e
        join entity_labels l on l.entity_id=e.id
        where e.type='item' and (l.kind='vision' or
        (l.lang='en' and l.kind in ('preferred','synonym')))
        order by e.id,l.label""",
    )


def similar_items(conn, item_id):
    from ._operational import rows

    return rows(
        conn,
        """select e.id,e.name_ko from entities e join entities top on top.id=%s
        where e.type='item' and e.id<>top.id and (
          (nullif(top.kamis->>'item_cd','') is not null
           and e.kamis->>'item_cd'=top.kamis->>'item_cd')
          or exists (select 1 from entity_relations r where r.predicate='substituteFor'
            and ((r.subject_id=top.id and r.object_id=e.id)
              or (r.object_id=top.id and r.subject_id=e.id)))) order by e.id""",
        (item_id,),
    )


def item_vocabulary(conn) -> list[dict]:
    from ._operational import rows

    return rows(
        conn,
        """select e.id as item_id, chosen.label as name_en
        from entities e
        join lateral (
          select l.label from entity_labels l where l.entity_id=e.id
          and ((l.lang='en' and l.kind='preferred') or l.kind='vision')
          order by case when l.lang='en' and l.kind='preferred' then 0 else 1 end,
                   l.label limit 1
        ) chosen on true
        where e.type='item'
        order by chosen.label,e.id""",
    )


def unit_labels(conn):
    from ._operational import rows

    return rows(
        conn,
        """select e.id,l.label from entities e
        join entity_labels l on l.entity_id=e.id
        where e.type='unit' and l.lang in ('ko','en') order by e.id,l.label""",
    )


def valid_unit(conn, unit_id):
    return (
        conn.execute("select 1 from entities where id=%s and type='unit'", (unit_id,)).fetchone()
        is not None
    )


def catalog_ids(conn):
    return [
        r[0] for r in conn.execute("select id from entities where type='item' order by name_ko,id")
    ]


def season_relations(conn, item_id):
    from ._operational import rows

    return rows(
        conn,
        """select r.subject_id, r.predicate, r.object_id, r.object_value,
        e.name_ko as subject_name, o.name_ko as object_name,
        s.title, s.publisher, s.url, s.license
        from entity_relations r join entities e on e.id=r.subject_id
        left join entities o on o.id=r.object_id
        join sources s on s.id=r.source_id
        where (r.subject_id=%s or r.subject_id in (
          select object_id from entity_relations where subject_id=%s and predicate='hasGrade'))
        and r.predicate in ('inSeason','harvestPeriod','producedIn')
        order by r.subject_id,r.id""",
        (item_id, item_id),
    )


def in_season(conn, month):
    from ._operational import rows

    return rows(
        conn,
        """select distinct e.id as item_id,e.name_ko as name
        from entities e join entity_relations r on r.subject_id=e.id
        where e.type='item' and r.predicate='inSeason' and r.object_id=%s
        order by e.name_ko,e.id""",
        (f'season:{month:02}',),
    )


def variety_items(conn, variety_ids):
    return [
        r[0]
        for r in conn.execute(
            "select distinct subject_id from entity_relations where predicate='hasGrade' and object_id=any(%s) order by subject_id",
            (variety_ids,),
        )
    ]


def source_title(conn, key):
    row = conn.execute('select title from sources where source_key=%s', (key,)).fetchone()
    return row[0] if row else None


def storage_relations(conn, item_id):
    from ._operational import rows

    return rows(
        conn,
        """select r.object_value, s.source_key, s.title, s.publisher, s.url, s.license
        from entity_relations r join sources s on s.id=r.source_id
        where r.subject_id=%s and r.predicate='storedAs' order by r.id""",
        (item_id,),
    )
