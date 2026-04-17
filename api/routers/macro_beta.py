"""Macro beta signal endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from api.db import get_db

router = APIRouter(prefix="/api/v1/macro-beta", tags=["macro-beta"])


class LatestSignal(BaseModel):
    signal_date: str
    final_beta_target: str
    tier1_result: Optional[str]
    tier2_rsi: Optional[str]
    tier2_credit: Optional[str]
    sp500_50_200_spread_raw: Optional[float]
    sp500_50_200_spread_pct: Optional[float]
    pmi_3m12m_diff: Optional[float]
    cpi_mom_z3m60m: Optional[float]
    rsi_20: Optional[float]
    bbb_4_12_diff: Optional[float]


class SignalHistoryPoint(BaseModel):
    signal_date: str
    final_beta_target: str
    sp500_spot_date: Optional[str]
    sp500_spot_level: Optional[float]
    sp500_50_200_spread_pct: Optional[float]
    bbb_oas_bps: Optional[float]


class ChartPoint(BaseModel):
    signal_date: str
    final_beta_target: str
    sp500_spot_level: Optional[float]


class LatestInputs(BaseModel):
    signal_date: str
    pmi_data_date: Optional[str]
    pmi_release_date: Optional[str]
    mfg_pmi: Optional[float]
    cpi_data_date: Optional[str]
    cpi_release_date: Optional[str]
    cpi_level: Optional[float]
    sp500_date: Optional[str]
    sp500_level: Optional[float]
    sp500_spot_date: Optional[str]
    sp500_spot_level: Optional[float]
    credit_date: Optional[str]
    bbb_oas_decimal: Optional[float]
    bbb_oas_bps: Optional[float]


class RegimeRow(BaseModel):
    final_beta_target: str
    start_date: str
    end_date: str
    trading_days: int
    sp500_total_return: Optional[float]
    sp500_annualized_return: Optional[float]


class RegimeStats(BaseModel):
    final_beta_target: str
    regime_count: int
    days_in_state: int
    cumulative_return: Optional[float]
    annualized_return: Optional[float]


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


def _status_from_lag(label: str, lag_days: Optional[int]) -> str:
    if lag_days is None:
        return "unknown"
    if label in {"PMI", "CPI"}:
        return "ok" if lag_days <= 45 else "stale"
    return "ok" if lag_days <= 5 else "stale"


@router.get("/latest-signal", response_model=LatestSignal)
def latest_signal():
    with get_db() as conn:
        row = conn.execute(
            text(
                """
                SELECT signal_date::text, final_beta_target, tier1_result, tier2_rsi, tier2_credit,
                       sp500_50_200_spread_raw, sp500_50_200_spread_pct, pmi_3m12m_diff,
                       cpi_mom_z3m60m, rsi_20, bbb_4_12_diff
                FROM macro_signal.beta_signal_daily
                ORDER BY signal_date DESC
                LIMIT 1
                """
            )
        ).mappings().first()
    return LatestSignal(**row)


@router.get("/history", response_model=List[SignalHistoryPoint])
def history():
    with get_db() as conn:
        rows = conn.execute(
            text(
                """
                WITH history AS (
                    SELECT signal_date, final_beta_target, sp500_50_200_spread_pct
                    FROM macro_signal.beta_signal_daily
                    ORDER BY signal_date DESC
                    LIMIT 260
                )
                SELECT
                    h.signal_date::text,
                    h.final_beta_target,
                    spot.date::text AS sp500_spot_date,
                    spot.value::float AS sp500_spot_level,
                    h.sp500_50_200_spread_pct,
                    credit.bbb_oas_bps
                FROM (
                    SELECT *
                    FROM history
                    ORDER BY signal_date
                ) h
                LEFT JOIN LATERAL (
                    SELECT date, value
                    FROM raw.macro
                    WHERE series_id = 'SP500'
                      AND date <= h.signal_date
                    ORDER BY date DESC
                    LIMIT 1
                ) spot ON TRUE
                LEFT JOIN LATERAL (
                    SELECT bbb_oas_bps
                    FROM clean.beta_credit_daily
                    WHERE date <= h.signal_date
                    ORDER BY date DESC
                    LIMIT 1
                ) credit ON TRUE
                ORDER BY h.signal_date
                """
            )
        ).mappings().all()
    return [SignalHistoryPoint(**row) for row in rows]


@router.get("/chart", response_model=List[ChartPoint])
def chart():
    with get_db() as conn:
        rows = conn.execute(
            text(
                """
                WITH history AS (
                    SELECT signal_date, final_beta_target
                    FROM macro_signal.beta_signal_daily
                    ORDER BY signal_date DESC
                    LIMIT 260
                )
                SELECT
                    h.signal_date::text,
                    h.final_beta_target,
                    spot.value::float AS sp500_spot_level
                FROM (
                    SELECT *
                    FROM history
                    ORDER BY signal_date
                ) h
                LEFT JOIN LATERAL (
                    SELECT value
                    FROM raw.macro
                    WHERE series_id = 'SP500'
                      AND date <= h.signal_date
                    ORDER BY date DESC
                    LIMIT 1
                ) spot ON TRUE
                ORDER BY h.signal_date
                """
            )
        ).mappings().all()
    return [ChartPoint(**row) for row in rows]


@router.get("/latest-inputs", response_model=LatestInputs)
def latest_inputs():
    with get_db() as conn:
        row = conn.execute(
            text(
                """
                SELECT
                    b.signal_date::text,
                    b.pmi_data_date::text,
                    b.pmi_release_date::text,
                    b.mfg_pmi,
                    b.cpi_data_date::text,
                    b.cpi_release_date::text,
                    b.cpi_level,
                    b.sp500_date::text,
                    b.sp500_level,
                    spot.date::text AS sp500_spot_date,
                    spot.value::float AS sp500_spot_level,
                    b.credit_date::text,
                    b.bbb_oas_decimal,
                    credit.bbb_oas_bps
                FROM macro_signal.beta_signal_daily b
                LEFT JOIN LATERAL (
                    SELECT date, value
                    FROM raw.macro
                    WHERE series_id = 'SP500'
                      AND date <= b.signal_date
                    ORDER BY date DESC
                    LIMIT 1
                ) spot ON TRUE
                LEFT JOIN LATERAL (
                    SELECT bbb_oas_bps
                    FROM clean.beta_credit_daily
                    WHERE date <= b.signal_date
                    ORDER BY date DESC
                    LIMIT 1
                ) credit ON TRUE
                ORDER BY b.signal_date DESC
                LIMIT 1
                """
            )
        ).mappings().first()
    return LatestInputs(**row)


@router.get("/regimes", response_model=List[RegimeRow])
def regimes():
    with get_db() as conn:
        rows = conn.execute(
            text(
                """
                SELECT final_beta_target, start_date::text, end_date::text, trading_days,
                       sp500_total_return, sp500_annualized_return
                FROM macro_signal.beta_regimes
                ORDER BY start_date DESC
                LIMIT 50
                """
            )
        ).mappings().all()
    return [RegimeRow(**row) for row in rows]


@router.get("/regime-stats", response_model=List[RegimeStats])
def regime_stats():
    with get_db() as conn:
        rows = conn.execute(
            text(
                """
                WITH regime_counts AS (
                    SELECT final_beta_target, COUNT(*)::int AS regime_count
                    FROM macro_signal.beta_regimes
                    GROUP BY final_beta_target
                ),
                state_days AS (
                    SELECT
                        final_beta_target,
                        COUNT(*)::int AS days_in_state,
                        EXP(SUM(LN(1 + daily_return))) - 1 AS cumulative_return
                    FROM (
                        SELECT
                            final_beta_target,
                            CASE
                                WHEN prev_level IS NULL OR prev_level = 0 THEN NULL
                                ELSE (sp500_level / prev_level) - 1
                            END AS daily_return
                        FROM (
                            SELECT
                                signal_date,
                                final_beta_target,
                                sp500_level,
                                LAG(sp500_level) OVER (ORDER BY signal_date) AS prev_level
                            FROM macro_signal.beta_signal_daily
                        ) base
                    ) x
                    WHERE daily_return IS NOT NULL
                    GROUP BY final_beta_target
                )
                SELECT
                    s.final_beta_target,
                    r.regime_count,
                    s.days_in_state,
                    s.cumulative_return::float AS cumulative_return,
                    CASE
                        WHEN s.days_in_state > 0 AND s.cumulative_return IS NOT NULL
                        THEN POWER(1 + s.cumulative_return, 252.0 / s.days_in_state) - 1
                        ELSE NULL
                    END::float AS annualized_return
                FROM state_days s
                JOIN regime_counts r USING (final_beta_target)
                ORDER BY s.final_beta_target
                """
            )
        ).mappings().all()
    return [RegimeStats(**row) for row in rows]


@router.get("/health", response_model=MacroBetaHealth)
def health():
    freshness_queries = [
        ("PMI", "SELECT MAX(data_date)::text AS max_date FROM raw.pmi_manufacturing_us"),
        ("CPI", "SELECT MAX(data_date)::text AS max_date FROM raw.cpi_us"),
        ("S&P 500 TR", "SELECT MAX(date)::text AS max_date FROM clean.beta_sp500_daily"),
        ("S&P 500 Spot", "SELECT MAX(date)::text AS max_date FROM raw.macro WHERE series_id = 'SP500'"),
        ("Credit", "SELECT MAX(date)::text AS max_date FROM clean.beta_credit_daily"),
        ("Signal", "SELECT MAX(signal_date)::text AS max_date FROM macro_signal.beta_signal_daily"),
    ]

    freshness: list[HealthItem] = []
    with get_db() as conn:
        for label, sql in freshness_queries:
            max_date = conn.execute(text(sql)).scalar()
            lag_days = None
            if max_date:
                lag_days = (datetime.utcnow().date() - datetime.fromisoformat(max_date).date()).days
            freshness.append(
                HealthItem(
                    label=label,
                    max_date=max_date,
                    lag_days=lag_days,
                    status=_status_from_lag(label, lag_days),
                )
            )

        run_rows = conn.execute(
            text(
                """
                SELECT DISTINCT ON (step)
                    flow, step, status, started_at, completed_at, rows_affected, error_msg
                FROM pipeline.run_log
                WHERE flow = 'macro_beta'
                ORDER BY step, started_at DESC
                """
            )
        ).mappings().all()
    runs = [RunStatus(**row) for row in run_rows]
    return MacroBetaHealth(freshness=freshness, runs=runs)
