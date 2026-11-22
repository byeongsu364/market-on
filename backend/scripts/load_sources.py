"""Load the authoritative source registry."""
from collections import Counter
import yaml
from app.db.pool import connection
from app.db.repositories import knowledge_repo as repo
from ._common import DATA, summary, run

def load_sources(conn, path=DATA / 'sources.yaml'):
    sources = yaml.safe_load(path.read_text())
    counts = Counter()
    with conn.transaction():
        for key, value in sources.items():
            counts[repo.upsert_source(conn, key, value)] += 1
    summary('sources', counts)
    return counts

def main():
    with connection() as conn:
        load_sources(conn)

if __name__ == '__main__':
    run(main)
