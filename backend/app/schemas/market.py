"""Public market and map contracts."""

from datetime import datetime

from pydantic import BaseModel


class Market(BaseModel):
    market_id: str
    name: str
    lat: float
    lng: float


class Zone(BaseModel):
    id: str
    name: str
    x: float
    y: float


class ActiveSale(BaseModel):
    sale_price: int
    regular_price: int | None
    ends_at: datetime


class Store(BaseModel):
    store_id: str
    name: str
    zone_id: str
    sells: list[str]
    map_x: float
    map_y: float
    hours: str
    highlight: bool
    active_sale: ActiveSale | None


class MarketMap(BaseModel):
    market_id: str
    zones: list[Zone]
    stores: list[Store]
