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


def _vision_tokens(text: str) -> list[str]:
    return re.findall(r'[a-z0-9]+', text.lower())


def _contains_tokens(tokens: list[str], part: list[str]) -> bool:
    return any(tokens[i : i + len(part)] == part for i in range(len(tokens) - len(part) + 1))


def match_vision_labels(conn, labels: list[str]) -> list[dict]:
    candidates = {}
    dictionary = repo.vision_item_labels(conn) if labels else []
    for label, weight in zip(labels, (1.0, 0.85, 0.7)):
        if label.strip().lower().startswith('other:'):
            continue
        normalized = _vision_tokens(label)
        if not normalized:
            continue
        for row in dictionary:
            target = _vision_tokens(row['label'])
            if not target:
                continue
            score = (
                1.0
                if normalized == target
                else (
                    0.7
                    if _contains_tokens(normalized, target) or _contains_tokens(target, normalized)
                    else 0.0
                )
            )
            confidence = score * weight
            previous = candidates.get(row['id'])
            if confidence and (previous is None or confidence > previous['confidence']):
                candidates[row['id']] = {
                    'item_id': row['id'],
                    'name': row['name_ko'],
                    'confidence': confidence,
                }
    ranked = sorted(candidates.values(), key=lambda c: (-c['confidence'], c['item_id']))
    if ranked:
        top = ranked[0]
        for row in repo.similar_items(conn, top['item_id']):
            candidates.setdefault(
                row['id'],
                {
                    'item_id': row['id'],
                    'name': row['name_ko'],
                    'confidence': top['confidence'] * 0.6,
                },
            )
    return sorted(candidates.values(), key=lambda c: (-c['confidence'], c['item_id']))[:3]


def match_unit(conn, unit_text):
    def words(text):
        return normalize(re.sub(r'[\d.]+', '', text))

    target = words(unit_text)
    matches = {r['id'] for r in repo.unit_labels(conn) if words(r['label']) == target and target}
    return next(iter(matches)) if len(matches) == 1 else None
