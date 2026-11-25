"""Frontend RecognizeResponse contract."""

from pydantic import BaseModel


class RecognizeCandidate(BaseModel):
    item_id: str
    name: str
    confidence: float


class PriceTag(BaseModel):
    price: float
    unit_text: str
    unit: str | None
    quantity: float | None


class RecognizeResponse(BaseModel):
    vision_labels: list[str]
    candidates: list[RecognizeCandidate]
    media_id: str | None
    price_tag: PriceTag | None
