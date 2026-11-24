"""Shared atomic document ingestion for CLI and future merchant APIs."""

from dataclasses import replace
import hashlib
import json
import re
from app.db.repositories import knowledge_repo as repo
from app.schemas.knowledge import Chunk, Document, UpsertResult
from .ontology import normalize, load_label_dictionary

TOPICS = {
    'criterion': '확인 포인트',
    'season': '출하 시기',
    'storage': '저장 조건',
    'recipe': '레시피',
    'merchant_tip': '상인 노하우',
    'prep': '손질법',
    'grade': '품질 등급',
    'story': '시장 이야기',
    'origin': '원산지',
    'safety': '안전 주의',
    'context': '구매 맥락',
    'specialty': '지역 특산물',
    'guide': '이용 안내',
}
WHOLE = {'criterion', 'season', 'storage', 'prep', 'merchant_tip'}


def tag_entities(text, dictionary) -> set[str]:
    text = normalize(text)
    occupied = set()
    found = set()
    for label, eid, original in sorted(dictionary, key=lambda row: (-len(row[0]), row[1], row[2])):
        if not label:
            continue
        for match in re.finditer(re.escape(label), text):
            start, end = match.span()
            if len(label) == 1 and start and re.match('[가-힣]', text[start - 1]):
                continue
            span = set(range(start, end))
            if not occupied.intersection(span):
                occupied.update(span)
                found.add(eid)
    return found


def _windows(text):
    start = 0
    while start < len(text):
        end = min(start + 500, len(text))
        if end < len(text):
            boundaries = list(re.finditer(r'[.!?。]\s*|\n', text[start + 350 : end]))
            if boundaries:
                end = start + 350 + boundaries[-1].end()
        yield text[start:end]
        if end == len(text):
            break
        start = end - 50


def chunk_document(doc: Document) -> list[Chunk]:
    topic = TOPICS[doc.doc_type]
    names = ', '.join(doc.entity_names)
    prefix = f'[{names + " · " if names else ""}{topic}] '
    if doc.doc_type in WHOLE or len(doc.body) <= 600:
        pieces = [doc.body]
    else:
        sections = re.split(r'(?m)(?=^##\s+)', doc.body)
        pieces = [
            piece
            for section in sections
            if section.strip()
            for piece in (_windows(section) if len(section) > 600 else [section])
        ]
    return [Chunk(i, prefix + piece, set(doc.entities)) for i, piece in enumerate(pieces)]


def _hash(*values):
    return hashlib.sha256(
        json.dumps(values, ensure_ascii=False, separators=(',', ':')).encode()
    ).hexdigest()


def upsert_document(conn, doc: Document, *, embedder=None) -> UpsertResult:
    digest = _hash(
        doc.source_key,
        doc.doc_type,
        doc.lang,
        doc.title,
        doc.store_id,
        doc.body,
        doc.market_id,
        str(doc.published) if doc.published else None,
    )
    with conn.transaction():
        # Serialize writers for the same stable key, including first insertion.
        repo.lock_document(conn, doc.doc_key)
        old = repo.find_document(conn, doc.doc_key)
        if old and old[1] == digest:
            return UpsertResult('skipped', old[0])
        affected = repo.document_entities(conn, old[0]) if old else set()
        names = repo.entity_names(conn, doc.entities)
        chunks = chunk_document(replace(doc, entity_names=names))
        dictionary = load_label_dictionary(conn)
        if old:
            repo.delete_document(conn, old[0])
        did = repo.insert_document(conn, doc, digest)
        ids = []
        for chunk in chunks:
            chunk.entity_ids |= tag_entities(chunk.content, dictionary)
            affected |= chunk.entity_ids
            ids.append(
                repo.insert_chunk(
                    conn, did, doc, chunk, _hash(doc.doc_key, chunk.chunk_index, chunk.content)
                )
            )
        if embedder and chunks:
            repo.update_embeddings(
                conn, ids, embedder.embed([c.content for c in chunks], task='document')
            )
        for eid in sorted(affected):
            repo.invalidate_cache_for_entity(conn, eid)
        return UpsertResult('changed' if old else 'added', did, len(chunks))
