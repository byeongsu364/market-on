"""Entity-filtered vector retrieval with source provenance."""

from app.db.repositories import knowledge_repo as repo
from app.schemas.knowledge import RetrievedChunk

from .intents import doc_types_for_intent
from .ontology import match_variety, resolve_entities


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
        resolved = resolve_entities(conn, query)
        parents = repo.variety_items(conn, resolved) if resolved else []
        entity_ids = sorted(set(resolved + parents)) or None
    varieties = {v for eid in (entity_ids or []) if (v := match_variety(conn, eid, query))}
    variety_id = next(iter(varieties)) if len(varieties) == 1 else None
    vector = embedder.embed([query], task='query')[0]
    return [
        RetrievedChunk(*row)
        for row in repo.match_chunks(
            conn, vector, entity_ids, doc_types, lang, k, min_similarity, variety_id
        )
    ]
