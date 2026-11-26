"""Observed and consumer-reported prices, ontology codes and retail baselines."""

from psycopg import sql

from ._operational import rows as fetch_rows
from ._operational import save

OBSERVATION_FIELDS = [
    'source',
    'exmn_ymd',
    'se_cd',
    'mrkt_cd',
    'item_cd',
    'vrty_cd',
    'grd_cd',
    'ctgry_cd',
    'item_nm',
    'vrty_nm',
    'grd_nm',
    'sgg_nm',
    'mrkt_nm',
    'market_type',
    'unit',
    'unit_sz',
    'price',
    'item_id',
    'variety_id',
    'fetched_at',
]


def upsert_observations(conn, rows):
    inserted = updated = 0
    with conn.transaction():
        for row in rows:
            if set(row) - set(OBSERVATION_FIELDS):
                raise ValueError('Unknown observation fields')
            fields = [f for f in OBSERVATION_FIELDS if f in row]
            query = sql.SQL(
                'insert into price_observations ({}) values ({}) on conflict(source,exmn_ymd,se_cd,mrkt_cd,item_cd,vrty_cd,grd_cd) do update set {} returning (xmax=0)'
            ).format(
                sql.SQL(',').join(map(sql.Identifier, fields)),
                sql.SQL(',').join(sql.Placeholder() for _ in fields),
                sql.SQL(',').join(
                    sql.SQL('{}=excluded.{}').format(sql.Identifier(f), sql.Identifier(f))
                    for f in fields
                ),
            )
            if conn.execute(query, [row[f] for f in fields]).fetchone()[0]:
                inserted += 1
            else:
                updated += 1
    return inserted, updated


def latest_exmn_date(conn, item_id, variety_id=None, on_date=None):
    return conn.execute(
        'select max(exmn_ymd) from price_observations where item_id=%s and (%s::text is null or variety_id=%s) and exmn_ymd<=coalesce(%s::date,current_date)',
        (item_id, variety_id, variety_id, on_date),
    ).fetchone()[0]


def insert_report(conn, **values):
    return save(conn, 'price_reports', values)


def list_reports(conn, market_id, item_id=None, since=None):
    return fetch_rows(
        conn,
        'select * from price_reports where market_id=%s and (%s::text is null or item_id=%s) and (%s::timestamptz is null or reported_at>=%s) order by reported_at desc,id desc',
        (market_id, item_id, item_id, since, since),
    )


def kamis_entities(conn, item_id=None):
    return fetch_rows(
        conn,
        """select id,type,name_ko,kamis from entities where kamis is not null
        and (%s::text is null or id=%s) order by id""",
        (item_id, item_id),
    )


def varieties(conn, item_id):
    return fetch_rows(
        conn,
        """select e.id,e.type,e.name_ko,e.kamis,r.props,
        r.subject_id as item_id from entity_relations r join entities e on e.id=r.object_id
        where r.subject_id=%s and r.predicate='hasGrade' and e.type='variety'
        order by e.id""",
        (item_id,),
    )


def backfill_varieties(conn, item_id=None):
    with conn.transaction():
        return conn.execute(
            """update price_observations p set variety_id=e.id, item_id=r.subject_id
            from entities e join entity_relations r on r.object_id=e.id
            and r.predicate='hasGrade'
            where e.type='variety' and p.variety_id is null
            and p.item_cd=e.kamis->>'item_cd' and p.vrty_cd=e.kamis->>'vrty_cd'
            and (p.item_id is null or p.item_id=r.subject_id)
            and (%s::text is null or r.subject_id=%s)""",
            (item_id, item_id),
        ).rowcount


def sale_units(conn, item_id):
    return fetch_rows(
        conn,
        """select e.id,e.name_ko,r.props from entity_relations r
        join entities e on e.id=r.object_id where r.subject_id=%s and r.predicate='soldBy'
        order by e.id""",
        (item_id,),
    )


def observation_unit_id(conn, unit, size):
    """Only single survey units can use an existing ontology unit ID."""
    try:
        if float(size) != 1:
            return None
    except (ValueError, TypeError):
        return None
    suffix = {'개': 'piece', '단': 'bunch', '킬로그램': 'kg', '그램': 'g'}.get(unit, unit)
    result = fetch_rows(
        conn, "select id from entities where id=%s and type='unit'", (f'unit:{suffix}',)
    )
    return result[0]['id'] if result else None


def baseline(
    conn, item_id, *, on_date, sgg_nm=None, market_at_cd=None, lookback_days=14, variety_id=None
):
    from datetime import timedelta

    data = fetch_rows(
        conn,
        """select p.* from price_observations p join entities e on e.id=coalesce(%s,p.item_id)
        where p.item_id=%s and p.se_cd='01' and p.grd_cd=coalesce(e.kamis->>'grd_cd','04')
        and (%s::text is null or p.variety_id=%s)
        and p.exmn_ymd between %s and %s order by p.exmn_ymd desc,p.mrkt_cd""",
        (
            variety_id,
            item_id,
            variety_id,
            variety_id,
            on_date - timedelta(days=lookback_days),
            on_date,
        ),
    )
    data = [
        r
        for r in data
        if on_date - timedelta(days=lookback_days) <= r['exmn_ymd'] <= on_date
        and r['market_type'] in ('traditional', 'large_retail')
    ]
    if not data:
        return None
    regional = [r for r in data if r['sgg_nm'] == sgg_nm] if sgg_nm else []
    selected = regional or data
    latest = max(r['exmn_ymd'] for r in selected)
    selected = [r for r in selected if r['exmn_ymd'] == latest]
    unit, size = selected[0]['unit'], selected[0]['unit_sz']
    # Never average prices expressed in different observation units.
    selected = [r for r in selected if (r['unit'], r['unit_sz']) == (unit, size)]

    def stats(rows):
        prices = [r['price'] for r in rows]
        return (
            {
                'avg': sum(prices) / len(prices),
                'min': min(prices),
                'max': max(prices),
                'n': len(prices),
            }
            if prices
            else None
        )

    market = next((r for r in selected if r['mrkt_cd'] == market_at_cd), None)
    return {
        'exmn_ymd': latest,
        'scope': 'region' if regional else 'national',
        'unit': unit,
        'unit_sz': size,
        'traditional': stats([r for r in selected if r['market_type'] == 'traditional']),
        'large_retail': stats([r for r in selected if r['market_type'] == 'large_retail']),
        'all': stats(selected),
        'this_market': {'price': market['price'], 'mrkt_nm': market['mrkt_nm']} if market else None,
    }


def lock_device(conn, device_hash):
    conn.execute('select pg_advisory_xact_lock(hashtextextended(%s,0))', (device_hash,))


def hourly_report_count(conn, device_hash):
    return conn.execute(
        """select count(*) from price_reports where device_hash=%s
        and reported_at > clock_timestamp() - interval '1 hour'""",
        (device_hash,),
    ).fetchone()[0]


def save_recent_report(conn, values):
    recent = conn.execute(
        """select id from price_reports where device_hash=%s and item_id=%s
        and market_id=%s
        and (store_id is not distinct from %s or (%s::text is not null and store_id is null))
        and reported_at > clock_timestamp() - interval '10 minutes'
        order by (store_id is not distinct from %s) desc, reported_at desc, id desc
        limit 1 for update""",
        # 점포를 나중에 고르면 같은 기기의 시장 단위 제보를 그 점포 제보로 바꿔요 (중복 집계 방지)
        (
            values['device_hash'],
            values['item_id'],
            values['market_id'],
            values['store_id'],
            values['store_id'],
            values['store_id'],
        ),
    ).fetchone()
    if recent:
        conn.execute(
            """update price_reports set unit_id=%s,quantity=%s,price=%s,method=%s,
            media_id=%s,store_id=%s,reported_at=clock_timestamp() where id=%s""",
            (
                values['unit_id'],
                values['quantity'],
                values['price'],
                values['method'],
                values['media_id'],
                values['store_id'],
                recent[0],
            ),
        )
        return {'id': recent[0], 'updated': True}
    return {'id': insert_report(conn, **values), 'updated': False}


def store_confirmations(conn, store_id, item_id=None):
    return fetch_rows(
        conn,
        """select * from store_price_confirmations where store_id=%s
        and (%s::text is null or item_id=%s) order by confirmed_at desc,id desc""",
        (store_id, item_id, item_id),
    )


def confirm_store_price(conn, store_id, item_id, unit_id, price, user_id):
    return fetch_rows(
        conn,
        """insert into store_price_confirmations
        (store_id,item_id,unit_id,price,confirmed_by) values (%s,%s,%s,%s,%s)
        returning price,confirmed_at""",
        (store_id, item_id, unit_id, price, user_id),
    )[0]
