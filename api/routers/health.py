"""
Health check endpoint.

GET /health — returns {"status": "ok", "db": "ok"} when everything is healthy.
Returns HTTP 503 with {"status": "ok", "db": "error", "detail": "..."} if the
database is unreachable. Used by DigitalOcean health monitoring and as a
quick sanity check after deployment.
"""

from fastapi import APIRouter, Response
from sqlalchemy import text

from api.db import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check(response: Response):
    try:
        with get_db() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}
    except Exception as exc:
        response.status_code = 503
        return {"status": "ok", "db": "error", "detail": str(exc)}
