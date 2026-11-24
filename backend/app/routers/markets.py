"""Public market reads."""

from fastapi import APIRouter, Depends

from app.deps import get_db
from app.schemas.market import Market, MarketMap
from app.services import market_service

router = APIRouter(prefix='/markets', tags=['markets'])


@router.get('/nearby', response_model=list[Market])
def nearby(lat: float | None = None, lng: float | None = None, conn=Depends(get_db)):
    return market_service.nearby(conn, lat, lng)


@router.get('/{market_id}/map', response_model=MarketMap)
def market_map(
    market_id: str, item_id: str | None = None, unit: str | None = None, conn=Depends(get_db)
):
    return market_service.market_map(conn, market_id, item_id, unit)
