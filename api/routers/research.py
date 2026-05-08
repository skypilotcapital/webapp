"""
Research panel endpoints — P01 Factor Quintile Analysis + Alpha Model Results.

Serves pre-computed results from the research schema.

Endpoints:
    GET /api/v1/research/p01/scorecard
        All factors — aggregate IC stats, Q5-Q1 spread, signal quality rating.
        Used to populate the scorecard table on the Research → Factors page.

    GET /api/v1/research/p01/factor/{factor_name}/detail
        Full time-series data for a single factor:
          - Monthly IC series (full-universe + within-sector)
          - Monthly quintile returns by universe (full + within_sector)
        Used to power the rolling IC chart and quintile cumulative return chart.
"""

from __future__ import annotations

import decimal
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from api.db import get_db


def _clean(row) -> dict:
    """Convert decimal.Decimal NaN → None (NaN is not valid JSON)."""
    return {
        k: (None if (isinstance(v, decimal.Decimal) and v.is_nan()) else v)
        for k, v in dict(row._mapping).items()
    }

router = APIRouter(prefix="/api/v1/research", tags=["research"])


# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------

class P01ScorecardRow(BaseModel):
    factor: str
    factor_label: str
    factor_family: str
    direction: int
    n_months: int
    date_from: Optional[str]
    date_to: Optional[str]
    # Full-universe stats
    full_mean_ic: Optional[float]
    full_ic_std: Optional[float]
    full_ic_tstat: Optional[float]
    full_ic_pvalue: Optional[float]
    full_icir: Optional[float]
    full_q5q1_spread_ann: Optional[float]
    full_monotonicity: Optional[float]
    full_signal_quality: Optional[str]
    full_q1_avg: Optional[float]
    full_q2_avg: Optional[float]
    full_q3_avg: Optional[float]
    full_q4_avg: Optional[float]
    full_q5_avg: Optional[float]
    # Within-sector stats
    ws_mean_ic: Optional[float]
    ws_ic_std: Optional[float]
    ws_ic_tstat: Optional[float]
    ws_ic_pvalue: Optional[float]
    ws_icir: Optional[float]
    ws_q5q1_spread_ann: Optional[float]
    ws_monotonicity: Optional[float]
    ws_signal_quality: Optional[str]
    ws_q1_avg: Optional[float]
    ws_q2_avg: Optional[float]
    ws_q3_avg: Optional[float]
    ws_q4_avg: Optional[float]
    ws_q5_avg: Optional[float]


class P01ICPoint(BaseModel):
    date: str
    ic_full: Optional[float]
    ic_within: Optional[float]


class P01QuintilePoint(BaseModel):
    date: str
    q1: Optional[float]
    q2: Optional[float]
    q3: Optional[float]
    q4: Optional[float]
    q5: Optional[float]


class P01FactorDetail(BaseModel):
    factor: str
    ic_series: List[P01ICPoint]
    quintile_returns_full: List[P01QuintilePoint]
    quintile_returns_within: List[P01QuintilePoint]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/p01/scorecard", response_model=List[P01ScorecardRow])
def get_p01_scorecard():
    """
    Return aggregate IC and quintile stats for all P01 factors.
    Ordered by factor_family, then factor name.
    """
    query = text("""
        SELECT
            factor, factor_label, factor_family, direction,
            n_months, date_from::text, date_to::text,
            full_mean_ic, full_ic_std, full_ic_tstat, full_ic_pvalue,
            full_icir, full_q5q1_spread_ann, full_monotonicity, full_signal_quality,
            full_q1_avg, full_q2_avg, full_q3_avg, full_q4_avg, full_q5_avg,
            ws_mean_ic, ws_ic_std, ws_ic_tstat, ws_ic_pvalue,
            ws_icir, ws_q5q1_spread_ann, ws_monotonicity, ws_signal_quality,
            ws_q1_avg, ws_q2_avg, ws_q3_avg, ws_q4_avg, ws_q5_avg
        FROM research.p01_scorecard
        ORDER BY
            CASE factor_family
                WHEN 'Momentum'  THEN 1
                WHEN 'Technical' THEN 2
                WHEN 'Quality'   THEN 3
                WHEN 'Valuation' THEN 4
                WHEN 'Growth'    THEN 5
                WHEN 'Risk'      THEN 6
                ELSE 7
            END,
            factor
    """)
    with get_db() as conn:
        rows = conn.execute(query).fetchall()

    if not rows:
        raise HTTPException(
            status_code=404,
            detail="No P01 scorecard data found. Run the analysis script first.",
        )
    return [P01ScorecardRow(**_clean(row)) for row in rows]


@router.get("/p01/factor/{factor_name}/detail", response_model=P01FactorDetail)
def get_p01_factor_detail(factor_name: str):
    """
    Return full time-series data for a single factor:
      - Monthly IC (full-universe + within-sector) — for rolling IC chart
      - Monthly quintile returns for both universes — for cumulative return chart

    The frontend computes:
      - Rolling 24M IC from the ic_series
      - Cumulative returns by chaining monthly quintile returns
    """
    # Validate factor exists
    with get_db() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM research.p01_scorecard WHERE factor = :f"),
            {"f": factor_name},
        ).fetchone()

    if not exists:
        raise HTTPException(
            status_code=404,
            detail=f"Factor '{factor_name}' not found in P01 scorecard.",
        )

    # IC series
    with get_db() as conn:
        ic_rows = conn.execute(
            text("""
                SELECT date::text, ic_full, ic_within
                FROM research.p01_ic_series
                WHERE factor = :f
                ORDER BY date
            """),
            {"f": factor_name},
        ).fetchall()

    ic_series = [P01ICPoint(**dict(r._mapping)) for r in ic_rows]

    # Quintile returns — full universe
    with get_db() as conn:
        qret_full_rows = conn.execute(
            text("""
                SELECT date::text, q1, q2, q3, q4, q5
                FROM research.p01_quintile_returns
                WHERE factor = :f AND universe = 'full'
                ORDER BY date
            """),
            {"f": factor_name},
        ).fetchall()

    # Quintile returns — within sector
    with get_db() as conn:
        qret_ws_rows = conn.execute(
            text("""
                SELECT date::text, q1, q2, q3, q4, q5
                FROM research.p01_quintile_returns
                WHERE factor = :f AND universe = 'within_sector'
                ORDER BY date
            """),
            {"f": factor_name},
        ).fetchall()

    return P01FactorDetail(
        factor=factor_name,
        ic_series=ic_series,
        quintile_returns_full=[P01QuintilePoint(**dict(r._mapping)) for r in qret_full_rows],
        quintile_returns_within=[P01QuintilePoint(**dict(r._mapping)) for r in qret_ws_rows],
    )


# ---------------------------------------------------------------------------
# Alpha Model Results
# ---------------------------------------------------------------------------

class ModelScorecardRow(BaseModel):
    model_id: str
    description: str
    target: str
    feature_set: str
    feature_count: Optional[int]
    model_type: str
    backtest_start: Optional[str]
    backtest_end: Optional[str]
    n_months: Optional[int]
    sector_mean_ic: Optional[float]
    sector_ic_std: Optional[float]
    sector_ic_tstat: Optional[float]
    sector_ic_hit_rate: Optional[float]
    univ_mean_ic: Optional[float]
    univ_ic_std: Optional[float]
    univ_ic_tstat: Optional[float]
    univ_ic_hit_rate: Optional[float]
    q5_minus_q1_avg: Optional[float]
    q5_minus_q1_ann: Optional[float]


class ModelICPoint(BaseModel):
    date: str
    sector: str
    ic: Optional[float]
    rolling_12m_ic: Optional[float]


class ModelQuintilePoint(BaseModel):
    date: str
    sector: str
    quintile: int
    fwd_return: Optional[float]


@router.get("/models/scorecard", response_model=List[ModelScorecardRow])
def get_model_scorecard():
    """
    Return aggregate IC stats and quintile spread for all published alpha models.
    One row per model, ordered by model_id.
    """
    with get_db() as conn:
        rows = conn.execute(text("""
            SELECT
                model_id, description, target, feature_set, feature_count, model_type,
                backtest_start::text, backtest_end::text, n_months,
                sector_mean_ic, sector_ic_std, sector_ic_tstat, sector_ic_hit_rate,
                univ_mean_ic, univ_ic_std, univ_ic_tstat, univ_ic_hit_rate,
                q5_minus_q1_avg, q5_minus_q1_ann
            FROM research.model_scorecard
            ORDER BY model_id
        """)).fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail="No model results found. Run compute_research_tables.py first.")
    return [ModelScorecardRow(**_clean(r)) for r in rows]


@router.get("/models/{model_id}/ic", response_model=List[ModelICPoint])
def get_model_ic_series(model_id: str, sector: str = "ALL"):
    """
    Return monthly IC series for a model, optionally filtered to one sector.
    Default sector='ALL' returns the full-universe aggregate IC + rolling 12M IC.
    """
    with get_db() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM research.model_scorecard WHERE model_id = :mid"),
            {"mid": model_id},
        ).fetchone()
    if not exists:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found.")

    with get_db() as conn:
        rows = conn.execute(text("""
            SELECT date::text, sector, ic, rolling_12m_ic
            FROM research.model_ic_series
            WHERE model_id = :mid AND sector = :sector
            ORDER BY date
        """), {"mid": model_id, "sector": sector}).fetchall()

    return [ModelICPoint(**_clean(r)) for r in rows]


@router.get("/models/{model_id}/quintiles", response_model=List[ModelQuintilePoint])
def get_model_quintiles(model_id: str, sector: str = "ALL"):
    """
    Return monthly quintile returns for a model.
    Default sector='ALL' returns the full-universe sort.
    """
    with get_db() as conn:
        rows = conn.execute(text("""
            SELECT date::text, sector, quintile, fwd_return
            FROM research.model_quintiles
            WHERE model_id = :mid AND sector = :sector
            ORDER BY date, quintile
        """), {"mid": model_id, "sector": sector}).fetchall()

    return [ModelQuintilePoint(**_clean(r)) for r in rows]


class ModelSignalStability(BaseModel):
    model_id: str
    sector: str
    rank_autocorr: Optional[float]
    q1_persistence: Optional[float]
    q5_persistence: Optional[float]
    avg_persistence: Optional[float]
    transition_matrix: Optional[list]   # 5×5 nested list
    n_pairs: Optional[int]


class ModelFeatureImportance(BaseModel):
    model_id: str
    feature: str
    mean_gini: Optional[float]
    mean_shap: Optional[float]
    shap_rank: Optional[int]


@router.get("/models/{model_id}/stability", response_model=List[ModelSignalStability])
def get_model_signal_stability(model_id: str):
    """
    Return signal stability metrics (rank autocorrelation + quintile transition matrices)
    for a model.  One row per sector; sector='ALL' = full-universe aggregate.
    """
    with get_db() as conn:
        rows = conn.execute(text("""
            SELECT model_id, sector, rank_autocorr, q1_persistence, q5_persistence,
                   avg_persistence, transition_matrix, n_pairs
            FROM research.model_signal_stability
            WHERE model_id = :mid
            ORDER BY sector
        """), {"mid": model_id}).fetchall()
    if not rows:
        raise HTTPException(status_code=404,
                            detail=f"No stability data for '{model_id}'. Run compute_research_tables.py first.")
    result = []
    for r in rows:
        d = _clean(r)
        # transition_matrix is stored as JSONB — already a Python list from psycopg2
        if d.get("transition_matrix") is not None and isinstance(d["transition_matrix"], str):
            import json as _json
            d["transition_matrix"] = _json.loads(d["transition_matrix"])
        result.append(ModelSignalStability(**d))
    return result


@router.get("/models/{model_id}/feature-importance", response_model=List[ModelFeatureImportance])
def get_model_feature_importance(model_id: str):
    """
    Return aggregated feature importance (mean Gini + mean |SHAP|) for a model,
    ranked by SHAP descending.  Run compute_feature_importance.py to populate.
    """
    with get_db() as conn:
        rows = conn.execute(text("""
            SELECT model_id, feature, mean_gini, mean_shap, shap_rank
            FROM research.model_feature_importance
            WHERE model_id = :mid
            ORDER BY shap_rank
        """), {"mid": model_id}).fetchall()
    if not rows:
        raise HTTPException(status_code=404,
                            detail=f"No feature importance for '{model_id}'. Run compute_feature_importance.py first.")
    return [ModelFeatureImportance(**_clean(r)) for r in rows]
