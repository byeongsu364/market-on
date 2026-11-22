"""지연 생성 PostgreSQL 연결 풀. 허용 의존성: core 및 DB 드라이버."""
from __future__ import annotations

from contextlib import contextmanager
import logging
from threading import Lock
from typing import TYPE_CHECKING, Iterator

if TYPE_CHECKING:
    from psycopg import Connection
    from psycopg_pool import ConnectionPool

from app.core.config import settings
from app.core.errors import AppError

logger = logging.getLogger(__name__)
_pool: ConnectionPool | None = None
_lock = Lock()


def _configure(conn: Connection) -> None:
    from pgvector.psycopg import register_vector

    try:
        register_vector(conn)
    except Exception as exc:
        if str(exc) != 'vector type not found in the database':
            raise
        logger.warning('pgvector 확장이 없어 타입 등록을 건너뜁니다. 마이그레이션을 실행하세요.')


def get_pool() -> ConnectionPool:
    global _pool
    if not settings.DATABASE_URL:
        raise AppError('DB_NOT_CONFIGURED', 'DATABASE_URL을 설정해야 DB에 연결할 수 있습니다.', 503)
    with _lock:
        if _pool is None:
            from psycopg_pool import ConnectionPool

            _pool = ConnectionPool(
                conninfo=settings.DATABASE_URL,
                min_size=0,
                max_size=10,
                kwargs={'autocommit': True},
                configure=_configure,
                open=True,
            )
        return _pool


def close_pool() -> None:
    global _pool
    with _lock:
        if _pool is not None:
            _pool.close()
            _pool = None


@contextmanager
def connection() -> Iterator[Connection]:
    with get_pool().connection() as conn:
        with conn.transaction():
            yield conn
