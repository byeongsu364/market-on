"""Metadata-only, best-effort model call audit."""

from app.db.pool import connection


def insert(conn, *, task, provider, model, ms, escalated, reason, ok):
    conn.execute(
        'insert into llm_calls(task, provider, model, ms, escalated, reason, ok) '
        'values (%s, %s, %s, %s, %s, %s, %s)',
        (task, provider, model, ms, escalated, reason, ok),
    )


def record(**values):
    try:
        with connection() as conn:
            insert(conn, **values)
    except Exception:
        pass
