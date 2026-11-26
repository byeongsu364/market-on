"""Public market and map contracts."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


class Market(BaseModel):
    market_id: str
    name: str
    status: Literal['listed', 'active'] = 'active'
    lat: float
    lng: float
    distance_m: int | None = None
    address: str | None = None
    store_count: int = 0
    requests: int = 0
    amenities: dict[str, bool] | None = None


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
    source: Literal['customers', 'merchant', 'market_avg']
    observed_on: date | None = None
    reporters: int
    latest_at: datetime
    stale: bool
    merchant_confirmed: bool


class Store(BaseModel):
    favorite: bool | None = None
    varieties: list[str] = []
    lat: float | None = None
    lng: float | None = None
    category: str | None = None
    naver_name: str = ''
    verified: bool = False
    # 핀 좌표의 출처(2026-11-27): merchant=상인 확인, naver=네이버 지도 장소, kakao=카카오맵 장소 검색, None=좌표 없음
    location_source: Literal['merchant', 'naver', 'kakao'] | None = None
    open_now: bool | None = None
    payments: list[str] = []
    intro: str | None = None
    distance_m: int | None = None
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
    pending_reporters: int = 0


class MarketMap(BaseModel):
    layout: Literal['schematic', 'surveyed'] = 'schematic'
    source_note: str = ''
    market_id: str
    zones: list[Zone]
    stores: list[Store]


class MarketItem(BaseModel):
    item_id: str
    name: str
    store_count: int


class PublicConfig(BaseModel):
    naver_map_client_id: str | None
