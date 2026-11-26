"""Review write contract."""

from pydantic import BaseModel, Field, field_validator


class ReviewWrite(BaseModel):
    rating: int = Field(ge=1, le=5, strict=True)
    body: str = Field(min_length=1, max_length=200)

    @field_validator('body')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('리뷰를 입력하세요.')
        return value
