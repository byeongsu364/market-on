"""Fill only missing embeddings; batches commit atomically."""
from app.db.repositories import knowledge_repo as repo

def embed_pending(conn, embedder, batch=100) -> int:
    if batch <= 0:
        raise ValueError('batch must be positive')
    total = 0
    while True:
        with conn.transaction():
            rows = repo.pending_chunks(conn, batch)
            if not rows:
                return total
            vectors = embedder.embed([r[1] for r in rows], task='document')
            repo.update_embeddings(conn, [r[0] for r in rows], vectors)
            total += len(rows)
