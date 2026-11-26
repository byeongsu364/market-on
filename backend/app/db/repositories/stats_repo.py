"""Scoped counters without join multiplication; all dates supplied in Seoul time."""

from ._operational import rows


def directions(conn, store_id, day):
    conn.execute(
        """insert into store_directions(store_id,day,count) values(%s,%s,1)
        on conflict(store_id,day) do update set count=store_directions.count+1""",
        (store_id, day),
    )


def daily(conn, store_id, start, end):
    return rows(
        conn,
        """select day,sum(views)::int as views,sum(directions)::int as directions from (
        select day,count as views,0 as directions from store_views where store_id=%s
        union all select day,0,count from store_directions where store_id=%s
        ) counters where day between %s and %s group by day order by day""",
        (store_id, store_id, start, end),
    )


def market(conn, market_id, start, end):
    return rows(
        conn,
        """select
        (select count(*) from stores where market_id=%s and active) as stores,
        (select count(*) from users u join stores s on s.id=u.store_id
          where s.market_id=%s and u.role='merchant' and u.status='approved') as merchants_approved,
        (select count(*) from users u join stores s on s.id=u.store_id
          where s.market_id=%s and u.role='merchant' and u.status='pending') as merchants_pending,
        (select coalesce(sum(v.count),0) from store_views v join stores s on s.id=v.store_id
          where s.market_id=%s and v.day between %s and %s) as views_week""",
        (market_id, market_id, market_id, market_id, start, end),
    )[0]


def recent(conn, market_id, start, end):
    return rows(
        conn,
        """select u.id as user_id,u.login_id,s.id as store_id,s.name_ko as store_name,
        max(c.created_at) as last_sale_at,
        count(c.id) filter(where c.created_at >= %s and c.created_at < %s) as sales_week
        from users u join stores s on s.id=u.store_id
        left join closing_sales c on c.store_id=s.id
        where u.role='merchant' and u.status='approved' and s.market_id=%s
        group by u.id,s.id order by last_sale_at desc nulls last,u.login_id,u.id""",
        (start, end, market_id),
    )


def markets(conn, status, start, end):
    if status == 'active':
        return rows(
            conn,
            """select m.id as market_id,m.name_ko as name,
            (select count(*) from stores s where s.market_id=m.id and s.active) as stores,
            (select count(*) from users u join stores s on s.id=u.store_id
              where s.market_id=m.id and u.role='merchant' and u.status='approved') as merchants_approved,
            (select coalesce(sum(v.count),0) from store_views v join stores s on s.id=v.store_id
              where s.market_id=m.id and v.day between %s and %s) as views_week
            from markets m where m.status='active' order by m.name_ko,m.id""",
            (start, end),
        )
    return rows(
        conn,
        """select m.id as market_id,m.name_ko as name,
        (select count(*) from market_demand d where d.market_id=m.id and d.kind='request'
          and d.day between %s and %s) as requests_week,
        (select count(*) from market_demand d where d.market_id=m.id and d.kind='request') as requests_total,
        (select json_build_object('status',a.status,'created_at',a.created_at)
         from market_applications a where a.market_id=m.id order by a.created_at desc,a.id desc limit 1) as application
        from markets m where m.status='listed'
        order by requests_week desc,requests_total desc,m.name_ko,m.id""",
        (start, end),
    )
