"""
Portfolio Backtests endpoints.

Serves results from portfolio.returns written by run_layer2_backtest.py.

Endpoints:
    GET /api/v1/portfolio/backtests
        Summary row per backtest run with computed performance metrics.
        Sorted by config name.

    GET /api/v1/portfolio/backtests/{label}/returns
        Full monthly return series (portfolio_gross, portfolio_net, benchmark,
        turnover, tc_cost) for one backtest label.
"""

from __future__ import annotations

import decimal
import math
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from api.db import get_db


def _v(x) -> Optional[float]:
    """Convert Decimal / NaN / None → float or None."""
    if x is None:
        return None
    if isinstance(x, decimal.Decimal):
        if x.is_nan():
            return None
        return float(x)
    if isinstance(x, float) and math.isnan(x):
        return None
    return float(x)


router = APIRouter(prefix="/api/v1/portfolio", tags=["portfolio"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class BacktestSummary(BaseModel):
    label: str
    period_start: Optional[str]
    period_end: Optional[str]
    n_months: int
    # annualised returns
    ann_return_gross: Optional[float]
    ann_return_net: Optional[float]
    ann_return_benchmark: Optional[float]
    ann_excess_return: Optional[float]
    # risk / reward
    sharpe_gross: Optional[float]
    sharpe_net: Optional[float]
    information_ratio: Optional[float]
    tracking_error: Optional[float]
    max_drawdown: Optional[float]
    ann_volatility: Optional[float]
    hit_rate: Optional[float]
    # costs / turnover
    avg_monthly_turnover: Optional[float]
    avg_tc_drag_bps: Optional[float]
    # optimizer health
    n_optimal: int
    n_fallback: int


class BacktestMonthlyReturn(BaseModel):
    date: str
    portfolio_gross: Optional[float]
    portfolio_net: Optional[float]
    benchmark: Optional[float]
    active_return: Optional[float]       # portfolio_net - benchmark
    turnover: Optional[float]
    tc_cost: Optional[float]
    n_stocks: Optional[int]
    optimizer_status: Optional[str]
    # running cumulative indices (base 100)
    cum_portfolio: Optional[float]
    cum_benchmark: Optional[float]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _compute_summary(label: str, rows: list) -> BacktestSummary:
    """Compute performance metrics from raw monthly rows."""
    if not rows:
        raise HTTPException(status_code=404, detail=f"No data for '{label}'")

    # Only include months where both portfolio and benchmark have data (aligned)
    aligned = [r for r in rows if r["portfolio_gross"] is not None and r["benchmark"] is not None]
    if not aligned:
        raise HTTPException(status_code=404, detail=f"No valid returns for '{label}'")

    port_g = [_v(r["portfolio_gross"]) for r in aligned]
    port_n = [_v(r["portfolio_net"])   for r in aligned]
    bench  = [_v(r["benchmark"])       for r in aligned]

    n = len(port_n)

    n_years = n / 12

    def _ann(series: list[float]) -> float:
        cum = 1.0
        for r in series:
            cum *= (1 + r)
        return cum ** (1 / n_years) - 1

    def _std(series: list[float]) -> float:
        if len(series) < 2:
            return 0.0
        mean = sum(series) / len(series)
        var = sum((x - mean) ** 2 for x in series) / (len(series) - 1)
        return var ** 0.5

    def _maxdd(series: list[float]) -> float:
        cum = 1.0
        peak = 1.0
        worst = 0.0
        for r in series:
            cum *= (1 + r)
            peak = max(peak, cum)
            worst = min(worst, cum / peak - 1)
        return worst

    ann_g   = _ann(port_g)
    ann_n   = _ann(port_n)
    ann_b   = _ann(bench)
    excess  = [p - b for p, b in zip(port_n, bench)]
    ann_exc = ann_n - ann_b
    vol_n   = _std(port_n) * (12 ** 0.5)
    te      = _std(excess)  * (12 ** 0.5)
    sharpe_g = ann_g / vol_n if vol_n > 0 else None
    sharpe_n = ann_n / vol_n if vol_n > 0 else None
    ir       = ann_exc / te  if te   > 0 else None
    maxdd    = _maxdd(port_n)
    hit      = sum(1 for e in excess if e > 0) / len(excess)

    turnover = [_v(r["turnover"]) for r in rows if r["turnover"] is not None]
    tc_cost  = [_v(r["tc_cost"])  for r in rows if r["tc_cost"]  is not None]
    avg_to   = sum(turnover) / len(turnover) if turnover else None
    avg_tc   = sum(tc_cost)  / len(tc_cost)  * 10_000 if tc_cost else None  # → bps

    n_opt  = sum(1 for r in rows if r.get("optimizer_status") == "optimal")
    n_fall = sum(1 for r in rows if r.get("optimizer_status") == "fallback")

    dates = sorted(r["date"].isoformat() if hasattr(r["date"], "isoformat") else str(r["date"]) for r in rows)

    return BacktestSummary(
        label=label,
        period_start=dates[0]  if dates else None,
        period_end=dates[-1]   if dates else None,
        n_months=n,
        ann_return_gross=round(ann_g,   4),
        ann_return_net=round(ann_n,     4),
        ann_return_benchmark=round(ann_b, 4),
        ann_excess_return=round(ann_exc, 4),
        sharpe_gross=round(sharpe_g, 3) if sharpe_g is not None else None,
        sharpe_net=round(sharpe_n, 3)   if sharpe_n is not None else None,
        information_ratio=round(ir, 3)  if ir       is not None else None,
        tracking_error=round(te, 4),
        max_drawdown=round(maxdd, 4),
        ann_volatility=round(vol_n, 4),
        hit_rate=round(hit, 3),
        avg_monthly_turnover=round(avg_to, 4)   if avg_to is not None else None,
        avg_tc_drag_bps=round(avg_tc, 2)        if avg_tc is not None else None,
        n_optimal=n_opt,
        n_fallback=n_fall,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/backtests", response_model=List[BacktestSummary])
def list_backtests():
    """
    Return one summary row per backtest label in portfolio.returns.
    Performance metrics are computed on-the-fly from the monthly return series.
    """
    with get_db() as conn:
        labels = conn.execute(text("""
            SELECT DISTINCT model_label
            FROM portfolio.returns
            ORDER BY model_label
        """)).fetchall()

    if not labels:
        return []

    results = []
    for row in labels:
        label = row[0]
        with get_db() as conn:
            monthly = conn.execute(text("""
                SELECT date, portfolio_gross, portfolio_net, benchmark,
                       turnover, tc_cost, optimizer_status
                FROM portfolio.returns
                WHERE model_label = :label
                ORDER BY date
            """), {"label": label}).fetchall()

        rows_dicts = [dict(r._mapping) for r in monthly]
        try:
            results.append(_compute_summary(label, rows_dicts))
        except HTTPException:
            pass

    return results


@router.get("/backtests/{label}/returns", response_model=List[BacktestMonthlyReturn])
def get_backtest_returns(label: str):
    """
    Return full monthly return series for one backtest label, with
    running cumulative return indices (base 100) for charting.
    """
    with get_db() as conn:
        rows = conn.execute(text("""
            SELECT date, portfolio_gross, portfolio_net, benchmark,
                   turnover, tc_cost, n_stocks, optimizer_status
            FROM portfolio.returns
            WHERE model_label = :label
            ORDER BY date
        """), {"label": label}).fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail=f"No data for backtest '{label}'")

    # Only include months where both portfolio and benchmark have data
    rows = [r for r in rows if r._mapping["portfolio_gross"] is not None and r._mapping["benchmark"] is not None]

    result = []
    cum_p = 100.0
    cum_b = 100.0
    for r in rows:
        d = dict(r._mapping)
        pn = _v(d["portfolio_net"])
        bm = _v(d["benchmark"])
        if pn is not None:
            cum_p *= (1 + pn)
        if bm is not None:
            cum_b *= (1 + bm)
        active = (pn - bm) if (pn is not None and bm is not None) else None
        date_str = d["date"].isoformat() if hasattr(d["date"], "isoformat") else str(d["date"])
        result.append(BacktestMonthlyReturn(
            date=date_str,
            portfolio_gross=_v(d["portfolio_gross"]),
            portfolio_net=pn,
            benchmark=bm,
            active_return=active,
            turnover=_v(d["turnover"]),
            tc_cost=_v(d["tc_cost"]),
            n_stocks=d.get("n_stocks"),
            optimizer_status=d.get("optimizer_status"),
            cum_portfolio=round(cum_p, 2),
            cum_benchmark=round(cum_b, 2),
        ))

    return result
