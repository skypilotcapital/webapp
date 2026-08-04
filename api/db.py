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


# --------------------------------------------------------------------------- halt writes ----
# A SECOND engine, on the narrow `skypilot_halter` role. Deliberately not a mode of the main one:
# the read path must stay incapable of writing, so the separation is a connection, not a flag.
_halt_engine = None
_approve_engine = None


def halt_writes_enabled() -> bool:
    s = get_settings()
    return bool(s.halt_db_user and s.halt_db_password)


def approve_writes_enabled() -> bool:
    s = get_settings()
    return bool(s.approve_db_user and s.approve_db_password)


def get_approve_engine():
    """Engine for the approval write path, or None if no approver credentials are configured.

    A THIRD engine, on `skypilot_approver`. One role per capability (A8): the halt role cannot
    approve and the approver role cannot halt, so a flaw in either endpoint is bounded by its own
    grant rather than by which code path happened to reach it.
    """
    global _approve_engine
    if not approve_writes_enabled():
        return None
    if _approve_engine is None:
        s = get_settings()
        driver = "pg8000" if _USE_PG8000 else "psycopg2"
        url = (f"postgresql+{driver}://{s.approve_db_user}:{s.approve_db_password}"
               f"@{s.db_host}:{s.db_port}/{s.db_name}")
        kwargs = {"connect_args": {"ssl_context": False}} if _USE_PG8000 else {}
        _approve_engine = create_engine(url, pool_pre_ping=True, pool_size=2, **kwargs)
    return _approve_engine


def get_halt_engine():
    """Engine for the halt write path, or None if no halter credentials are configured.

    Returning None rather than falling back to `db_user` is the point: a misconfigured deployment
    must lose the button, not quietly gain a write path through the read role.
    """
    global _halt_engine
    if not halt_writes_enabled():
        return None
    if _halt_engine is None:
        s = get_settings()
        driver = "pg8000" if _USE_PG8000 else "psycopg2"
        url = (f"postgresql+{driver}://{s.halt_db_user}:{s.halt_db_password}"
               f"@{s.db_host}:{s.db_port}/{s.db_name}")
        kwargs = {"connect_args": {"ssl_context": False}} if _USE_PG8000 else {}
        _halt_engine = create_engine(url, pool_pre_ping=True, pool_size=2, **kwargs)
    return _halt_engine
