"""시세 요청을 서비스로 전달한다."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.deps import get_db
from app.schemas.price import PriceResponse, PriceHistory
from app.services import price_service

router = APIRouter(prefix='/price', tags=['price'])


@router.get('', response_model=PriceResponse, response_model_exclude_unset=True)
def get_price(
    conn: Annotated[object, Depends(get_db)],
    item_id: str,
    market_id: str,
    unit: str,
    variety_id: str | None = None,
    seen_price: float | None = Query(default=None, gt=0, allow_inf_nan=False),
):
    return price_service.get_price(
        conn,
        item_id,
        market_id=market_id,
        unit_id=unit,
        seen_price=seen_price,
        variety_id=variety_id,
    )


@router.get('/history', response_model=PriceHistory)
def history(
    item_id: str,
    variety_id: str | None = None,
    market_id: str | None = None,
    weeks: int = Query(default=4, ge=1, le=8),
    unit: str | None = None,
    conn=Depends(get_db),
):
    return price_service.get_history(
        conn, item_id, variety_id=variety_id, market_id=market_id, weeks=weeks, unit_id=unit
    )


plural_router = APIRouter(prefix='/prices', tags=['price'])
plural_router.add_api_route(
    '', get_price, methods=['GET'], response_model=PriceResponse, response_model_exclude_unset=True
)
plural_router.add_api_route('/history', history, methods=['GET'], response_model=PriceHistory)
