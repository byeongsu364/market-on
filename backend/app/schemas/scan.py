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


class PhotoLocation(BaseModel):
    """촬영 위치를 줄인 값 (손님이 동의했을 때만). 정확한 좌표는 담지 않아요."""

    market_id: str | None
    lat: float
    lng: float


class RecognizeResponse(BaseModel):
    model: str
    vision_labels: list[str]
    candidates: list[RecognizeCandidate]
    media_id: str | None
    price_tag: PriceTag | None
    photo_location: PhotoLocation | None = None
