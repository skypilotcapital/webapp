"""
Reports library endpoints.

Serves pre-generated HTML/PDF reports from the droplet filesystem.
The reports directory is configured via REPORTS_DIR in the API .env file.

Endpoints:
    GET /api/v1/reports
        List all available reports, sorted by date descending.
        Returns metadata: filename, category, generated_at, size_kb, has_pdf.

    GET /api/v1/reports/{filename}/html
        Serve the raw HTML of a specific report.
        Opens directly in a browser tab (Content-Type: text/html).
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from api.config import get_settings

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def _reports_root() -> Path | None:
    """
    Resolve the reports root directory from config. Returns None if not configured
    or the path does not exist — list endpoint returns [] gracefully in local dev.
    """
    path = get_settings().reports_dir
    if not path:
        # Fallback: look for Main/Reports relative to the monorepo root
        candidate = Path(__file__).resolve().parents[4] / "Main" / "Reports"
        if candidate.exists():
            return candidate
        return None
    p = Path(path)
    return p if p.exists() else None


# Human-readable category labels keyed by subdirectory name
CATEGORY_LABELS: dict[str, str] = {
    "gate_validation": "Gate Validation",
    "db_health":       "DB Health",
    "factor_research": "Factor Research",
    "model":           "Model Training",
    "portfolio":       "Portfolio",
}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ReportItem(BaseModel):
    filename: str           # e.g. "gate_validation_20260427_1440.html"
    category: str           # directory name, e.g. "gate_validation"
    category_label: str     # human-readable, e.g. "Gate Validation"
    generated_at: Optional[str]   # ISO string parsed from filename or file mtime
    size_kb: float
    has_pdf: bool
    description: Optional[str]    # from sidecar _meta.json if present


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_DATE_RE = re.compile(r"(\d{8})_(\d{4})")

def _parse_timestamp(filename: str, fallback_mtime: float) -> str:
    """Extract timestamp from filename pattern YYYYMMDD_HHMM, or use mtime."""
    m = _DATE_RE.search(filename)
    if m:
        try:
            dt = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M")
            return dt.isoformat()
        except ValueError:
            pass
    return datetime.fromtimestamp(fallback_mtime).isoformat()


def _load_meta(html_path: Path) -> dict:
    """Try to load sidecar _meta.json for richer metadata."""
    meta_path = html_path.with_name(html_path.stem + "_meta.json")
    if meta_path.exists():
        try:
            return json.loads(meta_path.read_text())
        except Exception:
            pass
    return {}


def _scan_reports(root: Path) -> list[ReportItem]:
    items: list[ReportItem] = []

    for html_file in sorted(root.rglob("*.html"), key=lambda p: p.stat().st_mtime, reverse=True):
        # Skip "latest" symlinks / copies — they duplicate real entries
        if "latest" in html_file.name:
            continue

        category_dir = html_file.parent.name if html_file.parent != root else "general"
        category_label = CATEGORY_LABELS.get(category_dir, category_dir.replace("_", " ").title())

        stat = html_file.stat()
        meta = _load_meta(html_file)
        has_pdf = html_file.with_suffix(".pdf").exists()

        items.append(ReportItem(
            filename=html_file.name,
            category=category_dir,
            category_label=category_label,
            generated_at=_parse_timestamp(html_file.name, stat.st_mtime),
            size_kb=round(stat.st_size / 1024, 1),
            has_pdf=has_pdf,
            description=meta.get("description"),
        ))

    return items


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=List[ReportItem])
def list_reports():
    """List all available reports sorted by date descending."""
    root = _reports_root()
    if root is None:
        return []
    return _scan_reports(root)


@router.get("/{filename}/html", response_class=HTMLResponse)
def serve_report_html(filename: str):
    """
    Serve the raw HTML of a report file. Called directly by the browser
    when the user clicks 'Open Report' — opens in a new tab.
    """
    # Security: reject any path traversal attempts
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    root = _reports_root()
    if root is None:
        raise HTTPException(status_code=503, detail="Reports directory not configured.")

    # Search all category subdirectories
    matches = list(root.rglob(filename))
    if not matches:
        raise HTTPException(status_code=404, detail=f"Report '{filename}' not found.")

    html_path = matches[0]
    if not html_path.suffix == ".html":
        raise HTTPException(status_code=400, detail="Only HTML reports can be served this way.")

    return HTMLResponse(content=html_path.read_text(encoding="utf-8"), status_code=200)
