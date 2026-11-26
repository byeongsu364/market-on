"""Bounded, anonymous reads of the live ontology projections."""

import json

from ._operational import rows

LIMIT = 200


def nodes(conn, ids):
    return rows(conn, 'select * from onto_node where id=any(%s) order by id', (ids,))


PRICE_LIMIT = 20
# 지식 관계를 먼저, 시장 관계 다음, 시세·제보는 마지막에 최근 것만 (시세가 그래프를 덮지 않게)
PRIORITY = """case
  when e.pred in ('isA','hasGrade','hasCriterion','soldBy','inSeason','harvestPeriod',
                  'producedIn','storedAs','hasPrep','usedIn','supportedBy') then 0
  when e.pred in ('sells','contains','posts','about','requests','confirmedBy','describes') then 1
  else 2 end"""
RECENT = """(a.type is null or a.type not in ('price','report') or
             (a.props->>'date')::timestamptz between now()-interval '7 days' and now())
        and (b.type is null or b.type not in ('price','report') or
             (b.props->>'date')::timestamptz between now()-interval '7 days' and now())"""


def adjacent(conn, frontier):
    base = f"""select e.* from onto_edge e
        left join onto_node a on a.id=e.subj
        left join onto_node b on b.id=e.obj
        where (e.subj=any(%s) or e.obj=any(%s)) and {RECENT}"""
    knowledge = rows(
        conn,
        f"""{base} and e.pred not in ('hasPrice','reportedAt')
        order by {PRIORITY}, e.subj, e.pred, e.obj, e.obj_value::text, e.props::text limit %s""",
        (frontier, frontier, LIMIT),
    )
    market = rows(
        conn,
        f"""{base} and e.pred in ('hasPrice','reportedAt')
        order by coalesce(a.props->>'date', b.props->>'date') desc, e.subj, e.obj limit %s""",
        (frontier, frontier, PRICE_LIMIT),
    )
    return knowledge + market


def graph(conn, item_id, depth):
    roots = nodes(conn, [item_id])
    if not roots or roots[0]['type'] != 'item':
        return None
    found = {item_id: roots[0]}
    edges, seen = [], set()
    frontier = [item_id]
    for _ in range(depth):
        candidates = adjacent(conn, frontier)
        ids = {e[k] for e in candidates for k in ('subj', 'obj') if e[k]}
        available = {n['id']: n for n in nodes(conn, sorted(ids - found.keys()))}
        next_frontier = set()
        for edge in candidates:
            # PostgreSQL can contain identical projected relations; return each edge once.
            key = json.dumps(edge, sort_keys=True, default=str)
            if key in seen:
                continue
            missing = {edge[k] for k in ('subj', 'obj') if edge[k]} - found.keys()
            additions = missing & available.keys()
            if len(found) + len(additions) > LIMIT or len(edges) >= LIMIT:
                continue
            # 'merchant' is an anonymous role endpoint, not a user node.
            for nid in sorted(additions):
                found[nid] = available[nid]
                next_frontier.add(nid)
            edges.append(edge)
            seen.add(key)
        frontier = sorted(next_frontier)
        if not frontier or len(edges) >= LIMIT:
            break
    return {'nodes': list(found.values()), 'edges': edges}
