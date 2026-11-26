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
    """since 이후 이 provider로 성공한 호출 수. 실패(예: 결제 미연결 403)·한도로 안 보낸 건 요금이
    안 나와서 빼요 (11/27 노트북에서 실패 17건이 한 달 한도에 들어가던 것)."""
    with connection() as conn:
        row = conn.execute(
            'select count(*) from llm_calls where provider = %s and created_at >= %s and ok',
            (provider, since),
        ).fetchone()
    return int(row[0])
