"""
Portfolio (Layer-2) backtest endpoints — the Research-Hub Portfolios surface.

Reads the Phase-0 registry (portfolio.backtest_meta + backtest_summary) plus portfolio.returns /
weights and secmaster. The registry is precomputed, so the browse grid, the Sweep Explorer, the
frontier and the base-vs-hard A/B are all derivable from ONE cheap /backtests call (121 small rows);
the frontend slices them client-side. Per-portfolio detail, holdings and sector allocation have their
own endpoints.

Endpoints (all under /api/v1/portfolio):
    GET /backtests                              filterable registry (meta + summary) — powers Browse/Sweep/Frontier/A-B
    GET /backtests/{label}                      one config: meta + monthly return/cumulative/drawdown series
    GET /backtests/{label}/holdings[?date=]     holdings at a rebalance (weights x secmaster); latest if no date
    GET /backtests/{label}/sector-allocation    portfolio sector weights at the latest rebalance

NOTE: everything served here is IN-SAMPLE (2005-2023). The 2024+ holdout is a separate sealed gate
(not exposed by this router). Active factor-exposure attribution + published-index overlays land in
Phase 4.
"""

from __future__ import annotations

import decimal
import math
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

from api.db import get_db

router = APIRouter(prefix="/api/v1/portfolio", tags=["portfolio"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _v(x) -> Optional[float]:
    """Decimal / NaN / None -> float or None (NaN is not valid JSON)."""
    if x is None:
        return None
    if isinstance(x, decimal.Decimal):
        return None if x.is_nan() else float(x)
    if isinstance(x, float) and math.isnan(x):
        return None
    return x


def _clean(row) -> dict:
    return {k: _v(v) for k, v in dict(row._mapping).items()}


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class BacktestRow(BaseModel):
    # meta
    model_label: str
    signal_model_id: Optional[str]
    universe: Optional[str]
    strategy: Optional[str]
    experiment: Optional[str]
    variant: Optional[str]
    lambda_risk: Optional[float]
    te_target: Optional[float]
    sector_tol: Optional[float]
    turnover_cap: Optional[float]
    benchmark_report: Optional[str]
    is_hard: Optional[bool]
    is_production: Optional[bool]
    is_legacy: Optional[bool]
    ab_twin: Optional[str]
    # summary
    n_months: Optional[int]
    period_start: Optional[str]
    period_end: Optional[str]
    ann_active: Optional[float]
    ann_total_net: Optional[float]
    ir: Optional[float]
    sharpe_net: Optional[float]
    realized_te: Optional[float]
    pred_te: Optional[float]
    max_drawdown: Optional[float]
    avg_turnover: Optional[float]
    tc_drag_bps: Optional[float]
    avg_holdings: Optional[float]
    opt_pct: Optional[float]
    inacc_pct: Optional[float]
    held_pct: Optional[float]
    hit_rate: Optional[float]


class MonthlyPoint(BaseModel):
    date: str
    portfolio_net: Optional[float]
    benchmark: Optional[float]
    active_return: Optional[float]
    turnover: Optional[float]
    tc_cost: Optional[float]
    n_stocks: Optional[int]
    optimizer_status: Optional[str]
    cum_portfolio: Optional[float]     # base 100, net
    cum_benchmark: Optional[float]     # base 100
    drawdown: Optional[float]          # of cum_portfolio


class BacktestDetail(BaseModel):
    meta: BacktestRow
    monthly: List[MonthlyPoint]


class Holding(BaseModel):
    isin: str
    name: Optional[str]
    ticker: Optional[str]
    sector: Optional[str]
    weight: Optional[float]
    prev_weight: Optional[float]
    trade_pct: Optional[float]
    benchmark_weight: Optional[float] = None    # cap-weight in the universe (long-only only)
    active_weight: Optional[float] = None        # weight - benchmark_weight


class SectorWeight(BaseModel):
    sector: Optional[str]
    weight: Optional[float]
    benchmark_weight: Optional[float] = None     # cap-weighted benchmark sector weight (long-only)
    active_weight: Optional[float] = None         # weight - benchmark_weight (over/underweight)


_ROW_COLS = """
    m.model_label, m.signal_model_id, m.universe, m.strategy, m.experiment, m.variant,
    m.lambda_risk, m.te_target, m.sector_tol, m.turnover_cap, m.benchmark_report,
    m.is_hard, m.is_production, m.is_legacy, m.ab_twin,
    s.n_months, s.period_start::text AS period_start, s.period_end::text AS period_end,
    s.ann_active, s.ann_total_net, s.ir, s.sharpe_net, s.realized_te, s.pred_te,
    s.max_drawdown, s.avg_turnover, s.tc_drag_bps, s.avg_holdings,
    s.opt_pct, s.inacc_pct, s.held_pct, s.hit_rate
"""


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/backtests", response_model=List[BacktestRow])
def list_backtests(
    universe: Optional[str] = Query(None, description="sp500 | r2500"),
    strategy: Optional[str] = Query(None, description="long_only | long_short"),
    variant: Optional[str] = Query(None, description="bare | base | hard"),
    experiment: Optional[str] = Query(None, description="prod | sweep | sector | te | phase5 | ls"),
    model: Optional[str] = Query(None, description="signal model id, e.g. N014 / NR002"),
    include_legacy: bool = Query(False, description="include the invalidated M-series"),
):
    """The full registry (meta + summary), filterable. Powers Browse, the Sweep Explorer, the frontier
    and the base-vs-hard A/B — all sliced client-side from this one list."""
    conds, params = [], {}
    if not include_legacy:
        conds.append("NOT m.is_legacy")
    for col, val in (("universe", universe), ("strategy", strategy), ("variant", variant),
                     ("experiment", experiment), ("signal_model_id", model)):
        if val:
            conds.append(f"m.{col} = :{col}")
            params[col] = val
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    sql = text(f"""
        SELECT {_ROW_COLS}
        FROM portfolio.backtest_meta m
        JOIN portfolio.backtest_summary s USING (model_label)
        {where}
        ORDER BY m.universe, m.signal_model_id, m.experiment, m.variant, s.ir DESC NULLS LAST
    """)
    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [BacktestRow(**_clean(r)) for r in rows]


@router.get("/backtests/{label}", response_model=BacktestDetail)
def get_backtest(label: str):
    """One config: its meta row + full monthly series with cumulative (base 100) and drawdown."""
    with get_db() as conn:
        meta = conn.execute(text(f"""
            SELECT {_ROW_COLS}
            FROM portfolio.backtest_meta m
            JOIN portfolio.backtest_summary s USING (model_label)
            WHERE m.model_label = :label
        """), {"label": label}).fetchone()
        if meta is None:
            raise HTTPException(status_code=404, detail=f"Backtest '{label}' not found in registry.")
        rows = conn.execute(text("""
            SELECT date, portfolio_net, benchmark, turnover, tc_cost, n_stocks, optimizer_status
            FROM portfolio.returns
            WHERE model_label = :label AND portfolio_net IS NOT NULL AND benchmark IS NOT NULL
            ORDER BY date
        """), {"label": label}).fetchall()

    monthly, cum_p, cum_b, peak = [], 100.0, 100.0, 100.0
    for r in rows:
        d = dict(r._mapping)
        pn, bm = _v(d["portfolio_net"]), _v(d["benchmark"])
        if pn is not None:
            cum_p *= (1 + pn)
        if bm is not None:
            cum_b *= (1 + bm)
        peak = max(peak, cum_p)
        monthly.append(MonthlyPoint(
            date=d["date"].isoformat() if hasattr(d["date"], "isoformat") else str(d["date"]),
            portfolio_net=pn, benchmark=bm,
            active_return=(pn - bm) if (pn is not None and bm is not None) else None,
            turnover=_v(d["turnover"]), tc_cost=_v(d["tc_cost"]), n_stocks=d.get("n_stocks"),
            optimizer_status=d.get("optimizer_status"),
            cum_portfolio=round(cum_p, 3), cum_benchmark=round(cum_b, 3),
            drawdown=round(cum_p / peak - 1, 4),
        ))
    return BacktestDetail(meta=BacktestRow(**_clean(meta)), monthly=monthly)


def _latest_weight_date(conn, label: str):
    row = conn.execute(text("SELECT max(date) FROM portfolio.weights WHERE model_label = :label"),
                       {"label": label}).fetchone()
    return row[0] if row else None


def _meta_uni_strat(conn, label: str):
    """(universe, strategy) for a backtest label, or (None, None)."""
    row = conn.execute(text("SELECT universe, strategy FROM portfolio.backtest_meta WHERE model_label = :l"),
                       {"l": label}).fetchone()
    return (row[0], row[1]) if row else (None, None)


def _benchmark_rows(conn, universe: Optional[str], d):
    """Raw cap-weighted benchmark constituents at rebalance date `d` — list of (isin, sector, marketcap).

    SP500 = the index members live on that date (secmaster.constituents); R2500 = the mcap-rank 501–3000
    band (research.r2500_band, latest band date on-or-before d). Market cap from clean.prices (millions;
    the unit cancels in the weight ratio). A date-equality bind lets the price hypertable prune chunks.

    NOTE: the date bind is given DISTINCT names per occurrence — pg8000 (the Windows dev driver) miscounts
    a named param that repeats in one query; psycopg2 (droplet) is fine either way. See CLAUDE.md 'DB Driver'."""
    if universe == "sp500":
        sql = text("""
            SELECT c.isin, sec.sector, p.marketcap AS mcap
            FROM secmaster.constituents c
            JOIN clean.prices p ON p.isin = c.isin AND p.date = :d_price
            LEFT JOIN secmaster.securities sec ON sec.isin = c.isin
            WHERE c.start_date <= :d_start AND (c.end_date IS NULL OR c.end_date >= :d_end)
              AND p.marketcap > 0
        """)
        params = {"d_price": d, "d_start": d, "d_end": d}
    elif universe == "r2500":
        sql = text("""
            SELECT b.isin, sec.sector, p.marketcap AS mcap
            FROM research.r2500_band b
            JOIN clean.prices p ON p.isin = b.isin AND p.date = :d_price
            LEFT JOIN secmaster.securities sec ON sec.isin = b.isin
            WHERE b.date = (SELECT max(date) FROM research.r2500_band WHERE date <= :d_band)
              AND b.mcap_rank BETWEEN 501 AND 3000
              AND p.marketcap > 0
        """)
        params = {"d_price": d, "d_band": d}
    else:
        return []
    return conn.execute(sql, params).fetchall()


def _benchmark_weights(rows) -> dict:
    """{isin: cap-weight} (sums to 1) from _benchmark_rows output."""
    total = sum(float(r[2]) for r in rows)
    if total <= 0:
        return {}
    return {r[0]: float(r[2]) / total for r in rows}


def _benchmark_sector_weights(rows) -> dict:
    """{sector: cap-weight} (sums to 1) from _benchmark_rows output."""
    total = sum(float(r[2]) for r in rows)
    if total <= 0:
        return {}
    out: dict = {}
    for _isin, sector, mcap in rows:
        out[sector] = out.get(sector, 0.0) + float(mcap) / total
    return out


@router.get("/backtests/{label}/holdings", response_model=List[Holding])
def get_holdings(label: str, date: Optional[str] = Query(None, description="rebalance date; latest if omitted"),
                 limit: int = Query(100, ge=1, le=600)):
    """Holdings at a rebalance (portfolio.weights x secmaster for name/ticker/sector), largest first.
    Long-only rows also carry the per-name cap-weighted benchmark weight and the active weight
    (weight - benchmark). L/S is market-neutral vs cash, so benchmark/active are left null."""
    with get_db() as conn:
        uni, strat = _meta_uni_strat(conn, label)
        d = date or _latest_weight_date(conn, label)
        if d is None:
            raise HTTPException(status_code=404, detail=f"No weights for '{label}'.")
        rows = conn.execute(text("""
            SELECT w.isin, s.name, s.ticker_current AS ticker, s.sector,
                   w.weight, w.prev_weight, w.trade_pct
            FROM portfolio.weights w
            LEFT JOIN secmaster.securities s ON s.isin = w.isin
            WHERE w.model_label = :label AND w.date = :d
            ORDER BY w.weight DESC
            LIMIT :lim
        """), {"label": label, "d": d, "lim": limit}).fetchall()
        bench = _benchmark_weights(_benchmark_rows(conn, uni, d)) if strat != "long_short" else {}

    out = []
    for r in rows:
        h = _clean(r)
        if bench:
            bw = bench.get(h["isin"], 0.0)      # held but not in the index -> 0% benchmark, fully active
            h["benchmark_weight"] = bw
            h["active_weight"] = (h["weight"] - bw) if h.get("weight") is not None else None
        out.append(Holding(**h))
    return out


@router.get("/backtests/{label}/sector-allocation", response_model=List[SectorWeight])
def get_sector_allocation(label: str, date: Optional[str] = Query(None)):
    """Portfolio sector weights (sum of holding weights by GICS sector) at a rebalance; latest if omitted.
    Long-only also returns the cap-weighted benchmark sector weight + active tilt (over/underweight), so
    the report can draw portfolio-vs-benchmark bars. L/S returns net (long-short) exposure, no benchmark.
    (Barra factor-exposure attribution arrives in Phase 4.)"""
    with get_db() as conn:
        uni, strat = _meta_uni_strat(conn, label)
        d = date or _latest_weight_date(conn, label)
        if d is None:
            raise HTTPException(status_code=404, detail=f"No weights for '{label}'.")
        rows = conn.execute(text("""
            SELECT s.sector, sum(w.weight) AS weight
            FROM portfolio.weights w
            LEFT JOIN secmaster.securities s ON s.isin = w.isin
            WHERE w.model_label = :label AND w.date = :d
            GROUP BY s.sector
        """), {"label": label, "d": d}).fetchall()
        bench_sec = _benchmark_sector_weights(_benchmark_rows(conn, uni, d)) if strat != "long_short" else {}

    port = {r[0]: _v(r[1]) for r in rows}
    out = []
    for sec in set(port) | set(bench_sec):
        pw, bw = port.get(sec), bench_sec.get(sec)
        if pw is None and bw is not None:
            pw = 0.0                                       # a benchmark sector the portfolio skips = 0% held
        aw = (pw or 0.0) - (bw or 0.0) if (pw is not None or bw is not None) else None
        out.append(SectorWeight(sector=sec, weight=pw, benchmark_weight=bw, active_weight=aw))
    out.sort(key=lambda x: (x.weight if x.weight is not None else -1e9), reverse=True)
    return out
