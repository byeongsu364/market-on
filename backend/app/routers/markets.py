# FastAPI dependencies and pytest fixture imports are intentional.
# ruff: noqa: B008
"""Public market reads."""

from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query

from app.core.language import preferred_language, present
from app.deps import get_db, optional_user, require_csrf
from app.schemas.market import Market, MarketItem, MarketMap
from app.services import market_request_service as requests
from app.services import market_service

router = APIRouter(prefix='/markets', tags=['markets'])


@router.get('/nearby', response_model=list[Market])
def nearby(
    lat: float | None = None,
    lng: float | None = None,
    radius_km: float = Query(default=10, gt=0, le=30),
    x_device_id: UUID | None = Header(default=None),
    conn=Depends(get_db),
):
    return market_service.nearby(conn, lat, lng, x_device_id, radius_km)


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
    market_id: str,
    item_id: str | None = None,
    unit: str | None = None,
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
    lang=Depends(preferred_language),
    user=Depends(optional_user),
    conn=Depends(get_db),
):
    from app.services.notification_service import favorites

    result = market_service.market_map(conn, market_id, item_id, unit, lat, lng)
    if user and user['role'] == 'customer':
        saved = {f['store_id'] for f in favorites(conn, user['id'])}
        for store in result.stores:
            store.favorite = store.store_id in saved
    return present(conn, result, lang)


@router.get('/{market_id}/items', response_model=list[MarketItem])
def market_items(market_id: str, conn=Depends(get_db), lang=Depends(preferred_language)):
    return present(conn, market_service.market_items(conn, market_id), lang)


@router.get('/{market_id}', response_model=Market)
def detail(market_id: str, conn=Depends(get_db)):
    return market_service.market_detail(conn, market_id)
