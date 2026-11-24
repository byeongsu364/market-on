"""Store-scoped sales and public active-sale queries."""

from ._operational import rows


def create(conn, store_id, values):
    result = rows(
        conn,
        """insert into closing_sales(store_id,item_id,sale_price,regular_price,unit_id,note,starts_at,ends_at)
        values(%s,%s,%s,%s,%s,%s,%s,%s) returning *""",
        (
            store_id,
            values['item_id'],
            values['sale_price'],
            values.get('regular_price'),
            values.get('unit_id'),
            values.get('note'),
            values['starts_at'],
            values['ends_at'],
        ),
    )
    return result[0]


def get(conn, sale_id, store_id):
    result = rows(
        conn, 'select * from closing_sales where id=%s and store_id=%s', (sale_id, store_id)
    )
    return result[0] if result else None


def end(conn, sale_id, store_id):
    result = rows(
        conn,
        "update closing_sales set status='ended' where id=%s and store_id=%s returning *",
        (sale_id, store_id),
    )
    return result[0] if result else None


def list_store(conn, store_id, status, now):
    return rows(
        conn,
        """select c.*,coalesce((select sum(v.count) from store_views v where v.sale_id=c.id),0) as views
        from closing_sales c where c.store_id=%s and c.created_at >= %s - interval '30 days'
        and ((%s='active' and c.status='active' and %s between c.starts_at and c.ends_at)
          or (%s='ended' and (c.status='ended' or c.ends_at<%s))) order by c.created_at desc,c.id desc""",
        (store_id, now, status, now, status, now),
    )


def active(conn, now, market_id=None, item_id=None, store_id=None):
    return rows(
        conn,
        """select c.*,s.name_ko as store_name,s.market_id,e.name_ko as item_name
        from closing_sales c join stores s on s.id=c.store_id join entities e on e.id=c.item_id
        where s.active and c.status='active' and %s between c.starts_at and c.ends_at
        and (%s::text is null or s.market_id=%s) and (%s::text is null or c.item_id=%s)
        and (%s::text is null or c.store_id=%s) order by c.ends_at,c.id""",
        (now, market_id, market_id, item_id, item_id, store_id, store_id),
    )


def public_get(conn, sale_id):
    result = rows(
        conn,
        'select c.* from closing_sales c join stores s on s.id=c.store_id where c.id=%s and s.active',
        (sale_id,),
    )
    return result[0] if result else None


def latest_active_by_store(conn, market_id, now):
    return rows(
        conn,
        """select distinct on (c.store_id)
        c.store_id,c.sale_price,c.regular_price,c.ends_at
        from closing_sales c join stores s on s.id=c.store_id
        where s.market_id=%s and s.active and c.status='active'
        and %s between c.starts_at and c.ends_at
        order by c.store_id,c.created_at desc,c.id desc""",
        (market_id, now),
    )
