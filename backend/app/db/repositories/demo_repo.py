"""Idempotent demo primitives, preserving existing ontology metadata."""


def ensure_entity(conn, entity_id, kind, name):
    conn.execute(
        'insert into entities(id,type,name_ko) values(%s,%s,%s) on conflict(id) do nothing',
        (entity_id, kind, name),
    )
