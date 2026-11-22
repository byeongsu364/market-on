"""FastAPI 의존성 공급. 허용 의존성: db 및 llm."""
from __future__ import annotations

from collections.abc import Iterator
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from psycopg import Connection
from app.db import pool
from app.llm.base import LLMProvider
from app.llm.factory import get_llm


def get_db() -> Iterator[Connection]:
    with pool.connection() as conn:
        yield conn


def get_llm_dep() -> LLMProvider:
    return get_llm()
