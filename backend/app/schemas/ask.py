"""Evidence-backed question contract."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_serializer, model_validator

from app.schemas.price import PriceResponse

AskIntent = Literal['select', 'store', 'prep', 'season', 'price', 'where']


class AskRequest(BaseModel):
    question: str | None = Field(default=None, max_length=200)
    intent: AskIntent | None = None
    item_id: str | None = None
    market_id: str | None = None
    lang: Literal['ko'] = 'ko'

    @model_validator(mode='after')
    def require_question(self):
        if self.question is not None:
            self.question = self.question.strip() or None
        if self.question is None and self.intent is None:
            raise ValueError('question 또는 intent가 필요합니다.')
        return self


class Citation(BaseModel):
    title: str
    publisher: str | None
    url: str | None
    license: str | None


class Candidate(BaseModel):
    item_id: str
    name: str


class AskResponse(BaseModel):
    model_config = ConfigDict(validate_assignment=True)
    kind: Literal['answer', 'no_evidence', 'need_item', 'price', 'where', 'out_of_scope']
    intent: AskIntent | None = None
    item_id: str | None = None
    item_name: str | None = None
    answer: str | None = None
    citations: list[Citation] = Field(default_factory=list)
    candidates: list[Candidate] | None = None
    price: PriceResponse | None = None
    stores: list[CandidateStore] | None = None
    model: str | None = None
    cached: bool = False
    removed: int = 0

    @model_serializer(mode='wrap')
    def serialize(self, handler):
        result = handler(self)
        return {
            k: v
            for k, v in result.items()
            if k not in ('candidates', 'price', 'stores') or v is not None
        }


class CandidateStore(BaseModel):
    store_id: str
    name: str


AskResponse.model_rebuild()
