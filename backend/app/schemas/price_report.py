"""Guest price report contracts."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class PriceReportRequest(BaseModel):
    item_id: str
    market_id: str
    store_id: str | None = None
    unit: str | None = None
    quantity: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    price: int = Field(ge=10, le=10_000_000, strict=True)
    method: Literal['price_tag_photo', 'manual']
    media_id: UUID | None = None

    @model_validator(mode='after')
    def require_photo(self):
        if self.method == 'price_tag_photo' and self.media_id is None:
            raise ValueError('photo media is required')
        return self


class PriceReportResponse(BaseModel):
    id: int
    updated: bool
    held: bool = False
