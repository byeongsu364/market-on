"""Merge YAML ontology files with file/line diagnostics for relationships."""

import argparse
from collections import Counter

import yaml

from app.db.pool import connection
from app.db.repositories import knowledge_repo as repo

from ._common import DATA, run, summary


def load_ontology(conn, directory=DATA / 'ontology', *, prune=False, cleanup=True):
    records = []
    top_relations = []
    for path in sorted(directory.glob('*.yaml')):
        text = path.read_text()
        value = yaml.safe_load(text)
        node = yaml.compose(text)
        entities_node = next((v for k, v in node.value if k.value == 'entities'), None)
        top_node = next((v for k, v in node.value if k.value == 'relations'), None)
        for relation, rn in zip(value.get('relations', []), top_node.value if top_node else []):
            top_relations.append((path, relation, rn.start_mark.line + 1))
        for entity, entity_node in zip(
            value.get('entities', []), entities_node.value if entities_node else []
        ):
            relations_node = next((v for k, v in entity_node.value if k.value == 'relations'), None)
            lines = [n.start_mark.line + 1 for n in relations_node.value] if relations_node else []
            records.append((path, entity, lines))
    by_id = {entity['id']: (entity, lines) for _, entity, lines in records}
    for path, relation, line in top_relations:
        if relation.get('s') not in by_id:
            raise ValueError(f'{path}:{line}: 알 수 없는 주어 {relation.get("s")}')
        entity, lines = by_id[relation['s']]
        entity.setdefault('relations', []).append(relation)
        lines.append((path, line))
    # Generated nodes carry an ownership marker so removed criteria can be pruned
    # without deleting manually authored criterion entities.
    generated = []
    for path, entity, lines in records:
        criteria = entity.get('criteria', [])
        if criteria and (entity['type'] != 'item' or not entity['id'].startswith('item:')):
            raise ValueError(f'{path}: criteria는 item 엔터티에만 허용합니다.')
        entity['relations'] = list(entity.get('relations', []))
        for criterion in criteria:
            cid = f'crit:{entity["id"].removeprefix("item:")}-{criterion["key"]}'
            source = criterion.get('source', entity.get('source'))
            labels = {'ko': [criterion['text']], **criterion.get('labels', {})}
            generated.append(
                (
                    path,
                    {
                        'id': cid,
                        'type': 'criterion',
                        'name_ko': criterion['text'],
                        'labels': labels,
                        'source': source,
                        'attrs': {'generated_criterion': True, 'criterion_parent': entity['id']},
                    },
                    [],
                )
            )
            entity['relations'].append({'p': 'hasCriterion', 'o': cid, 'source': source})
            lines.append(1)
    records.extend(generated)
    # Draft labels are presentation data, never evidence documents.
    from app.knowledge.i18n import LANGUAGES

    for lang in LANGUAGES[1:]:
        path = directory.parent / 'i18n' / f'{lang}.yaml'
        if path.exists():
            drafts = yaml.safe_load(path.read_text()).get('entities', {})
            for _, entity, _ in records:
                entry = drafts.get(entity['id'], {})
                if entry.get('text'):
                    entity.setdefault('translated_labels', {})[lang] = entry['text']
    ids = [e['id'] for _, e, _ in records]
    if len(set(ids)) != len(ids):
        raise ValueError('온톨로지 파일에 중복 엔터티 ID가 있습니다.')
    counts = Counter()
    with conn.transaction():
        known = repo.entity_ids(conn) | set(ids)
        prepared = []
        for path, entity, lines in records:
            relations = []
            for relation, line in zip(entity.get('relations', []), lines):
                location = f'{line[0]}:{line[1]}' if isinstance(line, tuple) else f'{path}:{line}'
                if (
                    ('o' in relation) == ('v' in relation)
                    or relation.get('o', True) is None
                    or ('v' in relation and relation['v'] is None)
                ):
                    raise ValueError(f'{location}: o 또는 v 중 하나의 값이 필요합니다.')
                if 'o' in relation and relation['o'] not in known:
                    raise ValueError(f'{location}: 알 수 없는 엔터티 {relation["o"]}')
                try:
                    source = (
                        repo.source_id(conn, relation['source']) if relation.get('source') else None
                    )
                except ValueError as exc:
                    raise ValueError(f'{location}: {exc}') from exc
                relations.append(
                    (
                        relation['p'],
                        relation.get('o'),
                        relation.get('v'),
                        source,
                        relation.get('props'),
                    )
                )
            status = repo.upsert_entity(conn, entity, relations)
            counts[status] += 1
            prepared.append((entity['id'], relations, status))
        for eid, relations, status in prepared:
            if status != 'skipped':
                repo.replace_relations(conn, eid, relations)
        if prune:
            counts['deleted'] = repo.prune_entities(conn, ids)
        elif cleanup:
            counts['deleted'] = repo.prune_generated_criteria(
                conn, [e['id'] for _, e, _ in generated]
            )
    summary('ontology', counts)
    return counts


def ontology_ids(directory):
    ids = set()
    for path in sorted(directory.glob('*.yaml')):
        for entity in yaml.safe_load(path.read_text()).get('entities', []):
            ids.add(entity['id'])
            ids.update(
                f'crit:{entity["id"].removeprefix("item:")}-{c["key"]}'
                for c in entity.get('criteria', [])
            )
    return ids


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--prune', action='store_true')
    args = parser.parse_args()
    with connection() as conn:
        load_ontology(conn, prune=args.prune)


if __name__ == '__main__':
    run(main)
