"""
SkyPilot Capital — internal dashboard API.

FastAPI application entry point. Registers routers and configures CORS so
that only the Vercel frontend can reach the endpoints.

Run locally:
    cd Code_Repo/webapp
    uvicorn api.main:app --reload --port 8000

Deploy on the droplet:
    systemctl start skypilot-api   (after installing the systemd unit)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import get_settings
from api.routers import (health, data_monitor, macro_beta, research, reports,
                         portfolio, trading, paper, report_archive)

app = FastAPI(
    title="SkyPilot Capital API",
    version="0.1.0",
    description="Internal dashboard API — Panel 1: Data Monitor",
    docs_url="/docs",       # Swagger UI at /docs (useful during dev)
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS — restrict to Vercel frontend and local dev
# CORS_ORIGINS in .env should be set to your Vercel deployment URL once live:
#   CORS_ORIGINS=["https://your-app.vercel.app"]
# ---------------------------------------------------------------------------
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    # POST is allowed solely for the HALT control ([10-RBAL] §3.8) — the one write the
    # website has. Every other endpoint is GET, and the write path uses its own
    # narrowly-granted DB role rather than the read connection.
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(health.router)
app.include_router(data_monitor.router)
app.include_router(macro_beta.router)
app.include_router(research.router)
app.include_router(reports.router)
app.include_router(portfolio.router)
app.include_router(trading.router)
app.include_router(paper.router)
app.include_router(report_archive.router)
