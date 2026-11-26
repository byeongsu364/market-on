"""Read Markdown frontmatter and ingest by relative file identity."""

import argparse
from collections import Counter

import yaml

from app.db.pool import connection
from app.db.repositories import knowledge_repo as repo
from app.knowledge.ingest import upsert_document
from app.schemas.knowledge import Document

from ._common import DATA, run, summary


def read_document(path, directory):
    text = path.read_text()
    if not text.startswith('---\n'):
        raise ValueError(f'{path}: YAML frontmatter가 필요합니다.')
    parts = text.split('---\n', 2)
    if len(parts) != 3:
        raise ValueError(f'{path}: 닫는 frontmatter 구분자가 필요합니다.')
    meta = yaml.safe_load(parts[1])
    return Document(
        doc_key=path.relative_to(directory).as_posix(),
        source_key=meta['source'],
        doc_type=meta['doc_type'],
        lang=meta['lang'],
        title=meta['title'],
        body=parts[2].strip(),
        store_id=meta.get('store_id'),
        entities=meta.get('entities', []),
        market_id=meta.get('market_id'),
        published=meta.get('published'),
        review_status=meta.get('review_status', 'draft'),
        varieties=meta.get('varieties', []),
        main_item=meta.get('main_item'),
        main_items=meta.get('main_items', []),
        dish_type=meta.get('dish_type', ''),
        cook_method=meta.get('cook_method', ''),
    )


def load_documents(conn, directory=DATA / 'rag_docs', *, prune=False, documents=None):
    counts = Counter()
    docs = (
        documents
        if documents is not None
        else [read_document(path, directory) for path in sorted(directory.rglob('*.md'))]
    )
    with conn.transaction():
        for doc in docs:
            counts[upsert_document(conn, doc).status] += 1
        if prune:
            counts['deleted'] = repo.prune_documents(conn, [doc.doc_key for doc in docs])
    summary('documents', counts)
    return counts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--prune', action='store_true')
    args = parser.parse_args()
    with connection() as conn:
        load_documents(conn, prune=args.prune)


if __name__ == '__main__':
    run(main)
