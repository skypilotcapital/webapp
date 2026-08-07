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


# Collateral haircut for the market-neutral (L/S) credited convention — the broker's cut on interest
# paid on posted collateral. Matches the /credited-return default (50 bps/yr) and the frontend.
CREDIT_HAIRCUT_ANN = 0.005


def _add_credited(d: dict) -> dict:
    """Single source for the collateral-credited L/S convention used by BOTH the browse grid and the
    per-backtest report. The stored `ann_active` is net-vs-cash (port−cost−rf); a market-neutral book
    also earns RF on its posted collateral, which cancels the cash hurdle (less a small haircut). So:
        excess over cash (credited) = ann_active + rf − haircut
        total return (incl. cash)   = excess + rf = ann_active + 2·rf − haircut
        IR (credited)               = excess / realized_te   (arithmetic, like the stored `ir`)
    Long-only rows are left null (they benchmark to the equity index, not cash)."""
    rf = d.get("avg_rf_ann")
    if d.get("strategy") == "long_short" and d.get("ann_active") is not None and rf is not None:
        excess = d["ann_active"] + rf - CREDIT_HAIRCUT_ANN
        d["ann_credited"] = excess
        d["ann_total_credited"] = d["ann_active"] + 2 * rf - CREDIT_HAIRCUT_ANN
        te = d.get("realized_te")
        d["ir_credited"] = (excess / te) if te else None
    return d


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
    # collateral-credited convention (L/S only; null for long-only) — see _add_credited
    avg_rf_ann: Optional[float] = None
    ann_credited: Optional[float] = None            # excess over cash, credited (the alpha)
    ann_total_credited: Optional[float] = None      # total return incl. cash on collateral
    ir_credited: Optional[float] = None


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


class TargetBookRow(BaseModel):
    isin: str
    ticker: Optional[str]
    name: Optional[str]
    sector: Optional[str]
    side: str                                     # 'long' | 'short'
    target_weight: float                          # signed portfolio weight (+ long, - short)
    target_notional_usd: float                    # signed = target_weight * AUM (dollars)
    ref_price: Optional[float] = None             # close at the formation date (informational only)
    ref_shares: Optional[int] = None              # round(|notional| / ref_price) — a formation-price hint;
                                                  # the executor should size from LIVE quotes, not this


class TargetBook(BaseModel):
    """The latest-rebalance TARGET portfolio for a strategy, scaled to a trade AUM — the hand-off
    contract the IBKR paper-trading pipeline consumes. Signed weights (net-long extension book), per-name
    dollar notionals, and reference (formation-date) prices/shares. NOT a trade list: the executor
    diffs this against live IBKR positions and applies its own min-trade / rounding / borrow logic."""
    model_label: str
    universe: Optional[str]
    strategy: Optional[str]
    formation_date: str                           # the rebalance the weights were formed at
    aum_usd: float
    n_positions: int
    n_long: int
    n_short: int
    gross_weight: float                           # sum |w|  (≈2.0 for a 150/50 extension)
    net_weight: float                             # sum w    (≈1.0, net-long)
    rows: List[TargetBookRow]


class AttrSummaryRow(BaseModel):
    factor: str
    factor_group: Optional[str]
    avg_active_exposure: Optional[float]
    ann_ret_contrib: Optional[float]              # annualized realized return contribution
    pct_active_return: Optional[float]            # share of total active return
    contrib_tstat: Optional[float]
    pct_active_variance: Optional[float]          # avg share of active variance (ex-ante)
    n_months: Optional[int]


class AttrExposure(BaseModel):
    factor: str
    factor_group: Optional[str]
    active_exposure: Optional[float]


class AttributionResponse(BaseModel):
    summary: List[AttrSummaryRow]                 # per factor incl 'specific' + 'total'
    latest_date: Optional[str]
    latest_exposures: List[AttrExposure]          # ex-ante active exposures at the latest rebalance


class AttrCumPoint(BaseModel):
    date: str
    specific: Optional[float]                      # cumulative (arithmetic) return contribution by group
    market: Optional[float]
    sector: Optional[float]
    style: Optional[float]
    total: Optional[float]


class CostBridgeSummary(BaseModel):
    aum_musd: Optional[float]
    n_months: Optional[int]
    ann_gross_active: Optional[float]              # gross active return (cost-free), annualized
    ann_spread_drag: Optional[float]               # annualized cost drags (positive = a cost)
    ann_impact_drag: Optional[float]
    ann_commission_drag: Optional[float]
    ann_borrow_drag: Optional[float]
    ann_total_cost: Optional[float]
    ann_net_active: Optional[float]                # = gross − total cost
    ir_gross: Optional[float]
    ir_net: Optional[float]
    avg_spread_bps: Optional[float]                # trade-weighted one-way bps by component
    avg_impact_bps: Optional[float]
    avg_commission_bps: Optional[float]
    avg_eff_bps: Optional[float]                   # total one-way per traded dollar
    avg_turnover: Optional[float]
    pct_gross_kept: Optional[float]                # net / gross
    avg_rf_ann: Optional[float] = None             # avg RF on collateral, annualized (L/S waterfall → total)


class CostBridgePoint(BaseModel):
    date: str
    cum_gross: Optional[float]                     # cumulative (arithmetic) gross active return
    cum_net: Optional[float]                       # cumulative net active return
    cum_cost: Optional[float]                      # cumulative total cost drag


class CostAttributionResponse(BaseModel):
    summary: CostBridgeSummary
    monthly: List[CostBridgePoint]


# --- L/S contribution-by-source (long/short/collateral, raw + beta-adjusted selection) ------
class SourceAttrPoint(BaseModel):
    date: str
    long_leg: Optional[float]; short_leg: Optional[float]        # RAW legs (beta-dominated)
    long_sel: Optional[float]; short_sel: Optional[float]; market: Optional[float]  # SELECTION view
    collateral: Optional[float]; cost: Optional[float]           # shared
    gross_long: Optional[float]; gross_short: Optional[float]    # exposure per side
    net_rc: Optional[float] = None                               # book net under the realistic cost model
    credited_tot: Optional[float]


class SourceAttrSummary(BaseModel):
    n_months: int
    # full-period annualized %/yr contributions; raw legs + selection both reconcile to credited_tot
    long_leg: Optional[float]; short_leg: Optional[float]
    long_sel: Optional[float]; short_sel: Optional[float]; market: Optional[float]
    collateral: Optional[float]; cost: Optional[float]; credited_tot: Optional[float]
    net_rc: Optional[float] = None
    gross_long_avg: Optional[float]; gross_short_avg: Optional[float]


class SourceAttributionResponse(BaseModel):
    summary: SourceAttrSummary
    monthly: List[SourceAttrPoint]


# --- F2: long-short neutrality (dollar & beta over time) ---------------------
class NeutralityPoint(BaseModel):
    date: str
    net_dollar: Optional[float]                    # Σ wᵢ  (≈ 0 by the dollar-neutral constraint)
    net_beta: Optional[float]                      # Σ wᵢ·βᵢ (raw 60m market beta) — the one that matters


class NeutralitySummary(BaseModel):
    n_months: Optional[int]
    avg_net_dollar: Optional[float]
    avg_net_beta: Optional[float]
    max_abs_net_beta: Optional[float]


class NeutralityResponse(BaseModel):
    summary: NeutralitySummary
    monthly: List[NeutralityPoint]


# --- T9: collateral-credited investor return (long-short) --------------------
class CreditedSummary(BaseModel):
    n_months: Optional[int]
    haircut_bps: Optional[float]                   # collateral haircut assumption (annualized bps)
    ann_net_active: Optional[float]                # excess vs cash, current convention (charges the RF hurdle)
    ir_net_active: Optional[float]
    ann_credited: Optional[float]                  # collateral-credited investor excess (RF on collateral cancels the hurdle)
    ir_credited: Optional[float]
    avg_rf_ann: Optional[float]                    # avg risk-free credited on collateral (annualized)


class CreditedPoint(BaseModel):
    date: str
    cum_net_active: Optional[float]                # growth of 100, current (vs-cash) convention
    cum_credited: Optional[float]                  # growth of 100, collateral-credited convention


class CreditedResponse(BaseModel):
    summary: CreditedSummary
    monthly: List[CreditedPoint]


_ROW_COLS = """
    m.model_label, m.signal_model_id, m.universe, m.strategy, m.experiment, m.variant,
    m.lambda_risk, m.te_target, m.sector_tol, m.turnover_cap, m.benchmark_report,
    m.is_hard, m.is_production, m.is_legacy, m.ab_twin,
    s.n_months, s.period_start::text AS period_start, s.period_end::text AS period_end,
    s.ann_active, s.ann_total_net, s.ir, s.sharpe_net, s.realized_te, s.pred_te,
    s.max_drawdown, s.avg_turnover, s.tc_drag_bps, s.avg_holdings,
    s.opt_pct, s.inacc_pct, s.held_pct, s.hit_rate,
    (SELECT avg(r_rf.benchmark) * 12 FROM portfolio.returns r_rf
      WHERE r_rf.model_label = m.model_label) AS avg_rf_ann
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
    production: bool = Query(False, description="only the is_production finalists (the Live/Portfolios pair)"),
    include_v1: bool = Query(False, description="include pre-v2 (v1 risk-model) labels; default = v2 only"),
):
    """The full registry (meta + summary), filterable. Powers Browse, the Sweep Explorer, the frontier
    and the base-vs-hard A/B — all sliced client-side from this one list. `production=true` returns just
    the two is_production finalists (used by the Portfolios tracking landing)."""
    conds, params = [], {}
    if not include_legacy:
        conds.append("NOT m.is_legacy")
    if production:
        # is_production is the hand-curated "what's live" flag — authoritative. Skip the browse-grid
        # scoping filters below: the S&P 500 Extension production label is a `_full` materialized blend
        # and sits outside the _relcap/_v2 optimizer grid, so those filters would wrongly drop it.
        conds.append("m.is_production")
    elif not include_v1:
        # Default research surface: SP500 = the relative-cap re-lock grid (_relcap, 2026-07-26); R2500 =
        # the v2 risk-model grid (_v2). The old SP500 5%-cap grid (_v2_) is superseded — browsable via
        # include_v1=true alongside the retired v1 twins. Spent-holdout `_full` books are excluded here
        # (they belong to the Portfolios tracking pages, fetched by label).
        conds.append(r"(m.model_label LIKE '%\_relcap\_%' ESCAPE '\' OR (m.model_label LIKE '%\_v2\_%' ESCAPE '\' AND m.universe <> 'sp500'))")
        conds.append(r"m.model_label NOT LIKE '%\_full%' ESCAPE '\'")
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
    return [BacktestRow(**_add_credited(_clean(r))) for r in rows]


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
            SELECT date, portfolio_net, portfolio_net_rc, benchmark, turnover, tc_cost, n_stocks, optimizer_status
            FROM portfolio.returns
            WHERE model_label = :label AND portfolio_net IS NOT NULL AND benchmark IS NOT NULL
            ORDER BY date
        """), {"label": label}).fetchall()

    # Growth-of-100 basis. Long-only: net-active vs the (equity) benchmark. Long-short: the collateral-
    # credited TOTAL return (realistic-cost net spread + RF earned on collateral − haircut), so the curve,
    # its drawdown, and the +7.2% headline all share ONE basis; the benchmark line is the cash (RF) growth.
    is_ls = dict(meta._mapping).get("strategy") == "long_short"
    hc_m = CREDIT_HAIRCUT_ANN / 12.0
    monthly, cum_p, cum_b, peak = [], 100.0, 100.0, 100.0
    for r in rows:
        d = dict(r._mapping)
        pn, bm = _v(d["portfolio_net"]), _v(d["benchmark"])
        rc = _v(d.get("portfolio_net_rc"))
        if rc is None:
            rc = pn
        port_ret = (rc + bm - hc_m) if (is_ls and rc is not None and bm is not None) else pn
        if port_ret is not None:
            cum_p *= (1 + port_ret)
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
    return BacktestDetail(meta=BacktestRow(**_add_credited(_clean(meta))), monthly=monthly)


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


@router.get("/backtests/{label}/target-book", response_model=TargetBook)
def get_target_book(label: str,
                    aum_usd: float = Query(1_000_000, gt=0, description="trade AUM in dollars (IBKR paper default $1M)"),
                    date: Optional[str] = Query(None, description="rebalance date; latest if omitted"),
                    min_notional_usd: float = Query(0.0, ge=0, description="drop target positions below this $ size (0 = keep all)")):
    """The latest-rebalance TARGET book for a strategy, scaled to `aum_usd` — the clean hand-off the
    IBKR paper-trading pipeline picks up. Returns signed per-name weights, dollar notionals, side, and
    a reference (formation-date close) price + share hint. This is a TARGET, not a trade list: the
    executor reconciles it against live IBKR positions and applies its own min-trade / rounding / locate
    logic. Reference shares are formation-price only — size real orders from live quotes.

    Note: the book is refreshed only when the modeled-paper track is rebuilt (monthly). Until the Phase-B
    live-prediction path exists, `formation_date` is the latest available rebalance."""
    with get_db() as conn:
        uni, strat = _meta_uni_strat(conn, label)
        d = date or _latest_weight_date(conn, label)
        if d is None:
            raise HTTPException(status_code=404, detail=f"No weights for '{label}'.")
        rows = conn.execute(text("""
            SELECT w.isin, s.ticker_current AS ticker, s.name, s.sector,
                   w.weight, p.close AS ref_price
            FROM portfolio.weights w
            LEFT JOIN secmaster.securities s ON s.isin = w.isin
            LEFT JOIN clean.prices p ON p.isin = w.isin AND p.date = :d
            WHERE w.model_label = :label AND w.date = :d AND w.weight IS NOT NULL AND w.weight <> 0
            ORDER BY w.weight DESC
        """), {"label": label, "d": d}).fetchall()

    out, gross, net, n_long, n_short = [], 0.0, 0.0, 0, 0
    for r in rows:
        w = float(r._mapping["weight"])
        notional = w * aum_usd
        if abs(notional) < min_notional_usd:
            continue
        px = _v(r._mapping["ref_price"])
        shares = int(round(abs(notional) / px)) if px and px > 0 else None
        gross += abs(w); net += w
        if w >= 0:
            n_long += 1
        else:
            n_short += 1
        out.append(TargetBookRow(
            isin=r._mapping["isin"], ticker=r._mapping["ticker"], name=r._mapping["name"],
            sector=r._mapping["sector"], side=("long" if w >= 0 else "short"),
            target_weight=round(w, 8), target_notional_usd=round(notional, 2),
            ref_price=px, ref_shares=shares))

    return TargetBook(
        model_label=label, universe=uni, strategy=strat, formation_date=_iso(d), aum_usd=aum_usd,
        n_positions=len(out), n_long=n_long, n_short=n_short,
        gross_weight=round(gross, 6), net_weight=round(net, 6), rows=out)


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


# ---------------------------------------------------------------------------
# Factor attribution (Phase-4 item) — reads portfolio.attribution(_summary)
# ---------------------------------------------------------------------------

def _factor_group(f: str) -> str:
    if f == "market":
        return "Market"
    if f.startswith("sec_"):
        return "Sector"
    if f == "specific":
        return "Specific"
    if f == "total":
        return "Total"
    return "Style"


def _cum_group(f: str) -> str:
    """Collapse the 24 factors + specific into the 4 stacked-area buckets."""
    if f == "market":
        return "market"
    if f.startswith("sec_"):
        return "sector"
    if f == "specific":
        return "specific"
    return "style"


@router.get("/backtests/{label}/attribution", response_model=AttributionResponse)
def get_attribution(label: str):
    """Factor attribution for one backtest: the time-aggregated summary per factor (avg active exposure,
    annualized return contribution, % of active return, t-stat, % of active risk) — incl 'specific'
    (stock selection) and 'total' — plus the ex-ante active exposures at the latest rebalance."""
    with get_db() as conn:
        summ = conn.execute(text("""
            SELECT factor, factor_group, avg_active_exposure, ann_ret_contrib, pct_active_return,
                   contrib_tstat, pct_active_variance, n_months
            FROM portfolio.attribution_summary WHERE model_label = :l
        """), {"l": label}).fetchall()
        if not summ:
            raise HTTPException(status_code=404,
                                detail=f"No attribution for '{label}' (run scripts.build_attribution).")
        latest = conn.execute(text("SELECT max(date) FROM portfolio.attribution WHERE model_label = :l"),
                              {"l": label}).fetchone()[0]
        exps = conn.execute(text("""
            SELECT factor, active_exposure FROM portfolio.attribution
            WHERE model_label = :l AND date = :d AND active_exposure IS NOT NULL
        """), {"l": label, "d": latest}).fetchall() if latest else []
    return AttributionResponse(
        summary=[AttrSummaryRow(**_clean(r)) for r in summ],
        latest_date=latest.isoformat() if latest and hasattr(latest, "isoformat") else (str(latest) if latest else None),
        latest_exposures=[AttrExposure(factor=r[0], factor_group=_factor_group(r[0]),
                                       active_exposure=_v(r[1])) for r in exps],
    )


@router.get("/backtests/{label}/cost-attribution", response_model=CostAttributionResponse)
def get_cost_attribution(label: str, aum: float = Query(5.0, description="fund size in $M (default 5)")):
    """The NET-OF-COST return bridge for one backtest: gross active return minus each realistic cost
    component (spread / market impact / commission / borrow) = net active return, under the per-name
    trading cost model at `aum` $M. Distinct from /attribution (the factor / source-of-alpha split).
    Reads portfolio.cost_attribution_summary (+ the monthly series for the cumulative gross-vs-net chart).
    404 (section hidden) for labels without cost attribution at this AUM (e.g. legacy)."""
    with get_db() as conn:
        s = conn.execute(text("""
            SELECT aum_musd, n_months, ann_gross_active, ann_spread_drag, ann_impact_drag,
                   ann_commission_drag, ann_borrow_drag, ann_total_cost, ann_net_active,
                   ir_gross, ir_net, avg_spread_bps, avg_impact_bps, avg_commission_bps,
                   avg_eff_bps, avg_turnover, pct_gross_kept,
                   (SELECT avg(r_rf.benchmark) * 12 FROM portfolio.returns r_rf
                     WHERE r_rf.model_label = cs.model_label) AS avg_rf_ann
            FROM portfolio.cost_attribution_summary cs WHERE model_label = :l AND aum_musd = :a
        """), {"l": label, "a": aum}).fetchone()
        if s is None:
            raise HTTPException(status_code=404,
                                detail=f"No cost attribution for '{label}' at ${aum}M.")
        rows = conn.execute(text("""
            SELECT date, gross_active, net_active, total_cost FROM portfolio.cost_attribution
            WHERE model_label = :l AND aum_musd = :a ORDER BY date
        """), {"l": label, "a": aum}).fetchall()
    cum_g = cum_n = cum_c = 0.0
    monthly = []
    for r in rows:
        d = dict(r._mapping)
        cum_g += _v(d["gross_active"]) or 0.0
        cum_n += _v(d["net_active"]) or 0.0
        cum_c += _v(d["total_cost"]) or 0.0
        monthly.append(CostBridgePoint(
            date=d["date"].isoformat() if hasattr(d["date"], "isoformat") else str(d["date"]),
            cum_gross=round(cum_g, 5), cum_net=round(cum_n, 5), cum_cost=round(cum_c, 5)))
    return CostAttributionResponse(summary=CostBridgeSummary(**_clean(s)), monthly=monthly)


@router.get("/backtests/{label}/source-attribution", response_model=SourceAttributionResponse)
def get_source_attribution(label: str):
    """L/S contribution-by-source: RAW legs (long / short / collateral / −cost) AND beta-adjusted
    SELECTION (long-sel / short-sel / market / collateral / −cost), monthly + full-period annualized —
    both views reconcile to the credited total return. `cost` is a positive drag (subtract it).
    Reads portfolio.source_attribution; 404 for labels without it (long-only books)."""
    keys = ("long_leg", "short_leg", "long_sel", "short_sel", "market", "collateral", "cost",
            "gross_long", "gross_short", "net_rc", "credited_tot")
    with get_db() as conn:
        rows = conn.execute(text(f"""
            SELECT date, {', '.join(keys)} FROM portfolio.source_attribution
            WHERE model_label = :l ORDER BY date
        """), {"l": label}).fetchall()  # noqa: S608 — keys are a fixed literal tuple
    if not rows:
        raise HTTPException(status_code=404, detail=f"No source attribution for '{label}'.")
    dicts = [dict(r._mapping) for r in rows]
    monthly = [SourceAttrPoint(
        date=(d["date"].isoformat() if hasattr(d["date"], "isoformat") else str(d["date"])),
        **{k: _v(d[k]) for k in keys}) for d in dicts]
    n = len(dicts)
    def ann(k): return round(sum((_v(d[k]) or 0.0) for d in dicts) / n * 12, 5)
    def avg(k): return round(sum((_v(d[k]) or 0.0) for d in dicts) / n, 5)
    summary = SourceAttrSummary(
        n_months=n, long_leg=ann("long_leg"), short_leg=ann("short_leg"),
        long_sel=ann("long_sel"), short_sel=ann("short_sel"), market=ann("market"),
        collateral=ann("collateral"), cost=ann("cost"), credited_tot=ann("credited_tot"),
        net_rc=ann("net_rc"),
        gross_long_avg=avg("gross_long"), gross_short_avg=avg("gross_short"))
    return SourceAttributionResponse(summary=summary, monthly=monthly)


@router.get("/backtests/{label}/attribution/timeseries", response_model=List[AttrCumPoint])
def get_attribution_timeseries(label: str):
    """Cumulative (arithmetic) return contribution by group — Specific / Style / Sector / Market — for the
    stacked-area chart. Each period's contributions sum to that month's active return (exact); the running
    sum reconciles to the arithmetic cumulative active return."""
    with get_db() as conn:
        rows = conn.execute(text("""
            SELECT date, factor, ret_contrib FROM portfolio.attribution
            WHERE model_label = :l AND factor <> 'total'
            ORDER BY date
        """), {"l": label}).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No attribution for '{label}'.")
    per_date: dict = {}
    for d, f, rc in rows:
        key = d.isoformat() if hasattr(d, "isoformat") else str(d)
        g = per_date.setdefault(key, {"specific": 0.0, "market": 0.0, "sector": 0.0, "style": 0.0})
        g[_cum_group(f)] += (_v(rc) or 0.0)
    cum = {"specific": 0.0, "market": 0.0, "sector": 0.0, "style": 0.0}
    out = []
    for key in sorted(per_date):
        for k in cum:
            cum[k] += per_date[key][k]
        out.append(AttrCumPoint(date=key, specific=cum["specific"], market=cum["market"],
                                sector=cum["sector"], style=cum["style"],
                                total=cum["specific"] + cum["market"] + cum["sector"] + cum["style"]))
    return out


def _iso(d) -> str:
    return d.isoformat() if hasattr(d, "isoformat") else str(d)


def _ann(series: list) -> Optional[float]:
    """Annualize a monthly return stream (geometric)."""
    if not series:
        return None
    comp = 1.0
    for x in series:
        comp *= (1.0 + x)
    return comp ** (12.0 / len(series)) - 1.0


def _ir(series: list) -> Optional[float]:
    """Annualized information ratio = mean/std × √12 (population std)."""
    n = len(series)
    if n < 2:
        return None
    mean = sum(series) / n
    var = sum((x - mean) ** 2 for x in series) / n
    sd = var ** 0.5
    return (mean / sd) * (12 ** 0.5) if sd > 0 else None


@router.get("/backtests/{label}/neutrality", response_model=NeutralityResponse)
def get_neutrality(label: str):
    """F2 — the L/S book's neutrality over time: net dollar exposure (Σ wᵢ, held ≈ 0 by the dollar-neutral
    constraint) and net market beta (Σ wᵢ·βᵢ on raw 60-month betas). A dollar-neutral book can still carry
    beta if the long/short legs differ, so net beta is the one that matters — this SHOWS market-neutrality
    is real. Reads portfolio.weights ⋈ factor.risk_exposures.beta_60m; covers the full tracked window
    (betas run through 2026-06). 404 for labels without weights."""
    with get_db() as conn:
        rows = conn.execute(text("""
            SELECT w.date,
                   SUM(w.weight)               AS net_dollar,
                   SUM(w.weight * r.beta_60m)  AS net_beta
            FROM portfolio.weights w
            LEFT JOIN factor.risk_exposures r ON r.isin = w.isin AND r.date = w.date
            WHERE w.model_label = :l
            GROUP BY w.date
            ORDER BY w.date
        """), {"l": label}).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No weights for '{label}'.")
    monthly, betas, dollars = [], [], []
    for d, nd, nb in rows:
        ndv, nbv = _v(nd), _v(nb)
        monthly.append(NeutralityPoint(date=_iso(d), net_dollar=ndv, net_beta=nbv))
        if ndv is not None:
            dollars.append(ndv)
        if nbv is not None:
            betas.append(nbv)
    summary = NeutralitySummary(
        n_months=len(monthly),
        avg_net_dollar=(sum(dollars) / len(dollars)) if dollars else None,
        avg_net_beta=(sum(betas) / len(betas)) if betas else None,
        max_abs_net_beta=max((abs(b) for b in betas), default=None),
    )
    return NeutralityResponse(summary=summary, monthly=monthly)


@router.get("/backtests/{label}/credited-return", response_model=CreditedResponse)
def get_credited_return(label: str, haircut_bps: float = Query(50.0, description="collateral haircut, annualized bps")):
    """T9 — dual display for a market-neutral book. The primary metric (net active vs cash) charges the full
    RF hurdle; but a real MN implementation earns ~RF−haircut on its collateral + short proceeds, so the RF
    hurdle largely CANCELS and the honest investor excess ≈ raw alpha − haircut. Returns both cumulative
    lines. `haircut_bps` (default 50) is the single surfaced assumption — change it here or via the query.
    Long-short only (404 otherwise)."""
    with get_db() as conn:
        strat = conn.execute(text(
            "SELECT strategy FROM portfolio.backtest_meta WHERE model_label = :l"), {"l": label}).scalar()
        if strat != "long_short":
            raise HTTPException(status_code=404, detail="credited-return applies to long-short books only")
        rows = conn.execute(text("""
            SELECT date, COALESCE(portfolio_net_rc, portfolio_net) AS net, benchmark AS rf
            FROM portfolio.returns WHERE model_label = :l ORDER BY date
        """), {"l": label}).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No returns for '{label}'.")
    hc_m = haircut_bps / 1e4 / 12.0                 # monthly haircut on collateral
    na_stream, cr_stream, rf_stream = [], [], []
    monthly = []
    cum_na = cum_cr = 100.0
    for d, net, rf in rows:
        net = _v(net) or 0.0
        rf = _v(rf) or 0.0
        na = net - rf                               # net active vs cash (current convention)
        cr = net - hc_m                             # collateral-credited excess (= na + rf − haircut)
        na_stream.append(na); cr_stream.append(cr); rf_stream.append(rf)
        cum_na *= (1.0 + na); cum_cr *= (1.0 + cr)
        monthly.append(CreditedPoint(date=_iso(d), cum_net_active=round(cum_na, 4), cum_credited=round(cum_cr, 4)))
    n = len(rf_stream)
    summary = CreditedSummary(
        n_months=n, haircut_bps=haircut_bps,
        ann_net_active=_ann(na_stream), ir_net_active=_ir(na_stream),
        ann_credited=_ann(cr_stream), ir_credited=_ir(cr_stream),
        avg_rf_ann=(sum(rf_stream) / n * 12.0) if n else None,
    )
    return CreditedResponse(summary=summary, monthly=monthly)


# ---------------------------------------------------------------------------
# Extension (130/30) blend — the two-engine decomposition (strategy='ext')
# ---------------------------------------------------------------------------

class DecompositionSummary(BaseModel):
    n_months: int
    core_label: Optional[str]
    sleeve_label: Optional[str]
    k: Optional[float]
    ann_index: Optional[float]           # index (benchmark) return, annualized
    ann_core_alpha: Optional[float]      # core book net active vs the index
    ann_sleeve_alpha: Optional[float]    # k × L/S sleeve net active over cash (the overlay)
    ann_total: Optional[float]           # = index + core_alpha + sleeve_alpha (the blend total)


class DecompositionPoint(BaseModel):
    date: str
    cum_index: Optional[float]           # cumulative (arithmetic) contributions
    cum_core_alpha: Optional[float]
    cum_sleeve_alpha: Optional[float]
    cum_total: Optional[float]


class DecompositionResponse(BaseModel):
    summary: DecompositionSummary
    monthly: List[DecompositionPoint]


@router.get("/backtests/{label}/decomposition", response_model=DecompositionResponse)
def get_decomposition(label: str):
    """The two-engine decomposition for a 130/30 EXTENSION product (strategy='ext'): how the total return
    splits into index BETA + the equity core's SELECTION alpha + the L/S SLEEVE's alpha overlay, per month
    (cumulative arithmetic) + full-period annualized. Reads portfolio.blend_decomposition; 404 for any
    label that isn't an extension blend."""
    with get_db() as conn:
        rows = conn.execute(text("""
            SELECT date, index_ret, core_alpha, sleeve_alpha, core_label, sleeve_label, k
            FROM portfolio.blend_decomposition WHERE model_label = :l ORDER BY date
        """), {"l": label}).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No blend decomposition for '{label}' (not an extension).")
    d0 = dict(rows[0]._mapping)
    idx = [(_v(r._mapping["index_ret"]) or 0.0) for r in rows]
    ca = [(_v(r._mapping["core_alpha"]) or 0.0) for r in rows]
    sa = [(_v(r._mapping["sleeve_alpha"]) or 0.0) for r in rows]
    n = len(rows)
    cum_i = cum_c = cum_s = 0.0
    monthly = []
    for r, i_, c_, s_ in zip(rows, idx, ca, sa):
        cum_i += i_; cum_c += c_; cum_s += s_
        monthly.append(DecompositionPoint(
            date=_iso(r._mapping["date"]),
            cum_index=round(cum_i, 5), cum_core_alpha=round(cum_c, 5),
            cum_sleeve_alpha=round(cum_s, 5), cum_total=round(cum_i + cum_c + cum_s, 5)))
    summary = DecompositionSummary(
        n_months=n, core_label=d0["core_label"], sleeve_label=d0["sleeve_label"], k=_v(d0["k"]),
        ann_index=(sum(idx) / n * 12), ann_core_alpha=(sum(ca) / n * 12),
        ann_sleeve_alpha=(sum(sa) / n * 12),
        ann_total=((sum(idx) + sum(ca) + sum(sa)) / n * 12))
    return DecompositionResponse(summary=summary, monthly=monthly)


# --- Capital deployment (130/30 extension): where the dollars + leverage go, by sleeve --------
class DeploymentPoint(BaseModel):
    date: str
    core_long: Optional[float]      # core book long exposure (≈ 100% of capital)
    sleeve_long: Optional[float]    # + k · sleeve long
    sleeve_short: Optional[float]   # − k · sleeve short (negative)
    net: Optional[float]            # ≈ 100% net long
    gross: Optional[float]          # ≈ 100% + 2·k·sleeve_gross


class DeploymentSummary(BaseModel):
    k: Optional[float]
    core_long: Optional[float]
    sleeve_long: Optional[float]
    sleeve_short: Optional[float]
    net: Optional[float]
    gross: Optional[float]
    cash: Optional[float]           # uninvested capital (≈ 0 — the book is fully deployed & self-funded)


class DeploymentResponse(BaseModel):
    summary: DeploymentSummary
    monthly: List[DeploymentPoint]


@router.get("/backtests/{label}/deployment", response_model=DeploymentResponse)
def get_deployment(label: str):
    """Capital deployment for a 130/30 EXTENSION product — how $1 of capital + short-proceeds fund the
    two sleeves: Core long (≈100% of capital) + Sleeve long (k·) − Sleeve short (k·) = Net (≈100%),
    Gross (≈100%+2·k·sleeve). Cash ≈ 0 (fully invested, the sleeve self-funds via short proceeds).
    Aggregates the two COMPONENT books' weights (not the netted blend). 404 if not an extension."""
    with get_db() as conn:
        d = conn.execute(text(
            "SELECT core_label, sleeve_label, k FROM portfolio.blend_decomposition "
            "WHERE model_label = :l LIMIT 1"), {"l": label}).fetchone()
        if d is None:
            raise HTTPException(status_code=404, detail=f"No deployment for '{label}' (not an extension).")
        core_label, sleeve_label, k = d[0], d[1], float(d[2] or 0.5)

        def _agg(lbl):   # {date: (long, short)} from a label's weights
            rows = conn.execute(text("""
                SELECT date, sum(weight) FILTER (WHERE weight > 0) AS lng,
                       sum(weight) FILTER (WHERE weight < 0) AS sht
                FROM portfolio.weights WHERE model_label = :l GROUP BY date"""), {"l": lbl}).fetchall()
            return {r[0]: ((_v(r[1]) or 0.0), (_v(r[2]) or 0.0)) for r in rows}

        core, sleeve = _agg(core_label), _agg(sleeve_label)

    monthly = []
    for dt in sorted(set(core) & set(sleeve)):
        c_long, c_short = core[dt]
        s_long, s_short = sleeve[dt]
        core_long = c_long + c_short                 # core is long-only ⇒ ≈ c_long
        sl_long, sl_short = k * s_long, k * s_short   # sleeve enters at k
        net = core_long + sl_long + sl_short
        gross = abs(c_long) + abs(c_short) + abs(sl_long) + abs(sl_short)
        monthly.append(DeploymentPoint(
            date=_iso(dt), core_long=round(core_long, 5), sleeve_long=round(sl_long, 5),
            sleeve_short=round(sl_short, 5), net=round(net, 5), gross=round(gross, 5)))
    if not monthly:
        raise HTTPException(status_code=404, detail=f"No component weights for '{label}'.")
    last = monthly[-1]
    summary = DeploymentSummary(
        k=k, core_long=last.core_long, sleeve_long=last.sleeve_long, sleeve_short=last.sleeve_short,
        net=last.net, gross=last.gross, cash=round(max(0.0, 1.0 - (last.core_long or 0.0)), 5))
    return DeploymentResponse(summary=summary, monthly=monthly)


# ---------------------------------------------------------------------------
# Monthly attribution — the fund month-by-month, by component
# ---------------------------------------------------------------------------

class ComponentAttrPoint(BaseModel):
    """One month. `formation_date` is the rebalance the weights were formed at; `realized_month`
    ('YYYY-MM') is the calendar month the return was EARNED (formation + 1) — see the formation-vs-
    realization note in lib/portfolio.ts. All values are monthly decimal returns (0.0284 = +2.84%)."""
    formation_date: str
    realized_month: str
    # -- group 1: the fund. EXACT identity every month: active = core_alpha + sleeve_alpha.
    #    (Extension blends only; null in 'ls' mode, which has no core/sleeve split.)
    total_net: Optional[float] = None
    index_ret: Optional[float] = None
    active: Optional[float] = None
    core_alpha: Optional[float] = None
    sleeve_alpha: Optional[float] = None
    k: Optional[float] = None                       # the sleeve's weight in the blend (0.5 for 150/50)
    core_label: Optional[str] = None
    sleeve_label: Optional[str] = None
    # -- group 2: the L/S book on its OWN standalone cost basis. In 'ext' mode this describes the
    #    sleeve book at FULL weight — it does NOT sum to `sleeve_alpha` (a different cost lens; the
    #    gap is `sleeve_lens_delta` = sleeve_alpha − k·sleeve_net). In 'ls' mode it IS the book.
    #    `*_sel` are beta-adjusted vs the equal-weight R2500 universe: short_sel > 0 = shorts
    #    underperformed = good. `sleeve_cost` is a POSITIVE drag (subtract it).
    sleeve_net: Optional[float] = None
    sleeve_long_sel: Optional[float] = None
    sleeve_short_sel: Optional[float] = None
    sleeve_market: Optional[float] = None
    sleeve_collateral: Optional[float] = None
    sleeve_cost: Optional[float] = None
    sleeve_long_leg: Optional[float] = None
    sleeve_short_leg: Optional[float] = None
    sleeve_gross_long: Optional[float] = None
    sleeve_gross_short: Optional[float] = None
    sleeve_lens_delta: Optional[float] = None       # published for completeness; small (~14bp/mo avg)


class ComponentAttrYear(BaseModel):
    """One REALIZATION year. Every figure is an ARITHMETIC sum of that year's monthly returns — see
    the endpoint docstring for why compounding is not used here."""
    year: int
    n_months: int
    total_net: Optional[float] = None
    index_ret: Optional[float] = None
    active: Optional[float] = None
    core_alpha: Optional[float] = None
    sleeve_alpha: Optional[float] = None
    sleeve_net: Optional[float] = None
    sleeve_long_sel: Optional[float] = None
    sleeve_short_sel: Optional[float] = None
    sleeve_collateral: Optional[float] = None
    sleeve_cost: Optional[float] = None


class ComponentAttributionResponse(BaseModel):
    mode: str                                       # 'ext' (blend) | 'ls' (standalone long-short)
    monthly: List[ComponentAttrPoint]               # oldest → newest, trimmed to the last `months`
    annual: List[ComponentAttrYear]                 # ascending year, over the FULL history


# Columns read straight off portfolio.component_attribution_monthly (the view's own names are the
# response field names, so the rows map 1:1 through _clean).
_COMP_ATTR_COLS = (
    "total_net", "index_ret", "active", "core_alpha", "sleeve_alpha", "k", "core_label",
    "sleeve_label", "sleeve_net", "sleeve_long_sel", "sleeve_short_sel", "sleeve_market",
    "sleeve_collateral", "sleeve_cost", "sleeve_long_leg", "sleeve_short_leg",
    "sleeve_gross_long", "sleeve_gross_short", "sleeve_lens_delta",
)

# The subset that gets rolled up per year (labels and `k` are not summable; the gross-exposure and
# raw-leg columns are levels/beta-dominated and would mislead as an annual total).
_COMP_ATTR_ANNUAL_COLS = (
    "total_net", "index_ret", "active", "core_alpha", "sleeve_alpha",
    "sleeve_net", "sleeve_long_sel", "sleeve_short_sel", "sleeve_collateral", "sleeve_cost",
)


def _sum_or_none(vals: list) -> Optional[float]:
    """Arithmetic sum over the non-null values; None if the year has no value at all (so a column
    the view LEFT JOINed away stays null and renders 'n/a' rather than a misleading 0)."""
    present = [v for v in vals if v is not None]
    return round(sum(present), 10) if present else None      # 10dp = float dust gone, identity intact


@router.get("/backtests/{label}/component-attribution", response_model=ComponentAttributionResponse)
def get_component_attribution(
    label: str,
    months: int = Query(24, description="most recent N months of the monthly series; 0 or negative = all"),
):
    """Month-by-month return decomposition for one book — the 'Monthly attribution' report section.

    mode='ext' (an extension blend, strategy='ext') reads portfolio.component_attribution_monthly and
    returns TWO groups. Group 1 is the fund and holds the exact identity
    `active = core_alpha + sleeve_alpha` every month. Group 2 describes the L/S sleeve book on its OWN
    STANDALONE cost basis, at full weight — it is context for the Sleeve column, NOT a decomposition
    of it, and does not sum to `sleeve_alpha` (the gap is `sleeve_lens_delta`, ~14 bps/mo).

    mode='ls' (a standalone long-short book, no extension row) falls back to portfolio.source_attribution
    and returns the group-2 columns only, with `net_rc` as the headline (`sleeve_net`). Group 1 is null.

    `annual` rolls up by REALIZATION year using ARITHMETIC sums, not compounding — deliberately. The
    identity `active = core_alpha + sleeve_alpha` is additive per month, so it survives summation only
    if the roll-up is arithmetic; compounded yearly figures would not reconcile. `months` trims the
    MONTHLY series only (it is a display window); `annual` always covers the full history.
    404 if the label appears in neither source."""
    with get_db() as conn:
        rows = conn.execute(text(f"""
            SELECT formation_date::text AS formation_date, realized_month, {', '.join(_COMP_ATTR_COLS)}
            FROM portfolio.component_attribution_monthly
            WHERE model_label = :l
            ORDER BY formation_date
        """), {"l": label}).fetchall()  # noqa: S608 — _COMP_ATTR_COLS is a fixed literal tuple
        mode = "ext"
        if not rows:
            # Standalone L/S book: no blend row exists, so report its own source attribution. The
            # column aliases match the group-2 field names so both modes share one response model.
            mode = "ls"
            rows = conn.execute(text("""
                SELECT date::text                                    AS formation_date,
                       to_char(date + interval '1 month', 'YYYY-MM') AS realized_month,
                       net_rc      AS sleeve_net,
                       long_sel    AS sleeve_long_sel,
                       short_sel   AS sleeve_short_sel,
                       market      AS sleeve_market,
                       collateral  AS sleeve_collateral,
                       cost        AS sleeve_cost,
                       long_leg    AS sleeve_long_leg,
                       short_leg   AS sleeve_short_leg,
                       gross_long  AS sleeve_gross_long,
                       gross_short AS sleeve_gross_short
                FROM portfolio.source_attribution
                WHERE model_label = :l
                ORDER BY date
            """), {"l": label}).fetchall()
        if not rows:
            raise HTTPException(
                status_code=404,
                detail=f"No component attribution for '{label}' (not an extension blend or L/S book).")

    dicts = [_clean(r) for r in rows]

    # Annual roll-up over the FULL history, bucketed by realization year (the month the return was
    # earned), so calendar-year rows are true — same convention as the report's Annual Returns table.
    by_year: dict = {}
    for d in dicts:
        y = int(str(d["realized_month"])[:4])
        by_year.setdefault(y, []).append(d)
    annual = [
        ComponentAttrYear(year=y, n_months=len(ds),
                          **{c: _sum_or_none([d.get(c) for d in ds]) for c in _COMP_ATTR_ANNUAL_COLS})
        for y, ds in sorted(by_year.items())
    ]

    monthly = dicts[-months:] if months and months > 0 else dicts
    return ComponentAttributionResponse(
        mode=mode,
        monthly=[ComponentAttrPoint(**d) for d in monthly],
        annual=annual,
    )
