"""Observed and consumer-reported prices, ontology codes and retail baselines."""

from psycopg import sql
from ._operational import save, rows as fetch_rows

OBSERVATION_FIELDS = 'source exmn_ymd se_cd mrkt_cd item_cd vrty_cd grd_cd ctgry_cd item_nm vrty_nm grd_nm sgg_nm mrkt_nm market_type unit unit_sz price item_id variety_id fetched_at'.split()


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


def sale_units(conn, item_id):
    return fetch_rows(
        conn,
        """select e.id,e.name_ko,r.props from entity_relations r
        join entities e on e.id=r.object_id where r.subject_id=%s and r.predicate='soldBy'
        order by e.id""",
        (item_id,),
    )


def baseline(conn, item_id, *, on_date, sgg_nm=None, market_at_cd=None, lookback_days=14):
    from datetime import timedelta

    data = fetch_rows(
        conn,
        """select p.* from price_observations p join entities e on e.id=p.item_id
        where p.item_id=%s and p.se_cd='01' and p.grd_cd=coalesce(e.kamis->>'grd_cd','04')
        and (e.kamis->>'vrty_cd' is null or p.vrty_cd=e.kamis->>'vrty_cd')
        and p.exmn_ymd between %s and %s order by p.exmn_ymd desc,p.mrkt_cd""",
        (item_id, on_date - timedelta(days=lookback_days), on_date),
    )
    if not data:
        return None
    regional = [r for r in data if r['sgg_nm'] == sgg_nm] if sgg_nm else []
    selected = regional or data
    latest = selected[0]['exmn_ymd']
    selected = [r for r in selected if r['exmn_ymd'] == latest]
    unit, size = selected[0]['unit'], selected[0]['unit_sz']
    # Never average prices expressed in different observation units.
    selected = [r for r in selected if (r['unit'], r['unit_sz']) == (unit, size)]

    def stats(rows):
        prices = [r['price'] for r in rows]
        return (
            dict(avg=sum(prices) / len(prices), min=min(prices), max=max(prices), n=len(prices))
            if prices
            else None
        )

    market = next((r for r in selected if r['mrkt_cd'] == market_at_cd), None)
    return dict(
        exmn_ymd=latest,
        scope='region' if regional else 'national',
        unit=unit,
        unit_sz=size,
        traditional=stats([r for r in selected if r['market_type'] == 'traditional']),
        large_retail=stats([r for r in selected if r['market_type'] == 'large_retail']),
        all=stats(selected),
        this_market={'price': market['price'], 'mrkt_nm': market['mrkt_nm']} if market else None,
    )
