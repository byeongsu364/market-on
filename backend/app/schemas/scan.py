"""Frontend RecognizeResponse contract."""

from pydantic import BaseModel


class RecognizeCandidate(BaseModel):
    item_id: str
    name: str
    confidence: float


class RecognizeResponse(BaseModel):
    vision_labels: list[str]
    candidates: list[RecognizeCandidate]
