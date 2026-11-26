"""Code-computed shopping composition contract."""

from typing import Literal

from pydantic import BaseModel, Field

from .ask import CandidateStore, Citation


class RecommendRequest(BaseModel):
    lang: Literal['ko', 'en', 'zh', 'ja', 'vi'] = 'ko'
    purpose: Literal['집밥', '선물', '모임']
    relation: Literal['가족', '친구', '나'] | None = None
    event: str | None = Field(default=None, max_length=200)
    budget: int = Field(ge=5000, le=500000, strict=True)
    headcount: int = Field(ge=1, le=20, strict=True)
    market_id: str


class RecommendItem(BaseModel):
    lang: Literal['ko', 'en', 'zh', 'ja', 'vi'] = 'ko'
    translated: bool = False
    original: str | None = None
    item_id: str
    name: str
    quantity: int
    unit: str
    unit_label: str
    unit_price: int | None
    subtotal: int | None
    reason: str
    stores: list[CandidateStore]
    sources: list[Citation] = Field(default_factory=list)


class RecommendResponse(BaseModel):
    items: list[RecommendItem]
    total: int
    budget: int
    left: int
    note: str
    model: str | None = None
