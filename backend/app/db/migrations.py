"""Schema migration bookkeeping and SQL execution."""
from .pool import connection

def applied_versions():
    with connection() as conn:
        exists = conn.execute("SELECT to_regclass('public.schema_migrations')").fetchone()[0]
        return {row[0] for row in conn.execute('SELECT version FROM public.schema_migrations')} if exists else set()

def ensure_history():
    with connection() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS public.schema_migrations (
            version text primary key, applied_at timestamptz not null default now())""")

def apply(version, sql):
    with connection() as conn:
        conn.execute(sql, prepare=False)
        conn.execute('INSERT INTO public.schema_migrations (version) VALUES (%s)', (version,))
