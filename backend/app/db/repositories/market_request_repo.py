"""Market demand and application persistence."""

from ._operational import rows


def lock_market(conn, market_id):
    result = rows(conn, 'select * from markets where id=%s for update', (market_id,))
    return result[0] if result else None


def search(conn, q):
    return rows(
        conn,
        'select * from markets where strpos(lower(name_ko),lower(%s))>0 order by name_ko,id limit 20',
        (q,),
    )


def record(conn, market_id, digest, kind):
    conn.execute(
        """insert into market_demand(market_id,day,device_hash,kind)
    values(%s,(now() at time zone 'Asia/Seoul')::date,%s,%s) on conflict do nothing""",
        (market_id, digest, kind),
    )


def demand(conn, market_id):
    return rows(
        conn,
        """select kind,count(distinct device_hash) as count from market_demand
    where market_id=%s and day between (now() at time zone 'Asia/Seoul')::date-6
    and (now() at time zone 'Asia/Seoul')::date group by kind""",
        (market_id,),
    )


def pending(conn, market_id):
    return bool(
        rows(
            conn,
            "select id from market_applications where market_id=%s and status='pending'",
            (market_id,),
        )
    )


def create(conn, data, uid):
    return rows(
        conn,
        """insert into market_applications
    (market_id,manager_org,contact,store_count,note,admin_user_id) values(%s,%s,%s,%s,%s,%s) returning *""",
        (data.market_id, data.manager_org, data.contact, data.store_count, data.note, uid),
    )[0]


def applications(conn, status):
    return rows(
        conn, 'select * from market_applications where status=%s order by created_at,id', (status,)
    )


def get(conn, aid, lock=False):
    result = rows(
        conn,
        'select * from market_applications where id=%s' + (' for update' if lock else ''),
        (aid,),
    )
    return result[0] if result else None


def review(conn, aid, status, reviewer):
    return rows(
        conn,
        """update market_applications set status=%s,reviewed_by=%s,reviewed_at=now()
    where id=%s returning *""",
        (status, reviewer, aid),
    )[0]


def activate(conn, market_id):
    conn.execute("update markets set status='active' where id=%s", (market_id,))


def upsert_listed(conn, value):
    conn.execute(
        """insert into markets(id,name_ko,address,lat,lng,store_count,status,source)
    values(%(id)s,%(name_ko)s,%(address)s,%(lat)s,%(lng)s,%(store_count)s,'listed','std_market_data')
    on conflict(id) do update set name_ko=excluded.name_ko,address=excluded.address,
    lat=excluded.lat,lng=excluded.lng,store_count=excluded.store_count""",
        value,
    )
