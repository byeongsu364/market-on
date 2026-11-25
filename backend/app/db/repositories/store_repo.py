"""Market, zone, store and assortment persistence."""

from ._operational import save, rows


def upsert_market(conn, **values):
    return save(conn, 'markets', values, upsert=True)


def upsert_zone(conn, **values):
    return save(conn, 'zones', values, upsert=True)


def upsert_store(conn, **values):
    return save(conn, 'stores', values, upsert=True)


def get_market(conn, market_id):
    result = rows(conn, 'select * from markets where id=%s', (market_id,))
    return result[0] if result else None


def get_zone(conn, zone_id):
    result = rows(conn, 'select * from zones where id=%s', (zone_id,))
    return result[0] if result else None


def get_store(conn, store_id):
    result = rows(conn, 'select * from stores where id=%s', (store_id,))
    return result[0] if result else None


def list_markets(conn):
    return rows(conn, 'select * from markets order by id')


def list_zones(conn, market_id):
    return rows(conn, 'select * from zones where market_id=%s order by id', (market_id,))


def list_stores(conn, market_id):
    return rows(conn, 'select * from stores where market_id=%s order by id', (market_id,))


def stores_selling(conn, market_id, item_id):
    return rows(
        conn,
        'select s.* from stores s join store_items i on i.store_id=s.id where s.market_id=%s and i.item_id=%s and s.active order by s.id',
        (market_id, item_id),
    )


def set_store_items(conn, store_id, item_ids, source):
    with conn.transaction():
        conn.execute('delete from store_items where store_id=%s', (store_id,))
        for item_id in sorted(set(item_ids)):
            conn.execute(
                'insert into store_items(store_id,item_id,source) values(%s,%s,%s)',
                (store_id, item_id, source),
            )


def upsert_market(conn, **values):
    return save(conn, 'markets', values, upsert=True)


def get_market(conn, market_id):
    result = rows(conn, 'select * from markets where id=%s', (market_id,))
    return result[0] if result else None


def list_markets(conn):
    return rows(conn, 'select * from markets order by id')


def upsert_zone(conn, **values):
    return save(conn, 'zones', values, upsert=True)


def get_zone(conn, zone_id):
    result = rows(conn, 'select * from zones where id=%s', (zone_id,))
    return result[0] if result else None


def list_zones(conn, market_id):
    return rows(conn, 'select * from zones where market_id=%s order by id', (market_id,))


def upsert_store(conn, **values):
    return save(conn, 'stores', values, upsert=True)


def get_store(conn, store_id):
    result = rows(conn, 'select * from stores where id=%s', (store_id,))
    return result[0] if result else None


def list_stores(conn, market_id):
    return rows(conn, 'select * from stores where market_id=%s order by id', (market_id,))


def stores_selling(conn, market_id, item_id):
    return rows(
        conn,
        'select s.* from stores s join store_items i on i.store_id=s.id where s.market_id=%s and i.item_id=%s and s.active order by s.id',
        (market_id, item_id),
    )


def market_items(conn, market_id):
    return rows(
        conn,
        """select i.store_id,i.item_id from store_items i
        join stores s on s.id=i.store_id where s.market_id=%s
        order by i.store_id,i.item_id""",
        (market_id,),
    )
