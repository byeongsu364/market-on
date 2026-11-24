"""Anonymous consumer endpoints; view recording only requires the CSRF header."""

from fastapi import APIRouter, Depends
from app.deps import get_db, require_csrf
from app.services import sale_service as service

router = APIRouter(tags=['sales'], dependencies=[Depends(require_csrf)])


@router.get('/sales/active')
def active(market_id: str | None = None, item_id: str | None = None, conn=Depends(get_db)):
    return service.active(conn, market_id, item_id)


@router.post('/sales/{sale_id}/view', status_code=204)
def view(sale_id: int, conn=Depends(get_db)):
    service.record_view(conn, sale_id)


@router.get('/stores/{store_id}')
def store(store_id: str, conn=Depends(get_db)):
    return service.store_page(conn, store_id)
