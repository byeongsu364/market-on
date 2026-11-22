"""Label resolution shares exactly the ingestion matcher."""
import re
from app.db.repositories import knowledge_repo as repo

def normalize(text: str) -> str:
    return re.sub(r'\s+', '', text.lower())

def load_label_dictionary(conn) -> list[tuple[str, str, str]]:
    return repo.label_dictionary(conn)

def resolve_entities(conn, text: str) -> list[str]:
    from .ingest import tag_entities
    return sorted(tag_entities(text, load_label_dictionary(conn)))
