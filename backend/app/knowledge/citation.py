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
    citations = {}
    for source in ask_repo.sources(conn, [chunk.chunk_id for chunk in chunks]):
        source = dict(source)
        body = source.pop('body', '')
        first_line = body.split('\n', 1)[0]
        draft = source.pop('review_status', 'draft') != 'reviewed' or first_line.startswith(
            ('> 초안', '> 샘플')
        )
        key = tuple(source.get(k) for k in ('title', 'publisher', 'url', 'license'))
        if key in citations:
            citations[key]['draft'] |= draft
        else:
            citations[key] = source | {'draft': draft}
    return list(citations.values())
