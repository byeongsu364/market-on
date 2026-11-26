"""Operator merchant approval endpoints."""

from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends
from app.deps import get_db, require_operator, require_csrf
from app.schemas.merchant import MerchantStatus
from app.services import admin_service as service, market_request_service

router = APIRouter(prefix='/admin', tags=['admin'], dependencies=[Depends(require_csrf)])


@router.get('/merchants')
def merchants(
    status: MerchantStatus = 'pending', operator=Depends(require_operator), conn=Depends(get_db)
):
    return service.merchants(conn, status)


@router.post('/merchants/{user_id}/approve')
def approve(user_id: UUID, operator=Depends(require_operator), conn=Depends(get_db)):
    return {'user': service.set_status(conn, operator, user_id, 'approved')}


@router.post('/merchants/{user_id}/reject')
def reject(user_id: UUID, operator=Depends(require_operator), conn=Depends(get_db)):
    return {'user': service.set_status(conn, operator, user_id, 'rejected')}


@router.post('/merchants/{user_id}/disable')
def disable(user_id: UUID, operator=Depends(require_operator), conn=Depends(get_db)):
    return {'user': service.set_status(conn, operator, user_id, 'disabled')}


@router.get('/market-admins')
def market_admins(operator=Depends(require_operator), conn=Depends(get_db)):
    return service.market_admins(conn)


@router.post('/market-admins/{user_id}/disable')
def disable_market_admin(user_id: UUID, operator=Depends(require_operator), conn=Depends(get_db)):
    return {'user': service.disable_market_admin(conn, operator, user_id)}


@router.get('/applications')
def applications(
    status: Literal['pending', 'approved', 'rejected'] = 'pending',
    operator=Depends(require_operator),
    conn=Depends(get_db),
):
    return market_request_service.applications(conn, status)


@router.post('/applications/{application_id}/approve')
def approve_application(
    application_id: int, operator=Depends(require_operator), conn=Depends(get_db)
):
    return market_request_service.review(conn, operator, application_id, 'approved')


@router.post('/applications/{application_id}/reject')
def reject_application(
    application_id: int, operator=Depends(require_operator), conn=Depends(get_db)
):
    return market_request_service.review(conn, operator, application_id, 'rejected')


@router.get('/markets')
def markets(
    status: Literal['listed', 'active'], operator=Depends(require_operator), conn=Depends(get_db)
):
    from app.services import stats_service

    return stats_service.markets(conn, status)
