"""Recipe candidates and candidate-scoped vector ranking."""

from pgvector import Vector

from ._operational import rows


def seasons(conn):
    result = {}
    for eid, month in conn.execute(
        "select subject_id,object_id from entity_relations where predicate='inSeason'"
    ):
        result.setdefault(eid, []).append(int(month.split(':')[-1]))
    return result


def candidates(conn, item_id, month, weather, recipe_id=None):
    return rows(
        conn,
        """
        select e.id recipe_id,e.name_ko name,e.attrs,d.body,
        coalesce(c.props,'{}'::jsonb) props, main.name_ko main_item_name,
        s.title source_title,s.publisher,s.url,s.license
        from entities e join documents d on d.doc_key=e.attrs->>'doc_key'
        join sources s on s.id=d.source_id
        join chunks c on c.document_id=d.id and c.chunk_index=0
        left join entities main on main.id=c.props->>'main_item_id'
        where e.type='recipe' and d.review_status!='rejected'
        and (%(recipe)s::text is null or e.id=%(recipe)s)
        and (%(item)s::text is null or exists (
            select 1 from entity_relations r where r.object_id=e.id
            and r.subject_id=%(item)s and r.predicate='usedIn' and r.props->>'role'='주재료'))
        order by (coalesce(c.props->'season_months','[]') @> to_jsonb(%(month)s::int)) desc,
        (coalesce(c.props->'weather_tags','[]') ? coalesce(%(weather)s,'')) desc,e.id
        """,
        {'item': item_id, 'month': month, 'weather': weather, 'recipe': recipe_id},
    )


def vector_order(conn, keys, vector):
    return [
        r[0]
        for r in conn.execute(
            """
        select d.doc_key from chunks c join documents d on d.id=c.document_id
        where d.doc_key=any(%s) and c.doc_type='recipe' and c.embedding is not null
        and d.review_status!='rejected'
        group by d.doc_key order by min(c.embedding <=> %s),d.doc_key
        """,
            (keys, Vector(vector)),
        )
    ]
