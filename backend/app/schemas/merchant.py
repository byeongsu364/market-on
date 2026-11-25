"""Validated merchant/auth request contracts. Extra store_id fields are ignored."""

from typing import Literal
from pydantic import BaseModel, Field, SecretStr, AwareDatetime


class Credentials(BaseModel):
    login_id: str = Field(max_length=200)
    password: SecretStr


class Signup(Credentials):
    store_id: str = Field(max_length=100)


class Hours(BaseModel):
    open: str = Field(pattern=r'^([01]\d|2[0-3]):[0-5]\d$')
    close: str = Field(pattern=r'^([01]\d|2[0-3]):[0-5]\d$')


class StorePatch(BaseModel):
    hours: Hours | None = None
    item_ids: list[str] | None = None


class SaleCreate(BaseModel):
    item_id: str
    sale_price: int = Field(gt=0, le=2147483647, strict=True)
    regular_price: int | None = Field(default=None, gt=0, le=2147483647, strict=True)
    unit_id: str | None = None
    note: str | None = Field(default=None, max_length=40)
    ends_at: AwareDatetime


class Repost(BaseModel):
    ends_at: AwareDatetime


MerchantStatus = Literal['pending', 'approved', 'rejected', 'disabled']
SaleStatus = Literal['active', 'ended']


class PriceConfirm(BaseModel):
    item_id: str
    unit: str | None = None
    price: int = Field(ge=10, le=10000000, strict=True)
