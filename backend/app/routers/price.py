"""시세 요청을 서비스로 전달한다."""

from datetime import date
from fastapi import APIRouter, Depends, Query
from app.deps import get_db
from app.schemas.price import PriceView
from app.services import price_service

router = APIRouter(prefix='/price', tags=['price'])


@router.get('/{item_id}', response_model=PriceView)
def get_price(
    item_id: str,
    market_id: str | None = None,
    unit_id: str | None = None,
    seen_price: float | None = Query(default=None, ge=0),
    on_date: date | None = None,
    conn=Depends(get_db),
):
    view = price_service.get_price(
        conn, item_id, market_id=market_id, unit_id=unit_id, on_date=on_date
    )
    if seen_price is not None:
        view.comparison = view.compare(seen_price)
    return view
