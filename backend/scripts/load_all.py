"""Load sources → ontology → documents → optional embeddings."""

import argparse
from collections import Counter

import yaml

from app.db.pool import connection
from app.db.repositories import knowledge_repo as repo

from ._common import DATA, run, summary
from .build_embeddings import build_embeddings
from .load_documents import load_documents
from .load_ontology import load_ontology, ontology_ids
from .load_sources import load_sources


def load_all(conn, *, data_dir=DATA, embed=True, embedder=None, prune=False, documents=None):
    counts = Counter()
    with conn.transaction():
        counts.update(load_sources(conn, data_dir / 'sources.yaml'))
        counts.update(load_ontology(conn, data_dir / 'ontology', cleanup=not prune))
        counts.update(load_documents(conn, data_dir / 'rag_docs', prune=prune, documents=documents))
        if prune:
            counts['deleted'] += repo.prune_entities(conn, ontology_ids(data_dir / 'ontology'))
            counts['deleted'] += repo.prune_sources(
                conn, yaml.safe_load((data_dir / 'sources.yaml').read_text())
            )
        if embed:
            counts['changed'] += build_embeddings(conn, embedder)
    summary('total', counts)
    return counts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--embed', action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument('--prune', action='store_true')
    args = parser.parse_args()
    with connection() as conn:
        load_all(conn, embed=args.embed, prune=args.prune)


if __name__ == '__main__':
    run(main)
