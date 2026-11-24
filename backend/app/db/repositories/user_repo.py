"""Account persistence and row locks for approval/login races."""

from uuid import uuid4
from ._operational import rows


def get(conn, user_id, *, lock=False):
    result = rows(
        conn, 'select * from users where id=%s' + (' for update' if lock else ''), (user_id,)
    )
    return result[0] if result else None


def by_login(conn, login_id, *, lock=False):
    result = rows(
        conn, 'select * from users where login_id=%s' + (' for update' if lock else ''), (login_id,)
    )
    return result[0] if result else None


def lock_store(conn, store_id):
    return (
        conn.execute(
            'select id from stores where id=%s and active for update', (store_id,)
        ).fetchone()
        is not None
    )


def store_taken(conn, store_id, exclude=None):
    return bool(
        conn.execute(
            "select 1 from users where store_id=%s and status='approved' and (%s::uuid is null or id<>%s::uuid)",
            (store_id, exclude, exclude),
        ).fetchone()
    )


def create(conn, login_id, password_hash, *, role='merchant', store_id=None, market_id=None):
    uid = uuid4()
    conn.execute(
        """insert into users(id,login_id,password_hash,role,status,store_id,market_id,approved_at)
        values(%s,%s,%s,%s,%s,%s,%s,case when %s<>'merchant' then now() end)""",
        (
            uid,
            login_id,
            password_hash,
            role,
            'pending' if role == 'merchant' else 'approved',
            store_id,
            market_id,
            role,
        ),
    )
    return get(conn, uid)


def login_result(conn, uid, failures, locked_until):
    conn.execute(
        'update users set failed_logins=%s,locked_until=%s where id=%s',
        (failures, locked_until, uid),
    )


def list_merchants(conn, status):
    return rows(
        conn,
        "select * from users where role='merchant' and status=%s order by created_at,id",
        (status,),
    )


def set_status(conn, uid, status, operator_id):
    conn.execute(
        "update users set status=%s,approved_at=case when %s='approved' then now() else null end,approved_by=%s where id=%s",
        (status, status, operator_id, uid),
    )
    return get(conn, uid)


def list_market_admins(conn):
    return rows(conn, "select * from users where role='market_admin' order by created_at,id")


def scoped_merchants(conn, status, market_id):
    return rows(
        conn,
        """select u.* from users u join stores s on s.id=u.store_id
        where u.role='merchant' and u.status=%s and s.market_id=%s order by u.created_at,u.id""",
        (status, market_id),
    )
