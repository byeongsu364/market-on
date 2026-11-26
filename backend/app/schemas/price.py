"""시세 조회 응답 계약."""

from datetime import date
from typing import Literal

from pydantic import BaseModel


class PriceStat(BaseModel):
    price: int
    count: int


class MarketPrice(BaseModel):
    price: int
    name: str


class VarietyPrice(BaseModel):
    variety_id: str
    name: str
    reference_price: int | None
    unit: str
    observed_on: date | None
    count: int
    default: bool


class PriceResponse(BaseModel):
    variety_id: str | None = None
    variety_name: str | None = None
    varieties: list[VarietyPrice] = []
    item_id: str
    unit: str
    reference_price: int
    seen_price: float | None = None
    diff_pct: int | None
    region: str
    observed_on: date
    fallback: Literal['region_avg', 'national_avg', 'last_valid'] | None
    source: str
    by_market_type: dict[Literal['traditional', 'large_retail'], PriceStat]
    this_market: MarketPrice | None = None
