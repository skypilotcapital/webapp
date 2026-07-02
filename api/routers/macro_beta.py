"""Macro beta signal endpoints (two-state defense/normal model, v1.6).

Reads macro_signal.beta_signal_daily / beta_episodes / beta_signal_stats /
beta_dial_sim plus clean-layer freshness. All endpoints take ?universe=sp500|smid
(2026-07-02: SMID variant = same rules with the credit latch on HY OAS and the
Russell 2000 TR splice as the evaluation asset).
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import text

from api.db import get_db

router = APIRouter(prefix="/api/v1/macro-beta", tags=["macro-beta"])


# ------------------------------------------------------------------- models

class ComponentReading(BaseModel):
    key: str
    label: str
    group: str                    # 'cycle' | 'fast'
    value: Optional[float]
    threshold: Optional[float]
    direction: str                # 'bearish_above' | 'bearish_below'
    firing: Optional[bool]
    detail: Optional[str] = None


class LatestState(BaseModel):
    signal_date: str
    final_state: str
    state_since: Optional[str]
    days_in_state: Optional[int]
    defense_reasons: Optional[str]
    cycle_result: Optional[str]
    trend_vote: Optional[str]
    labor_vote: Optional[str]
    inflation_vote: Optional[str]
    credit_latch_on: bool
    vol_gate_on: bool
    credit_force: bool
    correction_channel: bool
    components: List[ComponentReading]
    model_version: str


class TimelinePoint(BaseModel):
    date: str
    state: str
    tr_level: Optional[float]


class ComponentHistoryPoint(BaseModel):
    date: str
    state: str
    trend_50_200_pct: Optional[float]
    trend_10m_pct: Optional[float]
    rv21_pct10y: Optional[float]
    credit_4_12_diff: Optional[float]
    claims_ratio_12m_low: Optional[float]
    sahm_gap: Optional[float]
    u3_vs_12mma: Optional[float]
    cpi_mom_z3m60m: Optional[float]


class EpisodeRow(BaseModel):
    peak_date: str
    trough_date: str
    recovered_date: Optional[str]
    depth: float
    dd_days: int
    defense_share: Optional[float]
    days_to_first_defense: Optional[int]
    recovery_days: Optional[int]
    recovery_defense_share: Optional[float]
    dd_threshold: Optional[float] = None


class StatRow(BaseModel):
    window: str
    metric: str
    value: Optional[float]


class DialPoint(BaseModel):
    date: str
    port_level: float
    bench_level: float


class DialSim(BaseModel):
    dial: float
    stats: Dict[str, Optional[float]]
    series: List[DialPoint]


class HealthItem(BaseModel):
    label: str
    max_date: Optional[str]
    lag_days: Optional[int]
    status: str


class RunStatus(BaseModel):
    flow: str
    step: str
    status: str
    started_at: datetime
    completed_at: Optional[datetime]
    rows_affected: Optional[int]
    error_msg: Optional[str]


class MacroBetaHealth(BaseModel):
    freshness: List[HealthItem]
    runs: List[RunStatus]


# ----------------------------------------------------------------- component spec
# Mirrors the FROZEN thresholds in pipeline/macro_beta_signal.py — display only.

UNIVERSE_PATTERN = "^(sp500|smid)$"
CREDIT_LABEL = {"sp500": "BBB OAS 4w−12w momentum (pp)",
                "smid": "HY OAS 4w−12w momentum (pp)"}

def _component_spec(universe: str):
    return [
        ("trend_50_200_pct", "S&P 500 trend (50d vs 200d MA)", "cycle", 0.0, "bearish_below"),
        ("claims_ratio_12m_low", "Initial claims vs 12m low", "cycle", 1.10, "bearish_above"),
        ("sahm_gap", "Unemployment Sahm gap", "cycle", 0.30, "bearish_above"),
        ("u3_vs_12mma", "U3 vs 12m average", "cycle", 0.0, "bearish_above"),
        ("cpi_mom_z3m60m", "CPI momentum z-score", "cycle", 0.0, "bearish_above"),
        ("credit_4_12_diff", CREDIT_LABEL[universe], "fast", 0.10, "bearish_above"),
        ("rv21_pct10y", "Realized vol percentile (10y)", "fast", 0.90, "bearish_above"),
        ("trend_10m_pct", "Price vs 10-month SMA", "fast", 0.0, "bearish_below"),
    ]


def _component_readings(row: dict, universe: str) -> List[ComponentReading]:
    out = []
    for key, label, group, threshold, direction in _component_spec(universe):
        value = row.get(key)
        firing = None
        if value is not None:
            firing = (float(value) > threshold if direction == "bearish_above"
                      else float(value) < threshold)
        out.append(ComponentReading(
            key=key, label=label, group=group,
            value=float(value) if value is not None else None,
            threshold=threshold, direction=direction, firing=firing,
        ))
    return out


# ----------------------------------------------------------------- endpoints

@router.get("/latest", response_model=LatestState)
def latest(universe: str = Query("sp500", pattern=UNIVERSE_PATTERN)):
    with get_db() as conn:
        row = conn.execute(text(
            """
            SELECT signal_date::text, final_state, defense_reasons, cycle_result,
                   trend_vote, labor_vote, inflation_vote,
                   credit_latch_on, vol_gate_on, credit_force, correction_channel,
                   trend_50_200_pct::float, trend_10m_pct::float, rv21::float,
                   rv21_pct10y::float, credit_oas_pp::float, credit_4_12_diff::float,
                   claims_ratio_12m_low::float, sahm_gap::float, u3_vs_12mma::float,
                   cpi_yoy::float, cpi_mom_z3m60m::float, model_version
            FROM macro_signal.beta_signal_daily
            WHERE universe = :u
            ORDER BY signal_date DESC LIMIT 1
            """
        ), {"u": universe}).mappings().first()
        state_row = conn.execute(text(
            """
            WITH runs AS (
                SELECT signal_date, final_state,
                       ROW_NUMBER() OVER (ORDER BY signal_date DESC) rn,
                       ROW_NUMBER() OVER (PARTITION BY final_state ORDER BY signal_date DESC) rns
                FROM macro_signal.beta_signal_daily
                WHERE universe = :u
            ), current_run AS (
                SELECT signal_date FROM runs
                WHERE final_state = (SELECT final_state FROM runs WHERE rn = 1)
                  AND rn = rns
            )
            SELECT MIN(signal_date)::text AS state_since, COUNT(*)::int AS days_in_state
            FROM current_run
            """
        ), {"u": universe}).mappings().first()

    d = dict(row)
    return LatestState(
        signal_date=d["signal_date"],
        final_state=d["final_state"],
        state_since=state_row["state_since"] if state_row else None,
        days_in_state=state_row["days_in_state"] if state_row else None,
        defense_reasons=d["defense_reasons"],
        cycle_result=d["cycle_result"],
        trend_vote=d["trend_vote"],
        labor_vote=d["labor_vote"],
        inflation_vote=d["inflation_vote"],
        credit_latch_on=d["credit_latch_on"],
        vol_gate_on=d["vol_gate_on"],
        credit_force=d["credit_force"],
        correction_channel=d["correction_channel"],
        components=_component_readings(d, universe),
        model_version=d["model_version"],
    )


@router.get("/timeline", response_model=List[TimelinePoint])
def timeline(universe: str = Query("sp500", pattern=UNIVERSE_PATTERN)):
    """Full-history regime timeline, weekly-downsampled (last obs per week)."""
    with get_db() as conn:
        rows = conn.execute(text(
            """
            SELECT DISTINCT ON (DATE_TRUNC('week', signal_date))
                   signal_date::text AS date, final_state AS state, tr_level::float
            FROM macro_signal.beta_signal_daily
            WHERE universe = :u
            ORDER BY DATE_TRUNC('week', signal_date), signal_date DESC
            """
        ), {"u": universe}).mappings().all()
    return [TimelinePoint(**r) for r in rows]


@router.get("/components-history", response_model=List[ComponentHistoryPoint])
def components_history(months: int = Query(24, ge=6, le=120),
                       universe: str = Query("sp500", pattern=UNIVERSE_PATTERN)):
    with get_db() as conn:
        rows = conn.execute(text(
            """
            SELECT signal_date::text AS date, final_state AS state,
                   trend_50_200_pct::float, trend_10m_pct::float, rv21_pct10y::float,
                   credit_4_12_diff::float, claims_ratio_12m_low::float,
                   sahm_gap::float, u3_vs_12mma::float, cpi_mom_z3m60m::float
            FROM macro_signal.beta_signal_daily
            WHERE universe = :u
              AND signal_date >= (SELECT MAX(signal_date)
                                  FROM macro_signal.beta_signal_daily
                                  WHERE universe = :u)
                                 - (:months || ' months')::interval
            ORDER BY signal_date
            """
        ), {"months": months, "u": universe}).mappings().all()
    return [ComponentHistoryPoint(**r) for r in rows]


@router.get("/episodes", response_model=List[EpisodeRow])
def episodes(universe: str = Query("sp500", pattern=UNIVERSE_PATTERN)):
    with get_db() as conn:
        rows = conn.execute(text(
            """
            SELECT peak_date::text, trough_date::text, recovered_date::text,
                   depth::float, dd_days, defense_share::float,
                   days_to_first_defense, recovery_days, recovery_defense_share::float,
                   dd_threshold::float
            FROM macro_signal.beta_episodes
            WHERE universe = :u
            ORDER BY peak_date
            """
        ), {"u": universe}).mappings().all()
    return [EpisodeRow(**r) for r in rows]


@router.get("/stats", response_model=List[StatRow])
def stats(universe: str = Query("sp500", pattern=UNIVERSE_PATTERN)):
    with get_db() as conn:
        rows = conn.execute(text(
            'SELECT stat_window AS "window", metric, value::float '
            "FROM macro_signal.beta_signal_stats WHERE universe = :u "
            "ORDER BY stat_window, metric"
        ), {"u": universe}).mappings().all()
    return [StatRow(**r) for r in rows]


@router.get("/dial-sim", response_model=List[DialSim])
def dial_sim(universe: str = Query("sp500", pattern=UNIVERSE_PATTERN)):
    """All dial simulations, monthly-downsampled, with their summary stats."""
    with get_db() as conn:
        series = conn.execute(text(
            """
            SELECT DISTINCT ON (dial, DATE_TRUNC('month', date))
                   dial::float, date::text, port_level::float, bench_level::float
            FROM macro_signal.beta_dial_sim
            WHERE universe = :u
            ORDER BY dial, DATE_TRUNC('month', date), date DESC
            """
        ), {"u": universe}).mappings().all()
        stat_rows = conn.execute(text(
            'SELECT stat_window AS "window", metric, value::float '
            "FROM macro_signal.beta_signal_stats "
            "WHERE universe = :u AND stat_window LIKE 'dial_%'"
        ), {"u": universe}).mappings().all()

    by_dial: Dict[float, List[DialPoint]] = {}
    for r in series:
        by_dial.setdefault(r["dial"], []).append(
            DialPoint(date=r["date"], port_level=r["port_level"],
                      bench_level=r["bench_level"]))
    stats_by_dial: Dict[float, Dict[str, Optional[float]]] = {}
    for r in stat_rows:
        dial = float(r["window"].replace("dial_", ""))
        stats_by_dial.setdefault(dial, {})[r["metric"]] = r["value"]

    return [
        DialSim(dial=dial, stats=stats_by_dial.get(dial, {}), series=points)
        for dial, points in sorted(by_dial.items())
    ]


@router.get("/health", response_model=MacroBetaHealth)
def health():
    with get_db() as conn:
        fresh = conn.execute(text(
            """
            SELECT 'Claims' AS label, MAX(data_date)::text AS max_date,
                   (CURRENT_DATE - MAX(data_date))::int AS lag_days
            FROM clean.claims_us
            UNION ALL
            SELECT 'Unemployment', MAX(data_date)::text,
                   (CURRENT_DATE - MAX(data_date))::int FROM clean.unemployment_us
            UNION ALL
            SELECT 'CPI', MAX(data_date)::text,
                   (CURRENT_DATE - MAX(data_date))::int FROM clean.cpi_us
            UNION ALL
            SELECT 'Credit (BBB + HY OAS)', MAX(date)::text,
                   (CURRENT_DATE - MAX(date))::int FROM clean.beta_credit_daily
            UNION ALL
            SELECT 'Market (S&P 500)', MAX(date)::text,
                   (CURRENT_DATE - MAX(date))::int FROM clean.beta_sp500_daily
            UNION ALL
            SELECT 'Market (Russell/SMID)', MAX(date)::text,
                   (CURRENT_DATE - MAX(date))::int FROM clean.beta_smid_daily
            """
        )).mappings().all()
        runs = conn.execute(text(
            """
            SELECT flow, step, status, started_at, completed_at, rows_affected, error_msg
            FROM pipeline.run_log
            WHERE flow = 'macro_beta'
            ORDER BY started_at DESC LIMIT 6
            """
        )).mappings().all()

    # Unemployment data_date is first-of-reference-month; normal staleness peaks ~66d
    limits = {"Claims": 21, "Unemployment": 70, "CPI": 60,
              "Credit (BBB + HY OAS)": 7, "Market (S&P 500)": 7,
              "Market (Russell/SMID)": 7}

    def status(label: str, lag: Optional[int]) -> str:
        if lag is None:
            return "unknown"
        return "ok" if lag <= limits.get(label, 30) else "stale"

    return MacroBetaHealth(
        freshness=[HealthItem(label=f["label"], max_date=f["max_date"],
                              lag_days=f["lag_days"],
                              status=status(f["label"], f["lag_days"]))
                   for f in fresh],
        runs=[RunStatus(**r) for r in runs],
    )
