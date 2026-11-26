"""Review persistence and atomic per-account daily budget."""

from ._operational import rows


def listing(conn, store_id, user_id, limit, offset):
    summary = rows(
        conn,
        'select round(avg(rating),1)::float8 as average,count(*) as count from store_reviews where store_id=%s',
        (store_id,),
    )[0]
    items = rows(
        conn,
        """select r.id,r.rating,r.body,left(u.login_id,3)||'***' as author,
        r.created_at,r.updated_at,coalesce(r.user_id=%s,false) as mine
        from store_reviews r join users u on u.id=r.user_id
        where r.store_id=%s order by r.updated_at desc,r.id desc limit %s offset %s""",
        (user_id, store_id, limit, offset),
    )
    return summary | {'items': items}


def consume(conn, user_id, day):
    return (
        conn.execute(
            """insert into review_daily_writes(user_id,day,writes) values(%s,%s,1)
        on conflict(user_id,day) do update set writes=review_daily_writes.writes+1
        where review_daily_writes.writes<10 returning writes""",
            (user_id, day),
        ).fetchone()
        is not None
    )


def upsert(conn, store_id, user_id, rating, body):
    conn.execute(
        """insert into store_reviews(store_id,user_id,rating,body,created_at,updated_at)
        values(%s,%s,%s,%s,clock_timestamp(),clock_timestamp())
        on conflict(store_id,user_id) do update set rating=excluded.rating,body=excluded.body,updated_at=clock_timestamp()""",
        (store_id, user_id, rating, body),
    )


def delete(conn, store_id, user_id):
    conn.execute('delete from store_reviews where store_id=%s and user_id=%s', (store_id, user_id))
