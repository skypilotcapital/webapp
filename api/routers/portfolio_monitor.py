"""
Portfolio Monitor — what STATE the book we hold is in right now ([08-PMON]).

Design: `08_website_and_tooling/portfolio_monitor_IA.md` (CANONICAL). Two pages, both on the live
IBKR paper account:

  * `/{env}/holdings`  — one row per name: held vs the frozen target, $ and % of NAV, P&L,
                         benchmark weight (core), borrow (shorts), last fill.
  * `/{env}/exposures` — per mandate: Benchmark · Target · Today · Change · Band for every sector and
                         style, the sleeve's legs, and the risk rows.

WHERE IT SITS. Portfolios answers "how has it PERFORMED"; this answers "what STATE is it in". The
paper router (`/api/v1/paper`) owns the performance series and the paper page; this router reuses
its reads (`_period_starts`, `exposures`) rather than writing a second copy of them.

FOUR RULES, each decided with the owner (2026-10-12):

1. **READ, NEVER RECOMPUTE.** Joins, filters, sums of stored rows and division by the stored NAV.
   Nothing here re-derives a quantity a job owns: the core/sleeve split is
   `trading.position_attribution`, exposures are `trading.book_exposure_factors`, the target and
   benchmark exposures are `trading.book_exposure_refs` (written by the same nightly job, on the same
   B and b), risk is `trading.book_risk`. The API has no pandas on purpose.
2. **TARGET MEANS THE LIVE BOOK.** The frozen target of the rebalance governing the date — the book
   built from the account's actual holdings and traded (`trading.target_positions`, Track B). Never
   the research (Track A, `*_full`) book: its names differ (~6 of the core's 54 at 2026-09-30). The
   governing rebalance is READ from `position_attribution.rebalance_id` — what the ledger recorded
   that day — not re-derived from today's rebalance statuses, which would claim the two days between
   a rebalance's signal and its trade (10-01/10-02 for rebalance 34).
3. **NO FLAGS.** Values, targets, benchmarks and bands are returned side by side. This payload
   carries no breach booleans, no headroom and no thresholds — the page has nothing to colour.
4. **EVERY SOURCE CARRIES ITS OWN AS-OF**, and the book's date is compared against the latest book
   that should exist by now (`expected_date`): the book for day D is built at 02:00 UTC on D+1.

⚠️ The benchmark is the MONTH-END index (`optimizer.benchmark_weights`), not moved with prices since
— mid-month the true index weight differs (up to 0.21pp on a sector at 2026-10-09). `benchmark_asof`
travels with every payload so the page can say so.
"""

import csv
import datetime as dt
import io

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import text

from api.db import get_db
from api.routers import paper as _paper

router = APIRouter(prefix="/api/v1/portfolio-monitor", tags=["portfolio-monitor"])

_f = _paper._f
_env = _paper._env

# The daily book for trading day D is built at 02:00 UTC on D+1 (skypilot-book-daily.timer, with a
# retry at 02:45). A book is "expected" once D+1 02:45 UTC has passed.
_BOOK_READY_AFTER = dt.timedelta(hours=2, minutes=45)


def _expected_book_date(now: dt.datetime | None = None) -> dt.date:
    """The newest weekday whose book should have been built by `now` (UTC).

    A US market holiday reads as a missing book; the page names the expected date rather than
    calling it a fault, so a reader can tell the two apart.
    """
    now = now or dt.datetime.now(dt.timezone.utc)
    d = (now - _BOOK_READY_AFTER).date() - dt.timedelta(days=1)
    while d.weekday() >= 5:
        d -= dt.timedelta(days=1)
    return d


def _book_date(conn, date: str | None, strategy: str | None):
    d = conn.execute(text("""
        SELECT max(date) FROM trading.book_daily
        WHERE (CAST(:strat AS text) IS NULL OR strategy = :strat)
          AND (CAST(:d AS date) IS NULL OR date = CAST(:d AS date))"""),
        {"strat": strategy, "d": date}).scalar()
    if d is None:
        return None, None
    strat = conn.execute(text(
        "SELECT strategy FROM trading.book_daily WHERE date = :d "
        "AND (CAST(:strat AS text) IS NULL OR strategy = :strat) ORDER BY strategy LIMIT 1"),
        {"d": d, "strat": strategy}).scalar()
    return d, strat


def _governing(conn, strat: str, d: dt.date) -> dict | None:
    """The rebalance the ledger recorded as governing the book on `d` (rule 2 above)."""
    ids = [r[0] for r in conn.execute(text("""
        SELECT DISTINCT rebalance_id FROM trading.position_attribution
        WHERE strategy = :s AND date = :d AND rebalance_id IS NOT NULL"""),
        {"s": strat, "d": d}).fetchall()]
    if len(ids) != 1:
        return None
    r = conn.execute(text("""
        SELECT rebalance_id, signal_date, status, submitted_at
        FROM trading.rebalances WHERE rebalance_id = :r"""), {"r": ids[0]}).mappings().first()
    if r is None:
        return None
    return {"rebalance_id": int(r["rebalance_id"]),
            "signal_date": r["signal_date"].isoformat() if r["signal_date"] else None,
            "status": r["status"],
            "trade_date": r["submitted_at"].date().isoformat() if r["submitted_at"] else None}


def _notices(d: dt.date, expected: dt.date) -> list[str]:
    out = []
    if d < expected:
        out.append(f"Book as of {d:%a %Y-%m-%d} — the latest expected is {expected:%a %Y-%m-%d}. "
                   f"The book for a trading day is built at 02:00 UTC the next day; a US market "
                   f"holiday also reads this way.")
    return out


# =============================================================================== holdings ====

def _holdings(env: str, date: str | None, strategy: str | None) -> dict:
    _env(env)
    with get_db() as conn:
        d, strat = _book_date(conn, date, strategy)
        if d is None:
            return {"env": env, "date": None, "rows": [],
                    "note": "no daily book has been built yet"}

        book = conn.execute(text("""
            SELECT account_id, nav, cash, gross_long, gross_short, net_exposure, n_long, n_short,
                   pnl_d, built_at
            FROM trading.book_daily WHERE strategy = :s AND date = :d"""),
            {"s": strat, "d": d}).mappings().first()
        nav = _f(book["nav"]) if book else None

        gov = _governing(conn, strat, d)
        rb = gov["rebalance_id"] if gov else None

        # Held ∪ target, joined on conid — the broker's permanent id, and the key the ledger and the
        # freeze both use. A name in the target we do not hold (an unfilled order) appears with no
        # position; a name we hold that is not in the target appears with target 0.
        #
        # ⚠️ mandate = 'composite': the tradable row. Each name has ~3 target rows (composite, core,
        # sleeve) and an unfiltered join counts the book about three times.
        rows = conn.execute(text("""
            WITH h AS (
                SELECT conid, isin, ticker, side, qty, price, price_source, mkt_value, pnl_d
                FROM trading.book_daily_positions
                WHERE strategy = :s AND date = :d AND COALESCE(qty, 0) <> 0),
            t AS (
                SELECT conid, isin, ticker, target_wt
                FROM trading.target_positions
                WHERE rebalance_id = :rb AND mandate = 'composite')
            SELECT COALESCE(h.conid, t.conid)   AS conid,
                   COALESCE(h.isin, t.isin)     AS isin,
                   COALESCE(h.ticker, t.ticker) AS ticker,
                   h.side, h.qty, h.price, h.price_source, h.mkt_value, h.pnl_d,
                   t.target_wt, (h.conid IS NOT NULL) AS held,
                   s.name, s.sector
            FROM h FULL JOIN t ON t.conid = h.conid
            LEFT JOIN secmaster.securities s ON s.isin = COALESCE(h.isin, t.isin)"""),
            {"s": strat, "d": d, "rb": rb}).mappings().all()

        attr = conn.execute(text("""
            SELECT conid, mandate, attr_qty, attr_mkt_value, method
            FROM trading.position_attribution
            WHERE strategy = :s AND date = :d"""), {"s": strat, "d": d}).mappings().all()

        tmand = conn.execute(text("""
            SELECT conid, mandate, target_wt FROM trading.target_positions
            WHERE rebalance_id = :rb AND mandate IN ('core', 'sleeve')"""),
            {"rb": rb}).mappings().all()

        # Since the last rebalance: the SAME window the paper page uses — from the close of the
        # trade day, so the trade's own cost sits inside the trade day, not in this window.
        periods = _paper._period_starts(conn, strat, d, None)
        since = dt.date.fromisoformat(periods["since_reb"])
        pnl_since = {r[0]: _f(r[1]) for r in conn.execute(text("""
            SELECT conid, sum(pnl_d) FROM trading.book_daily_positions
            WHERE strategy = :s AND date > :start AND date <= :d
            GROUP BY conid"""), {"s": strat, "start": since, "d": d}).fetchall()}

        isins = sorted({r["isin"] for r in rows if r["isin"]})
        conids = sorted({int(r["conid"]) for r in rows if r["conid"] is not None})

        bench_asof = conn.execute(text("""
            SELECT max(date) FROM optimizer.benchmark_weights
            WHERE universe = 'sp500' AND date <= :d"""), {"d": d}).scalar()
        bench = {}
        if bench_asof and isins:
            bench = {r[0]: float(r[1]) for r in conn.execute(text("""
                SELECT isin, weight FROM optimizer.benchmark_weights
                WHERE date = :bd AND universe = 'sp500' AND isin = ANY(:isins)"""),
                {"bd": bench_asof, "isins": isins}).fetchall()}

        # Borrow, point-in-time: a file dated D is usable from available_date = D + 1. Latest
        # usable row per name, never a join on `date`, never a range join that multiplies rows.
        borrow = {r["isin"]: r for r in conn.execute(text("""
            SELECT DISTINCT ON (isin) isin, date, fee_rate, available
            FROM clean.borrow_rates
            WHERE isin = ANY(:isins) AND available_date <= :d
            ORDER BY isin, date DESC"""), {"isins": isins, "d": d}).mappings().all()} if isins else {}

        acct = book["account_id"] if book else None
        last_fill = {}
        if conids and acct:
            last_fill = {r[0]: r[1] for r in conn.execute(text("""
                SELECT conid, max(exec_ts) FROM ibkr.executions
                WHERE account_id = :a AND conid = ANY(:c) AND CAST(exec_ts AS date) <= :d
                GROUP BY conid"""), {"a": acct, "c": conids, "d": d}).fetchall()}

    by_attr: dict[int, list] = {}
    for a in attr:
        by_attr.setdefault(int(a["conid"]), []).append(a)
    by_tm: dict[int, list] = {}
    for t in tmand:
        if t["conid"] is not None:
            by_tm.setdefault(int(t["conid"]), []).append(t)

    out = []
    for r in rows:
        conid = int(r["conid"]) if r["conid"] is not None else None
        held = bool(r["held"])
        mv = _f(r["mkt_value"]) or 0.0
        tw = _f(r["target_wt"]) or 0.0
        a_rows = by_attr.get(conid, []) if conid is not None else []

        # Mandate. Held: what the ledger attributed (one row → that mandate; two → split; none →
        # unattributed, reported as such and never re-allocated here). Not held: what the target
        # assigned it to.
        if held:
            mand = ("unattributed" if not a_rows else
                    a_rows[0]["mandate"] if len(a_rows) == 1 else "split")
            split = [{"mandate": a["mandate"], "qty": _f(a["attr_qty"]),
                      "mkt_value": _f(a["attr_mkt_value"]), "method": a["method"]}
                     for a in a_rows]
            core_mv = sum(_f(a["attr_mkt_value"]) or 0.0 for a in a_rows if a["mandate"] == "core")
            in_core = any(a["mandate"] == "core" for a in a_rows)
        else:
            t_rows = by_tm.get(conid, []) if conid is not None else []
            mand = (t_rows[0]["mandate"] if len(t_rows) == 1 else
                    "split" if t_rows else "unattributed")
            split = []
            core_mv = 0.0
            in_core = any(t["mandate"] == "core" for t in t_rows)

        side = r["side"] if held else ("long" if tw > 0 else "short")
        weight = (mv / nav) if nav else None
        bw = bench.get(r["isin"]) if (in_core and r["isin"]) else None
        if in_core and bw is None and bench_asof:
            bw = 0.0            # held in the core but not in the index: a full active bet
        br = borrow.get(r["isin"]) if side == "short" else None
        lf = last_fill.get(conid) if conid is not None else None

        out.append({
            "conid": conid, "isin": r["isin"], "ticker": r["ticker"], "name": r["name"],
            "sector": r["sector"], "side": side, "held": held,
            "mandate": mand, "mandate_split": split if len(split) > 1 else [],
            "qty": _f(r["qty"]) if held else 0.0,
            "price": _f(r["price"]), "price_source": r["price_source"],
            "mkt_value": mv,
            "weight": weight,
            "target_weight": tw,
            "drift_pp": (weight - tw) if weight is not None else None,
            "drift_usd": (mv - tw * nav) if nav else None,
            "pnl_d": _f(r["pnl_d"]) if held else None,
            "pnl_since_rebalance": pnl_since.get(conid) if conid is not None else None,
            # Core only: the S&P 500's month-end cap weight and the core's active weight against it.
            # A split name uses its core share. The sleeve is measured against cash — no column.
            "bench_weight": bw if in_core else None,
            "active_weight": ((core_mv / nav) - bw) if (in_core and nav and bw is not None) else None,
            # Shorts only. fee_rate is percent per year, as IBKR publishes it.
            "borrow_fee_pct": _f(br["fee_rate"]) if br else None,
            "borrow_available": int(br["available"]) if (br and br["available"] is not None) else None,
            "borrow_date": br["date"].isoformat() if br else None,
            "last_fill": lf.date().isoformat() if lf else None,
        })

    expected = _expected_book_date()
    return {
        "env": env,
        "strategy": strat,
        "account_id": acct,
        "date": d.isoformat(),
        "expected_date": expected.isoformat(),
        "built_at": book["built_at"].isoformat() if (book and book["built_at"]) else None,
        "nav": nav,
        "book": None if not book else {
            "cash": _f(book["cash"]), "gross_long": _f(book["gross_long"]),
            "gross_short": _f(book["gross_short"]), "net": _f(book["net_exposure"]),
            "n_long": book["n_long"], "n_short": book["n_short"], "pnl_d": _f(book["pnl_d"]),
        },
        "target": gov,
        "target_note": None if gov else
                       "no single governing rebalance recorded for this date — the target columns "
                       "are empty rather than guessed",
        "since_rebalance_start": since.isoformat(),
        "benchmark_asof": bench_asof.isoformat() if bench_asof else None,
        "notices": _notices(d, expected),
        "rows": out,
        "notes": {
            "basis": "Weights are % of NAV — the account's own book. The sleeve enters at half "
                     "weight, so a sleeve name's weight here is half its weight in the sleeve.",
            "target": "The frozen target of the governing rebalance (the live book we traded), "
                      "never the research book.",
            "drift_usd": "Market value minus target weight × today's NAV. Not an order — the next "
                         "rebalance's trades come from the optimizer, the dust filter and the "
                         "borrow check.",
            "benchmark": "S&P 500 month-end cap weight, core names only; not moved with prices "
                         "since the month-end.",
            "pnl_since_rebalance": "Sum of daily P&L from the close of the last rebalance's trade "
                                   "day; names exited since are not in this table.",
        },
    }


@router.get("/{env}/holdings")
def holdings(env: str, date: str | None = None, strategy: str | None = None):
    """Today's held book, one row per name, beside the frozen target (IA doc §3)."""
    return _holdings(env, date, strategy)


_CSV_COLS = ["ticker", "name", "sector", "side", "mandate", "held", "qty", "price",
             "price_source", "mkt_value", "weight", "target_weight", "drift_pp", "drift_usd",
             "pnl_d", "pnl_since_rebalance", "bench_weight", "active_weight", "borrow_fee_pct",
             "borrow_available", "borrow_date", "last_fill", "conid", "isin"]


@router.get("/{env}/holdings.csv")
def holdings_csv(env: str, date: str | None = None, strategy: str | None = None,
                 side: str | None = Query(None, pattern="^(long|short)$"),
                 mandate: str | None = None, sector: str | None = None):
    """The Holdings table as CSV, filtered the way the page filters it."""
    data = _holdings(env, date, strategy)
    rows = data["rows"]
    if not rows:
        raise HTTPException(status_code=404, detail="no daily book to export")
    if side:
        rows = [r for r in rows if r["side"] == side]
    if mandate:
        rows = [r for r in rows if r["mandate"] == mandate]
    if sector:
        rows = [r for r in rows if (r["sector"] or "") == sector]
    rows = sorted(rows, key=lambda r: -abs(r["drift_pp"] or 0.0))
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=_CSV_COLS, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        w.writerow({k: r.get(k) for k in _CSV_COLS})
    name = f"holdings_{data['account_id'] or env}_{data['date']}.csv"
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ============================================================================== exposures ====

@router.get("/{env}/exposures")
def exposures(env: str, date: str | None = None, strategy: str | None = None):
    """Benchmark · Target · Today · Change · Band per factor, per mandate (IA doc §4).

    The held side and the risk rows are the paper router's `exposures` payload, reused as-is; this
    adds the two references from `trading.book_exposure_refs` (same B, same b, same code path as the
    held rows) and reshapes the result with every flag removed.
    """
    _env(env)
    base = _paper.exposures(env, strategy, date)
    if not base.get("date"):
        return {"env": env, "date": None, "mandates": [], "note": base.get("note")}
    d = dt.date.fromisoformat(base["date"])
    strat = base["strategy"]

    with get_db() as conn:
        rhdr = conn.execute(text("""
            SELECT mandate, leg, rebalance_id, signal_date, benchmark, b_asof, target_gross,
                   target_n_names, target_n_covered, target_coverage_weight
            FROM trading.book_exposure_refs WHERE strategy = :s AND date = :d"""),
            {"s": strat, "d": d}).mappings().all()
        rfac = conn.execute(text("""
            SELECT mandate, leg, factor, target_exposure, bench_exposure
            FROM trading.book_exposure_ref_factors WHERE strategy = :s AND date = :d"""),
            {"s": strat, "d": d}).mappings().all()
        bench_asof = conn.execute(text("""
            SELECT max(date) FROM optimizer.benchmark_weights
            WHERE universe = 'sp500' AND date <= :d"""), {"d": d}).scalar()
        account = conn.execute(text(
            "SELECT account_id FROM trading.book_daily WHERE strategy = :s AND date = :d"),
            {"s": strat, "d": d}).scalar()
        gov = _governing(conn, strat, d)

    ref = {(r["mandate"], r["leg"], r["factor"]): r for r in rfac}
    rh = {(h["mandate"], h["leg"]): h for h in rhdr}

    def row(m: str, leg: str, f: dict, band=None, band_kind=None) -> dict:
        rr = ref.get((m, leg, f["factor"]))
        today = f.get("exposure")
        target = _f(rr["target_exposure"]) if rr else None
        return {"factor": f["factor"], "kind": f["kind"], "unit": f["unit"],
                "benchmark": _f(rr["bench_exposure"]) if rr else None,
                "target": target, "today": today,
                "change": (today - target) if (today is not None and target is not None) else None,
                "band": band, "band_kind": band_kind}

    mandates = []
    for m in base["mandates"]:
        name = m["mandate"]
        rows = [row(name, "net", f, f.get("band"), f.get("band_kind")) for f in m["factors"]]
        th = rh.get((name, "net"))
        legs = []
        for lg in m["legs"]:
            if lg["leg"] == "benchmark":
                continue        # carried as the `benchmark` column of the long/short rows
            lh = rh.get((name, lg["leg"]))
            legs.append({
                "leg": lg["leg"], "benchmark": lg["benchmark"],
                "leg_gross": lg["leg_gross"], "n_names": lg["n_names"],
                "target_leg_gross": _f(lh["target_gross"]) if lh else None,
                "target_n_names": lh["target_n_names"] if lh else None,
                "factors": [row(name, lg["leg"], f) for f in lg["factors"]],
            })
        mandates.append({
            "mandate": name, "benchmark": m["benchmark"], "basis": m["basis"],
            "gross": m["gross"], "n_names": m["n_names"], "n_covered": m["n_covered"],
            "coverage_weight": m["coverage_weight"], "n_no_isin": m["n_no_isin"],
            "band": m["band"], "band_kind": m["band_kind"],
            "target": None if th is None else {
                "rebalance_id": th["rebalance_id"],
                "signal_date": th["signal_date"].isoformat() if th["signal_date"] else None,
                "gross": _f(th["target_gross"]), "n_names": th["target_n_names"],
                "coverage_weight": _f(th["target_coverage_weight"]),
            },
            "target_note": None if th else
                           "the frozen target has not been measured for this date — "
                           "jobs.book_exposures writes it after the held book",
            "risk": m["risk"], "risk_note": m["risk_note"],
            "sectors": [r for r in rows if r["kind"] == "sector"],
            "styles": [r for r in rows if r["kind"] != "sector"],
            "legs": legs,
        })

    expected = _expected_book_date()
    return {
        "env": env,
        "strategy": strat,
        "account_id": account,
        "date": base["date"],
        "expected_date": expected.isoformat(),
        "b_asof": base.get("b_asof"),
        "b_age_days": base.get("b_age_days"),
        "benchmark_asof": bench_asof.isoformat() if bench_asof else None,
        "target": gov,
        "fund": base.get("fund"),
        "fund_note": base.get("fund_note"),
        "mandates": mandates,
        # Freshness and coverage notices — the data's own health, never a judgement on the book.
        "notices": _notices(d, expected) + list(base.get("degradations") or []),
        "notes": {**(base.get("notes") or {}),
                  "target": "The frozen target of the governing rebalance — the live book we "
                            "traded — measured on the same risk-model data and benchmark as "
                            "today's book, so Change is purely what the book did since the trade.",
                  "benchmark": "The benchmark's own exposure: the S&P 500 for the core, the "
                               "Russell 2500 band for the sleeve's legs, none for the sleeve's "
                               "net (it is measured against cash). Month-end weights, not moved "
                               "with prices since."},
    }
