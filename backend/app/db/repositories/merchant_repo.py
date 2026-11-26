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


def varieties(conn, store_id):
    result = {}
    for row in rows(
        conn,
        'select item_id,variety_id from store_item_varieties where store_id=%s order by item_id,variety_id',
        (store_id,),
    ):
        result.setdefault(row['item_id'], []).append(row['variety_id'])
    return result


def set_varieties(conn, store_id, values):
    conn.execute('delete from store_item_varieties where store_id=%s', (store_id,))
    for item, ids in values.items():
        for variety in set(ids):
            conn.execute(
                'insert into store_item_varieties values(%s,%s,%s)', (store_id, item, variety)
            )
