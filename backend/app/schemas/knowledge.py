"""Shared ingestion and retrieval value types."""

from dataclasses import dataclass, field
from typing import Literal
from datetime import date


@dataclass
class Document:
    doc_key: str
    source_key: str
    doc_type: str
    lang: str
    title: str
    body: str
    store_id: str | None = None
    market_id: str | None = None
    published: date | None = None
    entities: list[str] = field(default_factory=list)
    entity_names: list[str] = field(default_factory=list)
    review_status: Literal['draft', 'reviewed', 'rejected'] = 'draft'
    varieties: list[str] = field(default_factory=list)


@dataclass
class Chunk:
    chunk_index: int
    content: str
    entity_ids: set[str] = field(default_factory=set)
    variety_id: str | None = None
    numbers: list[str] = field(default_factory=list)


@dataclass
class UpsertResult:
    status: Literal['added', 'changed', 'skipped']
    document_id: int
    chunks: int = 0


@dataclass
class RetrievedChunk:
    chunk_id: int
    content: str
    similarity: float
    doc_type: str
    document_title: str
    store_id: str | None
    source_title: str
    source_url: str | None
    license: str | None
    quote_only: bool = False
    published: date | None = None
    market_id: str | None = None
