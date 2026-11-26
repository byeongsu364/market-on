"""Public store reviews and customer writes."""

from fastapi import APIRouter, Depends, Query
from app.deps import get_db, optional_user, require_customer, require_csrf
from app.schemas.review import ReviewWrite
from app.services import review_service

router = APIRouter(prefix='/stores', tags=['stores'])


@router.get('/{store_id}/reviews')
def reviews(
    store_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(optional_user),
    conn=Depends(get_db),
):
    return review_service.listing(conn, store_id, user, limit, offset)


@router.put('/{store_id}/reviews/me', dependencies=[Depends(require_csrf)])
def save_review(
    store_id: str, data: ReviewWrite, user=Depends(require_customer), conn=Depends(get_db)
):
    return review_service.save(conn, store_id, user, data)


@router.delete('/{store_id}/reviews/me', status_code=204, dependencies=[Depends(require_csrf)])
def delete_review(store_id: str, user=Depends(require_customer), conn=Depends(get_db)):
    review_service.delete(conn, store_id, user)
