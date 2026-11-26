"""Schema migration bookkeeping and SQL execution."""

from .pool import connection


def applied_versions():
    with connection() as conn:
        exists = conn.execute("SELECT to_regclass('public.schema_migrations')").fetchone()[0]
        return (
            {row[0] for row in conn.execute('SELECT version FROM public.schema_migrations')}
            if exists
            else set()
        )


def ensure_history():
    with connection() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS public.schema_migrations (
            version text primary key, applied_at timestamptz not null default now())""")


def apply(version, sql):
    with connection() as conn:
        # pgvector를 이 연결에서 먼저 한 번 불러옴. 그래야 hnsw.iterative_scan 같은 확장 설정이 정의돼요.
        # 불러오기 전에 함수에 `set hnsw.iterative_scan`을 넣으면 "모르는 설정"이 되어,
        # 슈퍼유저가 아닌 계정(RDS 앱 계정)은 권한 오류가 나요(2026-11-27, 0021 배포 실패).
        if conn.execute("SELECT 1 FROM pg_extension WHERE extname='vector'").fetchone():
            conn.execute('SELECT NULL::vector')
        conn.execute(sql, prepare=False)
        conn.execute('INSERT INTO public.schema_migrations (version) VALUES (%s)', (version,))
