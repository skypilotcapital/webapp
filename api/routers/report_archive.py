"""The frozen report archive — what we said, on the day we said it ([08-WKLY], [08-MRPT]).

Design: `08_website_and_tooling/performance_reporting_plan.md`, "The three reports" and
"Where these live". Reads `trading.reports`, which is append-only by trigger.

WHY THIS SERVES STORED TEXT RATHER THAN RE-RENDERING THE PAYLOAD. The archive exists so that
"this is what we knew and said on Aug 14" stays true. If the page rebuilt each report from its
payload with today's frontend, then a formatting change, a rounding tweak or a relabelled column
would silently rewrite history — the archive would show what we WOULD say now, which is the one
thing it must never do. So `rendered_md` is served verbatim, exactly as it was published, and the
payload rides along beside it rather than in place of it.

The payload is still published, for two reasons: it is the closed contract `[08-CMTY]` narrates
(storing it beside the prose is what makes "the model computed nothing" auditable), and it is the
machine-readable form for anyone who wants the numbers without parsing prose.

REVISIONS ARE NOT VERSIONS OF THE TRUTH, THEY ARE A RECORD OF CORRECTION. Re-running a period
inserts revision+1 rather than overwriting — a vendor restatement (`[02-SM10]`) touching an
already-published month is exactly the case. So the default read is the LATEST revision, every
revision stays addressable, and a report that has been superseded says so. Dropping the earlier
revision would defeat the archive as thoroughly as re-rendering it would.

NOT AN INVESTOR SURFACE. Reports carry internal control lines (data-integrity state, unresolved
breaks, model-health percentiles). `performance_reporting_plan.md` is explicit that these stay
internal if the monthly ever goes investor-facing. This router applies the same access rules as
the rest of the app and adds no public path of its own.

Distinct from `routers/reports.py`, which serves generated HTML/PDF files off the droplet
filesystem and has nothing to do with the performance-reporting program. Different prefix on
purpose — the two must not be confused in a URL.
"""

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from api.db import get_db

router = APIRouter(prefix="/api/v1/report-archive", tags=["report-archive"])

TYPES = {"daily", "weekly", "monthly"}

# A listing is a browse surface, not a bulk export: the payload and the rendered text are fetched
# per report. Without this a year of dailies would ship several MB of JSON to draw an index.
_MAX_LIST = 500


def _type(t: str | None) -> str | None:
    if t is None:
        return None
    if t not in TYPES:
        raise HTTPException(status_code=404, detail="unknown report type")
    return t


@router.get("/{strategy}")
def list_reports(strategy: str,
                 report_type: str | None = Query(None, alias="type"),
                 limit: int = Query(200, le=_MAX_LIST)):
    """Index of published reports, newest first — metadata only, never the bodies.

    One row per (type, period): the latest revision, carrying how many revisions exist. A period
    that has been restated is visible AS restated from the index, without opening it.
    """
    _type(report_type)
    with get_db() as conn:
        rows = conn.execute(text("""
            SELECT DISTINCT ON (report_type, period_key)
                   report_type, period_key, revision, period_start, period_end,
                   book_asof, status, degradations, built_at, delivered_at,
                   (commentary IS NOT NULL) AS has_commentary,
                   COUNT(*) OVER (PARTITION BY report_type, period_key) AS n_revisions
            FROM trading.reports
            WHERE strategy = :st
              AND (:rt IS NULL OR report_type = :rt)
            ORDER BY report_type, period_key DESC, revision DESC
            LIMIT :lim"""),
            {"st": strategy, "rt": report_type, "lim": limit}).mappings().all()

    items = []
    for r in rows:
        d = dict(r)
        d["degradations"] = list(d["degradations"] or [])
        d["n_degradations"] = len(d["degradations"])
        d["restated"] = d["n_revisions"] > 1
        items.append(d)

    # Sorted here rather than in SQL: DISTINCT ON dictates its own ORDER BY, and re-sorting a few
    # hundred rows in Python is cheaper than the subquery that would let the database do it.
    items.sort(key=lambda x: (x["period_end"], x["report_type"]), reverse=True)
    return {"strategy": strategy, "type": report_type, "n": len(items), "items": items}


@router.get("/{strategy}/{report_type}/{period_key}")
def get_report(strategy: str, report_type: str, period_key: str,
               revision: int | None = Query(None)):
    """One report, as published. Latest revision unless one is named.

    `revisions` lists every revision of this period so the page can offer them, and
    `superseded_by` is set when the reader is looking at an older one — the case where showing
    the text WITHOUT saying it has been corrected would be actively misleading.
    """
    _type(report_type)
    with get_db() as conn:
        revs = conn.execute(text("""
            SELECT revision, built_at, status, book_asof
            FROM trading.reports
            WHERE strategy = :st AND report_type = :rt AND period_key = :pk
            ORDER BY revision"""),
            {"st": strategy, "rt": report_type, "pk": period_key}).mappings().all()
        if not revs:
            raise HTTPException(status_code=404, detail="no such report")

        latest = max(r["revision"] for r in revs)
        want = latest if revision is None else revision
        if want not in {r["revision"] for r in revs}:
            raise HTTPException(status_code=404, detail="no such revision")

        row = conn.execute(text("""
            SELECT report_type, period_key, strategy, revision, period_start, period_end,
                   book_asof, status, degradations, payload, rendered_md, commentary,
                   built_at, delivered_at
            FROM trading.reports
            WHERE strategy = :st AND report_type = :rt AND period_key = :pk AND revision = :rev"""),
            {"st": strategy, "rt": report_type, "pk": period_key, "rev": want}).mappings().first()

    d = dict(row)
    d["degradations"] = list(d["degradations"] or [])
    d["revisions"] = [dict(r) for r in revs]
    d["is_latest"] = want == latest
    d["superseded_by"] = None if want == latest else latest
    return d
