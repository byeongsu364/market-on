"""Build only absent document embeddings."""

from collections import Counter
from app.db.pool import connection
from app.llm.factory import get_embedder
from app.knowledge.embedder import embed_pending
from ._common import summary, run


def build_embeddings(conn, embedder=None):
    count = embed_pending(conn, embedder or get_embedder())
    summary('embeddings', Counter(changed=count))
    return count


def main():
    with connection() as conn:
        build_embeddings(conn)


if __name__ == '__main__':
    run(main)
