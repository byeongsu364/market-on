"""Public market application transport."""

from fastapi import APIRouter, Depends
from app.deps import get_db, require_csrf
from app.schemas.market_request import Join
from app.services import market_request_service as service

router = APIRouter(tags=['join'])


@router.post('/join', status_code=201, dependencies=[Depends(require_csrf)])
def join(data: Join, conn=Depends(get_db)):
    return service.join(conn, data)
