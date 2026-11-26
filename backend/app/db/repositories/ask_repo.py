"""Ask cache, anonymous quota and provenance SQL."""

from uuid import uuid4

from psycopg.types.json import Jsonb


def consume_quota(conn, device_hash):
    # Durable, process-independent quota; no raw question or device ID is stored.
    prefix = f'ask-rate:{device_hash}:'
    with conn.transaction():
        conn.execute('select pg_advisory_xact_lock(hashtextextended(%s,0))', (prefix,))
        # 한 시간 지난 기록은 지워서 답변 캐시 테이블이 계속 커지지 않게
        conn.execute(
            "delete from response_cache where starts_with(cache_key,%s) and created_at <= now()-interval '1 hour'",
            (prefix,),
        )
        count = conn.execute(
            "select count(*) from response_cache where starts_with(cache_key,%s) and created_at > now()-interval '1 hour'",
            (prefix,),
        ).fetchone()[0]
        if count >= 60:
            return False
        conn.execute(
            'insert into response_cache(cache_key,answer,model) values(%s,%s,%s)',
            (prefix + str(uuid4()), Jsonb({}), 'quota'),
        )
    return True


def document_version(conn, item_id):
    return conn.execute(
        """select d.doc_key,d.body,d.content_hash,s.title,s.publisher,s.url,s.license
        from documents d join sources s on s.id=d.source_id
        where exists (select 1 from chunks c join chunk_entities ce on ce.chunk_id=c.id
        where c.document_id=d.id and ce.entity_id=%s) order by d.doc_key""",
        (item_id,),
    ).fetchall()


def get_cache(conn, key):
    row = conn.execute('select answer from response_cache where cache_key=%s', (key,)).fetchone()
    return row[0] if row else None


def put_cache(conn, key, answer, model):
    conn.execute(
        """insert into response_cache(cache_key,answer,model) values(%s,%s,%s)
        on conflict(cache_key) do update set answer=excluded.answer,model=excluded.model,created_at=now()""",
        (key, Jsonb(answer), model),
    )


def sources(conn, chunk_ids):
    from ._operational import rows

    return rows(
        conn,
        """select distinct s.title,s.publisher,s.url,s.license from sources s
        join documents d on d.source_id=s.id join chunks c on c.document_id=d.id
        where c.id=any(%s) order by s.title,s.publisher,s.url,s.license""",
        (chunk_ids,),
    )


def item_dictionary(conn):
    return conn.execute("""select l.label_norm,l.entity_id,l.label from entity_labels l
        join entities e on e.id=l.entity_id where e.type='item'
        order by length(l.label_norm) desc,l.entity_id,l.label""").fetchall()
