"""Metadata-only, best-effort model call audit."""

from app.db.pool import connection


def insert(conn, *, task, provider, model, ms, escalated, reason, ok, role=None):
    conn.execute(
        'insert into llm_calls(task, role, provider, model, ms, escalated, reason, ok) '
        'values (%s, %s, %s, %s, %s, %s, %s, %s)',
        (task, role, provider, model, ms, escalated, reason, ok),
    )


def record(**values):
    try:
        with connection() as conn:
            insert(conn, **values)
    except Exception:
        pass


def count_since(provider, since) -> int:
    """since 이후 이 provider로 실제 보낸 호출 수 (한도에 걸려 안 보낸 건 빼요)."""
    with connection() as conn:
        row = conn.execute(
            'select count(*) from llm_calls where provider = %s and created_at >= %s '
            "and (reason is null or reason not in ('daily_limit', 'client_limit', 'monthly_limit'))",
            (provider, since),
        ).fetchone()
    return int(row[0])
