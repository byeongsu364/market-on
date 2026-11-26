"""Clean evidence and attach only selected, deduplicated source metadata."""

import re

from app.db.repositories import ask_repo


def clean_evidence(content):
    # Chunk prefixes can precede a draft marker on the first line.
    content = re.sub(r'^\[[^\n]*?\]\s*', '', content)
    return '\n'.join(
        line for line in content.splitlines() if not line.lstrip().startswith(('>', '출처:'))
    ).strip()


def attach_citations(conn, chunks):
    return ask_repo.sources(conn, [chunk.chunk_id for chunk in chunks])
