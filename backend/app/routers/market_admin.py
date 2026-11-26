"""Approved market manager endpoints."""

from uuid import UUID
from fastapi import APIRouter, Depends
from app.deps import get_db, require_market_admin, require_csrf
from app.core.config import settings
from app.schemas.merchant import MerchantStatus
from app.services import market_admin_service as service, admin_service

router = APIRouter(
    prefix='/market-admin', tags=['market-admin'], dependencies=[Depends(require_csrf)]
)


@router.get('/market')
def market(user=Depends(require_market_admin), conn=Depends(get_db)):
    return service.market(conn, user)


@router.get('/merchants')
def merchants(
    status: MerchantStatus = 'pending', user=Depends(require_market_admin), conn=Depends(get_db)
):
    return service.merchants(conn, user, status)


@router.get('/poster')
def poster(user=Depends(require_market_admin), conn=Depends(get_db)):
    return service.poster(conn, user, settings.CORS_ORIGINS[0])


@router.post('/merchants/{user_id}/approve')
def approve(user_id: UUID, user=Depends(require_market_admin), conn=Depends(get_db)):
    return {'user': admin_service.set_status(conn, user, user_id, 'approved')}


@router.post('/merchants/{user_id}/reject')
def reject(user_id: UUID, user=Depends(require_market_admin), conn=Depends(get_db)):
    return {'user': admin_service.set_status(conn, user, user_id, 'rejected')}


@router.post('/merchants/{user_id}/disable')
def disable(user_id: UUID, user=Depends(require_market_admin), conn=Depends(get_db)):
    return {'user': admin_service.set_status(conn, user, user_id, 'disabled')}


@router.get('/stats')
def stats(user=Depends(require_market_admin), conn=Depends(get_db)):
    from app.services import stats_service

    return stats_service.market(conn, user)
