"""
SQLAlchemy connection pool — one engine shared across all requests.

The engine is created once when the module is first imported and reused for
the lifetime of the server process. pool_pre_ping=True replaces stale
connections transparently (e.g. after PostgreSQL restarts).

Driver is platform-aware (mirrors the data/alpha repos' utils/db.py):
  * Windows (local dev) -> pg8000 (pure Python; psycopg2's C extension crashes on Windows).
  * Linux/macOS (the droplet) -> psycopg2.
No behaviour change in production — the droplet keeps psycopg2.

Usage in route handlers:
    from api.db import get_db
    with get_db() as conn:
        result = conn.execute(text("SELECT 1")).fetchone()
"""

import sys
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.engine import Connection

from api.config import get_settings

_engine = None
_USE_PG8000 = sys.platform == "win32"


def _get_engine():
    global _engine
    if _engine is None:
        s = get_settings()
        driver = "pg8000" if _USE_PG8000 else "psycopg2"
        url = f"postgresql+{driver}://{s.db_user}:{s.db_password}@{s.db_host}:{s.db_port}/{s.db_name}"
        kwargs = dict(pool_size=5, max_overflow=2, pool_pre_ping=True, pool_recycle=1800)
        if _USE_PG8000:                       # no SSL for the direct pg8000 connection
            kwargs["connect_args"] = {"ssl_context": False}
        _engine = create_engine(url, **kwargs)
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
