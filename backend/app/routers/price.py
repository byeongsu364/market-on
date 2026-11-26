"""시세 요청을 서비스로 전달한다."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.deps import get_db
from app.schemas.price import PriceResponse
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
