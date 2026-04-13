"""
Panel 1 — Data Monitor endpoints.

All endpoints are read-only SELECT queries against the live PostgreSQL database.
FastAPI runs these in a thread pool (sync functions), so they don't block
the event loop.

Endpoints:
    GET /api/v1/data-monitor/table-status      — MAX(date) + row count per table
    GET /api/v1/data-monitor/run-log           — latest pipeline.run_log entry per step
    GET /api/v1/data-monitor/gap-detection     — missing trading days in key tables
    GET /api/v1/data-monitor/factor-coverage   — % of S&P 500 with valid factor.scores
"""

from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from api.db import get_db

router = APIRouter(prefix="/api/v1/data-monitor", tags=["data-monitor"])


# ---------------------------------------------------------------------------
# Config — tables monitored by the data monitor
# ---------------------------------------------------------------------------

MONITORED_TABLES = [
    {"schema": "secmaster", "table": "securities", "date_col": "figi_loaded_at", "check_gaps": False, "description": "Identifier resolution layer. Maps every security to a permanent ISIN."},
    {"schema": "secmaster", "table": "ticker_history", "date_col": "valid_from", "check_gaps": False, "description": "SCD Type 2 mapping of ticker to ISIN over time."},
    {"schema": "secmaster", "table": "constituents", "date_col": "start_date", "check_gaps": False, "description": "S&P 500 membership intervals without survivorship bias."},
    {"schema": "raw", "table": "prices", "date_col": "date", "check_gaps": True, "description": "Unadjusted daily equity prices, directly from Sharadar SEP."},
    {"schema": "raw", "table": "fundamentals", "date_col": "datekey", "check_gaps": False, "description": "Sharadar fundamental filings across ARQ and ART dimensions."},
    {"schema": "raw", "table": "daily_metrics", "date_col": "date", "check_gaps": True, "description": "Pre-computed valuation metrics from Sharadar DAILY."},
    {"schema": "raw", "table": "ticker_metadata", "date_col": "lastpricedate", "check_gaps": False, "description": "Sharadar active TICKERS snapshot."},
    {"schema": "raw", "table": "sp500_changes", "date_col": "date", "check_gaps": False, "description": "Constituent add/remove events from Sharadar."},
    {"schema": "raw", "table": "actions", "date_col": "date", "check_gaps": False, "description": "Corporate actions (splits, dividends, etc)."},
    {"schema": "raw", "table": "benchmarks", "date_col": "date", "check_gaps": True, "description": "yfinance benchmark data for ^SP500TR and ^VIX."},
    {"schema": "raw", "table": "macro", "date_col": "date", "check_gaps": True, "description": "Daily FRED macroeconomic series (Yields, OAS spreads)."},
    {"schema": "raw", "table": "ff_factors", "date_col": "date", "check_gaps": False, "description": "Fama-French research factors."},
    {"schema": "clean", "table": "prices", "date_col": "date", "check_gaps": True, "description": "Canonical, fully adjusted prices with daily returns."},
    {"schema": "clean", "table": "fundamentals", "date_col": "datekey", "check_gaps": False, "description": "PIT-validated fundamental data with proper lag enforcement."},
    {"schema": "clean", "table": "daily_metrics_sharadar", "date_col": "date", "check_gaps": True, "description": "Validation-only daily valuation metrics."},
    {"schema": "factor", "table": "momentum_factors", "date_col": "date", "check_gaps": True, "description": "Daily momentum and volatility factor signals."},
    {"schema": "factor", "table": "technical_factors", "date_col": "date", "check_gaps": True, "description": "Daily moving averages, RSI, and technicals."},
    {"schema": "factor", "table": "quality_factors", "date_col": "date", "check_gaps": False, "description": "Monthly fundamental quality factor signals."},
    {"schema": "factor", "table": "valuation_factors", "date_col": "date", "check_gaps": False, "description": "Monthly fundamental valuation factor signals."},
    {"schema": "factor", "table": "growth_factors", "date_col": "date", "check_gaps": False, "description": "Monthly fundamental growth factor signals."},
    {"schema": "factor", "table": "scores", "date_col": "date", "check_gaps": False, "description": "Z-scored comprehensive alpha model inputs (S&P 500 only)."},
    {"schema": "targets", "table": "forward_returns", "date_col": "date", "check_gaps": False, "description": "Forward-looking returns strictly for model training."},
]

# Tables included in gap detection (check_gaps=True above, daily frequency)
GAP_TABLES = [
    (t["schema"], t["table"], t["date_col"])
    for t in MONITORED_TABLES
    if t["check_gaps"]
]


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class TableStatus(BaseModel):
    schema_name: str
    table_name: str
    description: str
    max_date: Optional[str]
    row_count: int
    lag_days: Optional[int]   # calendar days between max_date and today; None if empty


class RunLogEntry(BaseModel):
    flow: str
    step: str
    mode: Optional[str]
    status: str
    started_at: datetime
    completed_at: Optional[datetime]
    rows_affected: Optional[int]
    error_msg: Optional[str]


class TableGap(BaseModel):
    schema_name: str
    table_name: str
    missing_dates: List[str]    # ISO dates present in raw.prices but absent in this table
    gap_count: int


class FactorCoverage(BaseModel):
    as_of_date: Optional[str]
    covered_count: int
    universe_count: int
    coverage_pct: Optional[float]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/table-status", response_model=List[TableStatus])
def table_status():
    """
    Returns MAX(date), row count, and staleness (lag_days) for each monitored table.

    Row counts use pg_stat_user_tables (PostgreSQL live statistics) instead of
    COUNT(*) — returns instantly even on 46M-row tables. Counts are approximate
    but accurate enough for a health dashboard (updated by VACUUM/ANALYZE).

    MAX(date) is an exact query but is fast because all date columns are indexed
    as primary key components.
    """
    today = date.today()
    results = []

    with get_db() as conn:
        # Fetch all row count estimates in one query
        est_rows = conn.execute(
            text("""
                SELECT schemaname, relname, n_live_tup
                FROM pg_stat_user_tables
            """)
        ).fetchall()
        row_count_map = {
            (r.schemaname, r.relname): r.n_live_tup
            for r in est_rows
        }

        # Fetch all MAX(date) values in one round-trip using UNION ALL
        union_sql = " UNION ALL ".join(
            f"SELECT '{t['schema']}' AS schema_name, '{t['table']}' AS table_name,"
            f" MAX({t['date_col']})::text AS max_date"
            f" FROM {t['schema']}.{t['table']}"
            for t in MONITORED_TABLES
        )
        max_dates = {
            (r.schema_name, r.table_name): r.max_date
            for r in conn.execute(text(union_sql)).fetchall()
        }

        for t in MONITORED_TABLES:
            schema = t["schema"]
            table = t["table"]
            max_date_str = max_dates.get((schema, table))
            row_count = row_count_map.get((schema, table), 0)

            lag_days = None
            max_date_fmt = None
            if max_date_str:
                max_date_fmt = max_date_str[:10]
                max_dt = date.fromisoformat(max_date_fmt)
                lag_days = (today - max_dt).days

            results.append(
                TableStatus(
                    schema_name=schema,
                    table_name=table,
                    description=t["description"],
                    max_date=max_date_fmt,
                    row_count=row_count,
                    lag_days=lag_days,
                )
            )

    return results


@router.get("/run-log", response_model=List[RunLogEntry])
def run_log():
    """
    Returns the most recent pipeline.run_log entry for each (flow, step) pair,
    ordered by flow then step. Shows whether each build step last ran successfully
    or with an error.
    """
    with get_db() as conn:
        rows = conn.execute(
            text("""
                SELECT DISTINCT ON (flow, step)
                    flow,
                    step,
                    mode,
                    status,
                    started_at,
                    completed_at,
                    rows_affected,
                    error_msg
                FROM pipeline.run_log
                ORDER BY flow, step, started_at DESC
            """)
        ).fetchall()

    return [
        RunLogEntry(
            flow=r.flow,
            step=r.step,
            mode=r.mode,
            status=r.status,
            started_at=r.started_at,
            completed_at=r.completed_at,
            rows_affected=r.rows_affected,
            error_msg=r.error_msg,
        )
        for r in rows
    ]


@router.get("/gap-detection", response_model=List[TableGap])
def gap_detection():
    """
    Detects missing trading days in daily-frequency tables over the past 90 days.

    Uses raw.prices as the reference trading calendar — the most complete daily
    table. For each daily-frequency table, reports any dates present in
    raw.prices but absent in the target table.

    Month-end-only tables (factor.scores, targets.forward_returns) are excluded.
    """
    results = []

    with get_db() as conn:
        for schema, table, date_col in GAP_TABLES:
            rows = conn.execute(
                text(f"""
                    SELECT ref.date::text AS missing_date
                    FROM (
                        SELECT DISTINCT date
                        FROM raw.prices
                        WHERE date >= CURRENT_DATE - INTERVAL '90 days'
                    ) ref
                    LEFT JOIN (
                        SELECT DISTINCT {date_col} AS date
                        FROM {schema}.{table}
                        WHERE {date_col} >= CURRENT_DATE - INTERVAL '90 days'
                    ) tgt ON ref.date = tgt.date
                    WHERE tgt.date IS NULL
                    ORDER BY ref.date
                """)
            ).fetchall()

            missing = [r.missing_date for r in rows]
            results.append(
                TableGap(
                    schema_name=schema,
                    table_name=table,
                    missing_dates=missing,
                    gap_count=len(missing),
                )
            )

    return results


@router.get("/factor-coverage", response_model=FactorCoverage)
def factor_coverage():
    """
    Reports what percentage of current S&P 500 constituents have a valid row
    in factor.scores at the most recent month-end date.

    A coverage below ~95% warrants investigation before running the alpha model.
    """
    with get_db() as conn:
        row = conn.execute(
            text("""
                WITH latest_scores AS (
                    SELECT isin
                    FROM factor.scores
                    WHERE date = (SELECT MAX(date) FROM factor.scores)
                ),
                current_sp500 AS (
                    SELECT DISTINCT isin
                    FROM secmaster.constituents
                    WHERE end_date IS NULL OR end_date > CURRENT_DATE
                )
                SELECT
                    (SELECT MAX(date)::text FROM factor.scores) AS as_of_date,
                    COUNT(DISTINCT ls.isin)                      AS covered_count,
                    COUNT(DISTINCT sp.isin)                      AS universe_count,
                    ROUND(
                        100.0 * COUNT(DISTINCT ls.isin)
                            / NULLIF(COUNT(DISTINCT sp.isin), 0),
                        1
                    )                                            AS coverage_pct
                FROM current_sp500 sp
                LEFT JOIN latest_scores ls ON sp.isin = ls.isin
            """)
        ).fetchone()

    return FactorCoverage(
        as_of_date=row.as_of_date,
        covered_count=row.covered_count or 0,
        universe_count=row.universe_count or 0,
        coverage_pct=float(row.coverage_pct) if row.coverage_pct is not None else None,
    )
