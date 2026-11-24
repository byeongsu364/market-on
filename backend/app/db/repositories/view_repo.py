"""Anonymous counters by Seoul calendar date."""


def increment(conn, store_id, day, sale_id=None):
    return conn.execute(
        """insert into store_views(store_id,sale_id,day,count) values(%s,%s,%s,1)
        on conflict(store_id,(coalesce(sale_id,0)),day) do update set count=store_views.count+1 returning count""",
        (store_id, sale_id, day),
    ).fetchone()[0]


def today(conn, store_id, day):
    return conn.execute(
        'select coalesce(sum(count),0) from store_views where store_id=%s and sale_id is null and day=%s',
        (store_id, day),
    ).fetchone()[0]
