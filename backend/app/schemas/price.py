"""시세 조회 응답 계약."""

from datetime import date
from typing import Literal
from pydantic import BaseModel


class PriceStats(BaseModel):
    avg: float
    min: float
    max: float
    n: int


class MarketPrice(BaseModel):
    price: float
    mrkt_nm: str


class PriceView(BaseModel):
    item_id: str
    exmn_ymd: date
    scope: Literal['region', 'national']
    unit: str | None
    unit_sz: str | None
    unit_id: str | None = None
    converted: bool = False
    traditional: PriceStats | None = None
    large_retail: PriceStats | None = None
    all: PriceStats | None = None
    this_market: MarketPrice | None = None
    source: str
    comparison: float | None = None

    def compare(self, seen_price: float, quantity: float = 1) -> float | None:
        if seen_price < 0 or quantity <= 0:
            raise ValueError('가격은 0 이상, 수량은 양수여야 합니다.')
        reference = self.traditional or self.all
        return (
            (seen_price / quantity / reference.avg - 1) * 100
            if reference and reference.avg > 0
            else None
        )
