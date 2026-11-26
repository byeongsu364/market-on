"""Stateless chat contract."""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

from .ask import Candidate, Citation


class ChatMessage(BaseModel):
    role: Literal['user', 'assistant']
    content: str = Field(min_length=1, max_length=500)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=10)
    market_id: str
    item_id: str | None = None

    @model_validator(mode='after')
    def last_user(self):
        if self.messages[-1].role != 'user':
            raise ValueError('마지막 메시지는 user여야 합니다.')
        return self


class ToolLabel(BaseModel):
    name: str
    label: str


class ChatResponse(BaseModel):
    reply: str
    citations: list[Citation] = Field(default_factory=list)
    tools: list[ToolLabel] = Field(default_factory=list)
    items: list[Candidate] = Field(default_factory=list)
    model: str | None = None
    removed: int = 0
