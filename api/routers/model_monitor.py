"""
Model Monitor — Factors ([08-FMON]). Read-only.

Serves the factor monitor: what each production component model leans on (RELIANCE), what each factor
itself paid (FACTOR PAYOFF), and what the model's USE of each factor earned (CONTRIBUTION) — three
different questions, never conflated.

EVERYTHING HERE READS PRECOMPUTED TABLES (research.fmon_*), written monthly by the alpha chain step
`fmon` (alpha scripts/build_factor_monitor.py). The statistics — 12-month means, z-scores and
percentiles against the 2015-23 distribution, per-family coupling fits — live in ONE implementation
there; this router does no arithmetic beyond ordering and picking rows. The API process has no
pandas, by design.

Honesty rules the page relies on, enforced upstream and passed through here unchanged:
  * contribution_valid = false → contribution is NULL in every table and contribution_note says why
    (the 3M models' stored contribution was look-ahead until [04-SWIN]; shap_reliance_panel.md §9.9).
  * three edges are reported separately (panel_edge, payoff_edge, compared_asof) — never smoothed.
  * the panel explains COMPONENT forecasts, not the production blend and not the portfolio.
"""
from __future__ import annotations

import decimal
import math
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from api.db import get_db

router = APIRouter(prefix="/api/v1/model-monitor", tags=["model-monitor"])

MOVERS_N = 6


def _clean(row) -> dict[str, Any]:
    """NaN (Decimal or float) → None, dates → ISO strings. NaN is not valid JSON."""
    out = {}
    for k, v in dict(row._mapping).items():
        if isinstance(v, decimal.Decimal):
            v = None if v.is_nan() else float(v)
        elif isinstance(v, float) and math.isnan(v):
            v = None
        elif hasattr(v, "isoformat"):
            v = v.isoformat()
        out[k] = v
    return out


def _summary(conn, model_id: str) -> dict[str, Any]:
    row = conn.execute(text("SELECT * FROM research.fmon_summary WHERE model_id = :m"),
                       {"m": model_id}).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"No factor monitor for model '{model_id}'.")
    return _clean(row)


@router.get("/factors/models")
def list_models():
    """Every component the monitor covers, with its blend role, edges, validity and headline tiles."""
    with get_db() as conn:
        rows = conn.execute(text(
            "SELECT * FROM research.fmon_summary ORDER BY universe DESC, horizon_months, model_id"
        )).fetchall()
    return [_clean(r) for r in rows]


@router.get("/factors/{model_id}")
def get_model(model_id: str):
    """Everything above the drill-down for one component: summary, per-family now, history, movers."""
    with get_db() as conn:
        summary = _summary(conn, model_id)
        families = [_clean(r) for r in conn.execute(text("""
            SELECT family, asof, coupling, payoff_now, expected, actual, gap_pctile,
                   expectation_trustworthy, reads_as, quadrant_asof, z_reliance_12m,
                   z_contribution_12m, attention, n_features
            FROM research.fmon_family_now WHERE model_id = :m
            ORDER BY gap_pctile NULLS LAST, family
        """), {"m": model_id}).fetchall()]
        history = [_clean(r) for r in conn.execute(text("""
            SELECT date, family, reliance, contribution, payoff, reliance_12m, contribution_12m,
                   payoff_12m, z_reliance_12m, z_contribution_12m, z_payoff_12m
            FROM research.fmon_family_series WHERE model_id = :m
            ORDER BY date, family
        """), {"m": model_id}).fetchall()]
        movers = {"asof": None, "best": [], "worst": []}
        if summary.get("contribution_valid"):
            edge = conn.execute(text("""
                SELECT max(date) FROM research.fmon_feature_series
                WHERE model_id = :m AND contribution_12m IS NOT NULL
            """), {"m": model_id}).scalar()
            if edge is not None:
                movers["asof"] = edge.isoformat()
                q = """
                    SELECT feature, family, contribution_12m, reliance_12m, payoff_12m, reliance_rank
                    FROM research.fmon_feature_series
                    WHERE model_id = :m AND date = :d AND contribution_12m IS NOT NULL
                    ORDER BY contribution_12m {dir} LIMIT :n
                """
                p = {"m": model_id, "d": edge, "n": MOVERS_N}
                movers["best"] = [_clean(r) for r in conn.execute(text(q.format(dir="DESC")), p)]
                movers["worst"] = [_clean(r) for r in conn.execute(text(q.format(dir="ASC")), p)]
    return {"summary": summary, "families": families, "history": history, "movers": movers}


@router.get("/factors/{model_id}/family/{family}")
def get_family(model_id: str, family: str):
    """Feature-level drill-down for ONE family (at most 14 features): full history per feature."""
    with get_db() as conn:
        _summary(conn, model_id)
        rows = conn.execute(text("""
            SELECT date, feature, reliance, contribution, payoff, reliance_12m, contribution_12m,
                   payoff_12m, reliance_rank
            FROM research.fmon_feature_series
            WHERE model_id = :m AND family = :f
            ORDER BY feature, date
        """), {"m": model_id, "f": family}).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No family '{family}' for model '{model_id}'.")
    return [_clean(r) for r in rows]
