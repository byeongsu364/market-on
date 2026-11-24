"""Operator merchant approval endpoints."""

from uuid import UUID
from fastapi import APIRouter, Depends
from app.deps import get_db, require_operator, require_csrf
from app.schemas.merchant import MerchantStatus
from app.services import admin_service as service

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
