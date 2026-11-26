"""Frontend RecognizeResponse contract."""

from pydantic import BaseModel


class RecognizeCandidate(BaseModel):
    item_id: str
    name: str
    confidence: float


class PriceTag(BaseModel):
    variety_id: str | None = None
    price: float
    unit_text: str
    unit: str | None
    quantity: float | None


class RecognizeResponse(BaseModel):
    model: str
    vision_labels: list[str]
    candidates: list[RecognizeCandidate]
    media_id: str | None
    price_tag: PriceTag | None
