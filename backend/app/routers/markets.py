"""Public market reads."""

from fastapi import APIRouter, Depends, Header
from uuid import UUID
from app.deps import require_csrf
from app.services import market_request_service as requests

from app.deps import get_db
from app.schemas.market import Market, MarketMap
from app.services import market_service

router = APIRouter(prefix='/markets', tags=['markets'])


@router.get('/nearby', response_model=list[Market])
def nearby(
    lat: float | None = None,
    lng: float | None = None,
    x_device_id: UUID | None = Header(default=None),
    conn=Depends(get_db),
):
    return market_service.nearby(conn, lat, lng, x_device_id)


@router.get('/search', response_model=list[Market])
def search(q: str = '', conn=Depends(get_db)):
    return market_service.search(conn, q)


@router.get('/{market_id}/demand')
def demand(market_id: str, conn=Depends(get_db)):
    return requests.demand(conn, market_id)


@router.post('/{market_id}/requests', status_code=201, dependencies=[Depends(require_csrf)])
def request_market(market_id: str, x_device_id: UUID = Header(), conn=Depends(get_db)):
    return requests.request(conn, market_id, x_device_id)


@router.get('/{market_id}/map', response_model=MarketMap)
def market_map(
    market_id: str, item_id: str | None = None, unit: str | None = None, conn=Depends(get_db)
):
    return market_service.market_map(conn, market_id, item_id, unit)
