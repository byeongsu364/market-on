# FastAPI dependencies and pytest fixture imports are intentional.
# ruff: noqa: B008
"""Approved merchant endpoints."""

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from app.core.config import settings
from app.deps import get_db, require_csrf, require_merchant, require_merchant_write
from app.schemas.merchant import (
    PriceConfirm,
    Repost,
    SaleCreate,
    SaleStatus,
    StoreLocation,
    StorePatch,
)
from app.services import merchant_service as service

router = APIRouter(prefix='/merchant', tags=['merchant'], dependencies=[Depends(require_csrf)])


@router.get('/store')
def store(user=Depends(require_merchant), conn=Depends(get_db)):
    return service.get_store(conn, user)


@router.patch('/store')
def patch(data: StorePatch, user=Depends(require_merchant), conn=Depends(get_db)):
    return service.patch_store(conn, user, data)


@router.get('/sales')
def sales(status: SaleStatus = 'active', user=Depends(require_merchant), conn=Depends(get_db)):
    return service.sales(conn, user, status)


@router.post('/sales', status_code=201)
def create(
    data: SaleCreate,
    background_tasks: BackgroundTasks,
    user=Depends(require_merchant_write, scope='function'),
    conn=Depends(get_db, scope='function'),
):
    from app.services.notification_service import dispatch_sale

    result = service.create_sale(conn, user, data.model_dump())
    background_tasks.add_task(dispatch_sale, result['id'])
    return result


@router.post('/sales/{sale_id}/repost', status_code=201)
def repost(
    sale_id: int,
    data: Repost,
    background_tasks: BackgroundTasks,
    user=Depends(require_merchant_write, scope='function'),
    conn=Depends(get_db, scope='function'),
):
    from app.services.notification_service import dispatch_sale

    result = service.repost(conn, user, sale_id, data.ends_at)
    background_tasks.add_task(dispatch_sale, result['id'])
    return result


@router.post('/sales/{sale_id}/end')
def end(sale_id: int, user=Depends(require_merchant), conn=Depends(get_db)):
    return service.end(conn, user, sale_id)


@router.get('/poster')
def poster(user=Depends(require_merchant), conn=Depends(get_db)):
    return service.poster(conn, user, settings.CORS_ORIGINS[0])


@router.get('/prices')
def prices(user=Depends(require_merchant), conn=Depends(get_db)):
    return service.prices(conn, user)


@router.post('/prices/confirm')
def confirm_price(data: PriceConfirm, user=Depends(require_merchant), conn=Depends(get_db)):
    return service.confirm_price(conn, user, data)


@router.put('/store/location')
def location(data: StoreLocation, user=Depends(require_merchant), conn=Depends(get_db)):
    return service.save_location(conn, user, data)


@router.get('/stats')
def stats(days: int = Query(7, ge=1, le=28), user=Depends(require_merchant), conn=Depends(get_db)):
    from app.services import stats_service

    return stats_service.merchant(conn, user, days)
