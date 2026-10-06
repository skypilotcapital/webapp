"""
Health check endpoint.

GET /health — returns {"status": "ok", "db": "ok"} when everything is healthy.
Returns HTTP 503 with {"status": "ok", "db": "error", "detail": "..."} if the
database is unreachable. Used by DigitalOcean health monitoring and as a
quick sanity check after deployment.
"""

from fastapi import APIRouter, Response
from sqlalchemy import text

from api.config import get_settings
from api.db import get_db
from api.proxy_guard import guard_state

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check(response: Response):
    try:
        with get_db() as conn:
            conn.execute(text("SELECT 1"))
        # The ONE endpoint the proxy guard leaves open, so it reports the guard's own state: an
        # API running with no PROXY_SECRET is visible from outside, not only in the logs.
        return {"status": "ok", "db": "ok", "proxy_guard": guard_state(get_settings().proxy_secret)}
    except Exception as exc:
        response.status_code = 503
        return {"status": "ok", "db": "error", "detail": str(exc),
                "proxy_guard": guard_state(get_settings().proxy_secret)}
