"""Public market onboarding contracts."""

from typing import Literal
from pydantic import Field
from app.schemas.merchant import Credentials


class Join(Credentials):
    market_id: str = Field(max_length=200)
    manager_org: Literal['상인회', '관리사무소', '기타']
    contact: str = Field(min_length=1, max_length=80, pattern=r'\S')
    store_count: int | None = Field(default=None, ge=0, le=2147483647, strict=True)
    note: str | None = Field(default=None, max_length=200)
