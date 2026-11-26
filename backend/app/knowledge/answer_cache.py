"""Seoul-day and document-content versioned answer cache."""

import json
import re
from datetime import datetime
from hashlib import sha256
from zoneinfo import ZoneInfo

from app.db.repositories import ask_repo


def cache_key(conn, item, intent, lang, question):
    version = document_digest(ask_repo.document_version(conn, item))
    normalized = re.sub(r'[\s?？]', '', question.lower()) if question else None
    question_hash = sha256(normalized.encode()).hexdigest()[:16] if normalized else 'chip'
    day = seoul_day()
    return f'ask:{item}:{intent}:{lang}:{day}:{version}:{question_hash}'


def get_cached_answer(conn, key):
    cached = ask_repo.get_cache(conn, key)
    # Regenerate older payloads that cannot identify unreviewed evidence.
    if cached and any('draft' not in source for source in cached.get('citations', [])):
        return None
    return cached


def save(conn, key, answer, model):
    ask_repo.put_cache(conn, key, answer, model)


def seoul_day():
    return datetime.now(ZoneInfo('Asia/Seoul')).date().isoformat()


def document_digest(versions):
    return sha256(json.dumps(versions, ensure_ascii=False, default=str).encode()).hexdigest()


def recommend_key(conn, data, item_ids):
    version = document_digest([(i, ask_repo.document_version(conn, i)) for i in item_ids])
    key = f'recommend:v2:{data.market_id}:{data.purpose}:{data.relation}:{data.headcount}:{data.budget}:{seoul_day()}:{version}'
    # Events change reasons; hash that optional context rather than store its text in the key.
    if data.event:
        key += ':' + sha256(data.event.encode()).hexdigest()
    return key
