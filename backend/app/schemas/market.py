"""Public market and map contracts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class Market(BaseModel):
    market_id: str
    name: str
    status: Literal['listed', 'active'] = 'active'
    lat: float
    lng: float
    distance_m: int | None = None


class Zone(BaseModel):
    id: str
    name: str
    x: float
    y: float


class ActiveSale(BaseModel):
    sale_price: int
    regular_price: int | None
    ends_at: datetime


class StorePrice(BaseModel):
    price: int
    unit: str
    source: Literal['customers', 'merchant']
    reporters: int
    latest_at: datetime
    stale: bool
    merchant_confirmed: bool


class Store(BaseModel):
    items_basis: Literal['merchant', 'sbiz_guess', 'mixed'] = 'merchant'
    source: Literal['manual', 'sbiz'] = 'manual'
    guessed_item_ids: list[str] = []
    store_id: str
    name: str
    zone_id: str
    sells: list[str]
    map_x: float
    map_y: float
    hours: str
    highlight: bool
    active_sale: ActiveSale | None
    price: StorePrice | None = None


class MarketMap(BaseModel):
    layout: Literal['schematic', 'surveyed'] = 'schematic'
    source_note: str = ''
    market_id: str
    zones: list[Zone]
    stores: list[Store]
