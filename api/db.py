"""
SQLAlchemy connection pool — one engine shared across all requests.

The engine is created once when the module is first imported and reused for
the lifetime of the server process. pool_pre_ping=True replaces stale
connections transparently (e.g. after PostgreSQL restarts).

Usage in route handlers:
    from api.db import get_db
    with get_db() as conn:
        result = conn.execute(text("SELECT 1")).fetchone()
"""

from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.engine import Connection

from api.config import get_settings

_engine = None


def _get_engine():
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_engine(
            settings.database_url,
            pool_size=5,
            max_overflow=2,
            pool_pre_ping=True,
            pool_recycle=1800,  # recycle connections every 30 min
        )
    return _engine


@contextmanager
def get_db() -> Connection:
    """
    Context manager yielding a SQLAlchemy connection from the pool.

    The connection is returned to the pool automatically on exit.
    Transactions are committed automatically by SQLAlchemy's autocommit mode
    for SELECT-only workloads.
    """
    engine = _get_engine()
    with engine.connect() as conn:
        yield conn
