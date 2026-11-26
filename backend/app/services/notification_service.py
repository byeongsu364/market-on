"""Account inbox and deduplicated notifications. Push runs after DB commit."""

import logging
from urllib.parse import quote
from zoneinfo import ZoneInfo

import httpx
from psycopg import Error as DatabaseError

from app.db import pool
from app.db.repositories import knowledge_repo
from app.db.repositories._operational import rows
from app.services import web_push


def favorites(conn, user_id):
    return rows(
        conn,
        """select f.store_id,s.name_ko as name,s.market_id,f.notify,
    (select json_build_object('sale_price',c.sale_price,'regular_price',c.regular_price,'ends_at',c.ends_at)
     from closing_sales c where c.store_id=s.id and c.status='active' and now() between c.starts_at and c.ends_at
     order by c.created_at desc,c.id desc limit 1) as active_sale
    from favorites f join stores s on s.id=f.store_id where f.user_id=%s and s.active order by f.created_at desc""",
        (user_id,),
    )


def settings(conn, user_id):
    result = rows(
        conn, 'select sales,season from notification_settings where user_id=%s', (user_id,)
    )
    return result[0] if result else {'sales': True, 'season': True}


def cleanup(conn):
    conn.execute("delete from notifications where created_at < now() - interval '90 days'")


def create(conn, user_id, event, kind, title, body, url):
    if (
        not url.startswith('/')
        or url.startswith('//')
        or '\\' in url
        or any(ord(c) < 32 for c in url)
    ):
        raise ValueError('Notification URL must be same-origin')
    claimed = rows(
        conn,
        'insert into notification_events values(%s,%s) on conflict do nothing returning event_key',
        (user_id, event),
    )
    if not claimed:
        return None
    return rows(
        conn,
        """insert into notifications(user_id,kind,title,body,url) values(%s,%s,%s,%s,%s) returning *""",
        (user_id, kind, title, body, url),
    )[0]


def sale_notice(conn, sale_id):
    cleanup(conn)
    sale = rows(
        conn,
        """select c.*,s.name_ko as store_name,e.name_ko as item_name from closing_sales c
    join stores s on s.id=c.store_id join entities e on e.id=c.item_id where c.id=%s""",
        (sale_id,),
    )
    if not sale:
        return []
    s = sale[0]
    recipients = rows(
        conn,
        """select f.user_id from favorites f join users u on u.id=f.user_id
    left join notification_settings n on n.user_id=f.user_id
    where f.store_id=%s and f.notify and coalesce(n.sales,true) and u.role='customer' and u.status='approved'""",
        (s['store_id'],),
    )
    body = f'{s["store_name"]} · {s["item_name"]} {s["sale_price"]:,}원 마감세일 ({s["ends_at"].astimezone(ZoneInfo("Asia/Seoul")):%H:%M}까지)'
    return [
        n
        for u in recipients
        if (
            n := create(
                conn,
                u['user_id'],
                f'sale:{sale_id}',
                'sale',
                s['store_name'],
                body,
                f'/s/{quote(s["store_id"], safe="")}',
            )
        )
    ]


def season_notice(conn, month, year):
    cleanup(conn)
    items = knowledge_repo.in_season(conn, month)
    if not items:
        return []
    title = f'{month}월 제철: ' + ', '.join(i['name'] for i in items)
    users = rows(
        conn,
        """select u.id from users u left join notification_settings n on n.user_id=u.id
    where u.role='customer' and u.status='approved' and coalesce(n.season,true)""",
    )
    return [
        n
        for u in users
        if (n := create(conn, u['id'], f'season:{year}:{month}', 'season', title, title, '/shop'))
    ]


def deliver(notifications):
    if not web_push.enabled():
        return
    for notice in notifications:
        with pool.connection() as conn:
            subscriptions = rows(
                conn, 'select * from push_subscriptions where user_id=%s', (notice['user_id'],)
            )
        for subscription in subscriptions:
            try:
                status = web_push.send(
                    subscription, {k: notice[k] for k in ('title', 'body', 'url')}
                )
                with pool.connection() as conn:
                    if status in (404, 410):
                        conn.execute(
                            'delete from push_subscriptions where id=%s and user_id=%s',
                            (subscription['id'], notice['user_id']),
                        )
                    elif 200 <= status < 300:
                        conn.execute(
                            'update push_subscriptions set last_ok_at=now() where id=%s',
                            (subscription['id'],),
                        )
            except (httpx.HTTPError, ValueError, OSError, DatabaseError):
                # Never include endpoint credentials, exception details or VAPID secrets.
                logging.getLogger(__name__).warning('웹 푸시 전송에 실패했습니다.')


def dispatch_sale(sale_id):
    with pool.connection() as conn:
        notices = sale_notice(conn, sale_id)
    deliver(notices)
