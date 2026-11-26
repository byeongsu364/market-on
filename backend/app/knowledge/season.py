"""Sourced season facts and deterministic Korean sentences from ontology edges."""

from app.db.repositories import knowledge_repo as repo
from app.schemas.ask import Citation

from . import i18n


def _source(row):
    return Citation(**{key: row[key] for key in ('title', 'publisher', 'url', 'license')})


def season_facts(conn, item_id, month=None):
    return _facts(repo.season_relations(conn, item_id), item_id, month)


def _facts(rows, item_id, month):
    featured, harvest, regions, sources = [], [], [], []
    for row in rows:
        source = _source(row)
        predicate = row['predicate']
        if predicate == 'inSeason':
            value = int(row['object_id'].split(':')[1])
            if month is not None and value != month:
                continue
            featured.append(value)
        elif predicate == 'harvestPeriod':
            value = row['object_value']
            harvest.append(
                dict(
                    variety_id=row['subject_id'] if row['subject_id'] != item_id else None,
                    variety_name=row['subject_name'] if row['subject_id'] != item_id else None,
                    label=value['label'],
                    **{k: value[k] for k in ('from', 'to') if k in value},
                    note=value.get('note'),
                    source=source,
                )
            )
        elif predicate == 'producedIn':
            regions.append({'id': row['object_id'], 'name': row['object_name']})
        if source not in sources:
            sources.append(source)
    return {
        'featured_months': sorted(set(featured)),
        'harvest': harvest,
        'regions': regions,
        'sources': sources,
    }


def season_statements(conn, item_id, name, *, variety_id=None, month=None, lang='ko'):
    """Return each sentence alongside only the relation sources used by it."""
    rows = repo.season_relations(conn, item_id)
    facts = _facts(rows, item_id, month)
    statements = []
    featured = [
        r
        for r in rows
        if r['predicate'] == 'inSeason'
        and (month is None or int(r['object_id'].split(':')[1]) == month)
    ]
    if featured and variety_id is None:
        months = ', '.join(f'{m}월' for m in facts['featured_months'])
        statements.append(
            (
                f"농촌진흥청 '이달의 식재료'에서 {name}{'을' if (ord(name[-1]) - 0xAC00) % 28 else '를'} {months} 식재료로 소개해요.",
                [_source(r) for r in featured],
            )
        )
    for harvest in facts['harvest']:
        if variety_id and harvest['variety_id'] != variety_id:
            continue
        subject = harvest['variety_name'] or name
        particle = '은' if (ord(subject[-1]) - 0xAC00) % 28 else '는'
        note = f'({harvest["note"]})' if harvest.get('note') else ''
        statements.append(
            (f'{subject}{particle} {harvest["label"]}에 수확해요{note}.', [harvest['source']])
        )
    regions = [r for r in rows if r['predicate'] == 'producedIn']
    if regions and variety_id is None:
        names = ', '.join(r['name'] for r in facts['regions'])
        particle = '은' if (ord(name[-1]) - 0xAC00) % 28 else '는'
        statements.append(
            (f'{name}{particle} {names}에서 많이 재배해요.', [_source(r) for r in regions])
        )
    if lang != 'ko':
        localized = []
        for original, sources in statements:
            translated = original
            localized_name = i18n.label(conn, item_id, lang, name)
            if "'이달의 식재료'" in original:
                translated = i18n.template(
                    'season_featured',
                    lang,
                    original,
                    name=localized_name,
                    months=', '.join(str(m) for m in facts['featured_months']),
                )
            else:
                for harvest in facts['harvest']:
                    if harvest['label'] not in original:
                        continue
                    period = i18n.text(harvest['label'], lang, '', section='phrases')
                    note = i18n.text(harvest.get('note', ''), lang, '', section='phrases')
                    if period and (not harvest.get('note') or note):
                        translated = i18n.template(
                            'season_harvest',
                            lang,
                            original,
                            name=i18n.label(
                                conn,
                                harvest['variety_id'] or item_id,
                                lang,
                                harvest['variety_name'] or name,
                            ),
                            period=period,
                            note=f' ({note})' if note else '',
                        )
                if '많이 재배해요' in original:
                    translated = i18n.template(
                        'season_regions',
                        lang,
                        original,
                        name=localized_name,
                        regions=', '.join(
                            i18n.label(conn, r['id'], lang, r['name']) for r in facts['regions']
                        ),
                    )
            localized.append((translated, sources))
        return localized
    return statements


def statement_citations(statements):
    sources = []
    for _, citations in statements:
        for source in citations:
            if source not in sources:
                sources.append(source)
    return sources
