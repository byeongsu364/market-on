"""Merchant assortment persistence. Daily picks were replaced by closing_sales."""

from psycopg.types.json import Jsonb
from ._operational import rows


def items(conn, store_id):
    return rows(
        conn,
        'select e.id as item_id,e.name_ko,i.source from store_items i join entities e on e.id=i.item_id where i.store_id=%s order by e.id',
        (store_id,),
    )


def valid_items(conn, item_ids):
    return {
        r[0]
        for r in conn.execute(
            "select id from entities where type='item' and id=any(%s)", (list(item_ids),)
        )
    }


def valid_unit(conn, unit_id):
    return bool(
        conn.execute("select 1 from entities where id=%s and type='unit'", (unit_id,)).fetchone()
    )


def update_hours(conn, store_id, hours):
    conn.execute('update stores set hours=%s where id=%s', (Jsonb(hours), store_id))
