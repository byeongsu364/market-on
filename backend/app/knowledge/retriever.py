"""Entity-filtered vector retrieval with source provenance."""

from app.db.repositories import knowledge_repo as repo
from app.schemas.knowledge import RetrievedChunk
from .ontology import resolve_entities
from .intents import doc_types_for_intent


def search(
    conn,
    embedder,
    query,
    *,
    entity_ids=None,
    doc_types=None,
    intent=None,
    lang=None,
    k=5,
    min_similarity=0.0,
) -> list[RetrievedChunk]:
    if k < 1:
        raise ValueError('k must be positive')
    if intent is not None:
        allowed = doc_types_for_intent(intent)
        doc_types = allowed if doc_types is None else [t for t in doc_types if t in allowed]
    if entity_ids is None:
        entity_ids = resolve_entities(conn, query) or None
    vector = embedder.embed([query], task='query')[0]
    return [
        RetrievedChunk(*row)
        for row in repo.match_chunks(conn, vector, entity_ids, doc_types, lang, k, min_similarity)
    ]
