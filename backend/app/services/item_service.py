"""Assemble ontology nodes into the public item contract."""

from app.core.errors import AppError
from app.db.repositories import knowledge_repo as repo
from app.knowledge.ontology import normalize
from app.schemas.item import Criterion, Item


def preferred(labels, lang, fallback):
    return next(
        (l['label'] for l in labels if l['lang'] == lang and l['kind'] == 'preferred'), fallback
    )


def get_item(conn, item_id, lang='ko'):
    entity = repo.get_item(conn, item_id)
    if entity is None:
        raise AppError('ITEM_NOT_FOUND', '품목을 찾을 수 없습니다.', 404)
    labels = repo.item_labels(conn, item_id)
    criteria, units, default = [], [], None
    for relation in repo.item_relations(conn, item_id):
        target = relation['object_id']
        if relation['predicate'] == 'hasCriterion' and relation['type'] == 'criterion':
            criteria.append(
                Criterion(
                    key=target.split('-', 1)[-1],
                    text=preferred(repo.item_labels(conn, target), lang, relation['name_ko']),
                    source=relation['source_title'] or '',
                )
            )
        elif relation['predicate'] == 'soldBy':
            if target not in units:
                units.append(target)
            if (relation['props'] or {}).get('default') is True and default is None:
                default = target
    raw_unit = (entity['kamis'] or {}).get('unit', '')
    fallback = {'개': 'each', '단': 'bunch', '킬로그램': 'kg', '그램': 'g'}.get(raw_unit, raw_unit)
    default = default or (units[0] if units else f'unit:{fallback}' if fallback else '')
    if default and default not in units:
        units.append(default)
    return Item(
        item_id=item_id,
        name=preferred(labels, lang, preferred(labels, 'ko', entity['name_ko'])),
        synonyms=[
            l['label']
            for l in labels
            if l['lang'] == 'ko' and l['kind'] in ('synonym', 'colloquial')
        ],
        vision_labels=[l['label'] for l in labels if l['kind'] == 'vision'],
        criteria=criteria,
        default_unit=default,
        units=units,
        labels_i18n={
            l['lang']: l['label']
            for l in labels
            if l['kind'] == 'preferred' and l['lang'] in ('ko', 'en', 'zh', 'ja', 'vi')
        },
    )


def search(conn, q):
    query = normalize(q)
    return (
        [get_item(conn, row['entity_id']) for row in repo.search_items(conn, query)]
        if query
        else []
    )
