# FastAPI dependencies and pytest fixture imports are intentional.
# ruff: noqa: B008
"""Customer favorites, inbox, settings and browser subscriptions."""

from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.errors import AppError
from app.db.repositories._operational import rows
from app.deps import get_db, require_csrf, require_customer
from app.services import notification_service as service
from app.services import web_push

router = APIRouter(tags=['notifications'], dependencies=[Depends(require_csrf)])


class FavoriteWrite(BaseModel):
    notify: bool = True


class SettingsWrite(BaseModel):
    sales: bool = True
    season: bool = True


class Keys(BaseModel):
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)


class Subscription(BaseModel):
    endpoint: str = Field(max_length=4096)
    keys: Keys


class Endpoint(BaseModel):
    endpoint: str = Field(max_length=4096)


@router.get('/push/public-key')
def public_key():
    return {'public_key': settings.VAPID_PUBLIC_KEY if web_push.enabled() else None}


@router.get('/me/favorites')
def favorites(user=Depends(require_customer), conn=Depends(get_db)):
    return service.favorites(conn, user['id'])


@router.put('/me/favorites/{store_id}')
def save(store_id: str, data: FavoriteWrite, user=Depends(require_customer), conn=Depends(get_db)):
    if not rows(conn, 'select id from stores where id=%s and active', (store_id,)):
        raise AppError('STORE_NOT_FOUND', '점포를 찾을 수 없습니다.', 404)
    conn.execute(
        'insert into favorites(user_id,store_id,notify) values(%s,%s,%s) on conflict(user_id,store_id) do update set notify=excluded.notify',
        (user['id'], store_id, data.notify),
    )
    return service.favorites(conn, user['id'])


@router.delete('/me/favorites/{store_id}')
def delete(store_id: str, user=Depends(require_customer), conn=Depends(get_db)):
    conn.execute('delete from favorites where user_id=%s and store_id=%s', (user['id'], store_id))
    return service.favorites(conn, user['id'])


@router.get('/me/notifications/settings')
def get_settings(user=Depends(require_customer), conn=Depends(get_db)):
    return service.settings(conn, user['id'])


@router.put('/me/notifications/settings')
def save_settings(data: SettingsWrite, user=Depends(require_customer), conn=Depends(get_db)):
    conn.execute(
        'insert into notification_settings values(%s,%s,%s) on conflict(user_id) do update set sales=excluded.sales,season=excluded.season',
        (user['id'], data.sales, data.season),
    )
    return data


@router.get('/me/notifications')
def inbox(
    unread: bool = False,
    user=Depends(require_customer),
    conn=Depends(get_db),
):
    service.cleanup(conn)
    return rows(
        conn,
        'select * from notifications where user_id=%s and (not %s or read_at is null) order by created_at desc,id desc',
        (user['id'], unread),
    )


@router.post('/me/notifications/read-all', status_code=204)
def read_all(user=Depends(require_customer), conn=Depends(get_db)):
    conn.execute(
        'update notifications set read_at=coalesce(read_at,now()) where user_id=%s', (user['id'],)
    )


@router.post('/me/notifications/{notification_id}/read', status_code=204)
def read(notification_id: int, user=Depends(require_customer), conn=Depends(get_db)):
    if not rows(
        conn,
        'update notifications set read_at=coalesce(read_at,now()) where user_id=%s and id=%s returning id',
        (user['id'], notification_id),
    ):
        raise AppError('NOT_FOUND', '알림을 찾을 수 없습니다.', 404)


@router.post('/me/push/subscribe', status_code=204)
def subscribe(data: Subscription, user=Depends(require_customer), conn=Depends(get_db)):
    try:
        web_push.validate_endpoint(data.endpoint)
        ec.EllipticCurvePublicKey.from_encoded_point(
            ec.SECP256R1(), web_push.decode(data.keys.p256dh)
        )
        if len(web_push.decode(data.keys.auth)) != 16:
            raise ValueError()
    except (ValueError, OSError):
        raise AppError('INVALID_SUBSCRIPTION', '푸시 구독 정보를 확인해 주세요.', 422) from None
    conn.execute(
        """insert into push_subscriptions(user_id,endpoint,p256dh,auth) values(%s,%s,%s,%s)
    on conflict(endpoint) do update set user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,last_ok_at=null""",
        (user['id'], data.endpoint, data.keys.p256dh, data.keys.auth),
    )


@router.delete('/me/push/subscribe', status_code=204)
def unsubscribe(data: Endpoint, user=Depends(require_customer), conn=Depends(get_db)):
    conn.execute(
        'delete from push_subscriptions where user_id=%s and endpoint=%s',
        (user['id'], data.endpoint),
    )
