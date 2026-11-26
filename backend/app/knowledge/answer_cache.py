"""Seoul-day and document-content versioned answer cache."""

import json
import re
from datetime import datetime
from hashlib import sha256
from zoneinfo import ZoneInfo

from app.db.repositories import ask_repo


def cache_key(conn, item, intent, lang, question):
    version = sha256(
        json.dumps(ask_repo.document_version(conn, item), ensure_ascii=False, default=str).encode()
    ).hexdigest()
    normalized = re.sub(r'[\s?？]', '', question.lower()) if question else None
    question_hash = sha256(normalized.encode()).hexdigest()[:16] if normalized else 'chip'
    day = datetime.now(ZoneInfo('Asia/Seoul')).date().isoformat()
    return f'ask:{item}:{intent}:{lang}:{day}:{version}:{question_hash}'


def get_cached_answer(conn, key):
    cached = ask_repo.get_cache(conn, key)
    # Regenerate older payloads that cannot identify unreviewed evidence.
    if cached and any('draft' not in source for source in cached.get('citations', [])):
        return None
    return cached


def save(conn, key, answer, model):
    ask_repo.put_cache(conn, key, answer, model)
