"""Market-scoped aggregate persistence."""

from ._operational import rows


def summary(conn, market_id):
    return rows(
        conn,
        """select m.id as market_id, m.name_ko as name,
      (select count(*) from stores s where s.market_id=m.id) as stores_total,
      (select count(*) from users u join stores s on s.id=u.store_id
       where s.market_id=m.id and u.role='merchant' and u.status='approved') as merchants_approved,
      (select count(*) from users u join stores s on s.id=u.store_id
       where s.market_id=m.id and u.role='merchant' and u.status='pending') as merchants_pending,
      (select coalesce(sum(v.count),0) from store_views v join stores s on s.id=v.store_id
       where s.market_id=m.id and v.sale_id is null
       and v.day between (now() at time zone 'Asia/Seoul')::date - 6
       and (now() at time zone 'Asia/Seoul')::date) as views_7d
      from markets m where m.id=%s""",
        (market_id,),
    )[0]
