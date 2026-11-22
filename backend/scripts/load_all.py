"""Load sources → ontology → documents → optional embeddings."""
import argparse
from collections import Counter
from app.db.pool import connection
from .load_sources import load_sources
from .load_ontology import load_ontology
from .load_documents import load_documents
from .build_embeddings import build_embeddings
from ._common import DATA, summary, run

def load_all(conn, *, data_dir=DATA, embed=True, embedder=None, prune=False):
    counts = Counter()
    with conn.transaction():
        counts.update(load_sources(conn, data_dir / 'sources.yaml'))
        counts.update(load_ontology(conn, data_dir / 'ontology'))
        counts.update(load_documents(conn, data_dir / 'rag_docs', prune=prune))
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
