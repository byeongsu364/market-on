"""Approved merchant endpoints."""

from fastapi import APIRouter, Depends
from app.deps import get_db, require_merchant, require_csrf
from app.core.config import settings
from app.schemas.merchant import (
    StoreLocation,
    StorePatch,
    SaleCreate,
    Repost,
    SaleStatus,
    PriceConfirm,
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
def create(data: SaleCreate, user=Depends(require_merchant), conn=Depends(get_db)):
    return service.create_sale(conn, user, data.model_dump())


@router.post('/sales/{sale_id}/repost', status_code=201)
def repost(sale_id: int, data: Repost, user=Depends(require_merchant), conn=Depends(get_db)):
    return service.repost(conn, user, sale_id, data.ends_at)


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
