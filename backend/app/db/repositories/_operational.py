"""Shared, allowlisted operational SQL helpers. Transactions belong to callers."""

from psycopg import sql
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

TABLE_FIELDS = {
    'markets': 'id name_ko region_id address lat lng at_mrkt_cd at_sgg_nm floorplan_svg source',
    'zones': 'id market_id store_category_id name_ko svg_path x y',
    'stores': 'id market_id zone_id name_ko store_category_id sbiz_id sbiz_industry floor map_x map_y hours source active lat lng location_verified payments intro',
    'price_reports': 'market_id store_id item_id unit_id quantity price method media_id reported_at device_hash',
    'media': 'id kind path mime bytes',
}


def save(conn, table, values, *, upsert=False):
    allowed = TABLE_FIELDS[table].split()
    if set(values) - set(allowed):
        raise ValueError(f'Unknown {table} fields: {sorted(set(values) - set(allowed))}')
    fields = [f for f in allowed if f in values]
    query = sql.SQL('insert into {} ({}) values ({})').format(
        sql.Identifier(table),
        sql.SQL(',').join(map(sql.Identifier, fields)),
        sql.SQL(',').join(sql.Placeholder() for _ in fields),
    )
    if upsert:
        updates = [
            (
                sql.SQL(
                    '{}=CASE WHEN stores.location_verified THEN stores.{} ELSE excluded.{} END'
                ).format(sql.Identifier(f), sql.Identifier(f), sql.Identifier(f))
                if table == 'stores'
                and values.get('source') == 'sbiz'
                and f in ('lat', 'lng', 'location_verified')
                else sql.SQL('{}=excluded.{}').format(sql.Identifier(f), sql.Identifier(f))
            )
            for f in fields
            if f != 'id'
        ]
        query += sql.SQL(' on conflict(id) do update set {}').format(sql.SQL(',').join(updates))
    query += sql.SQL(' returning id')
    return conn.execute(
        query,
        [Jsonb(values[f]) if f == 'hours' and values[f] is not None else values[f] for f in fields],
    ).fetchone()[0]


def rows(conn, query, params=()):
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(query, params)
        return cur.fetchall()
