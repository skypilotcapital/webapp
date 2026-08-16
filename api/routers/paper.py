"""
The IBKR paper track — the book we actually own, as a time series ([08-PTRK] Phase A).

Design: `08_website_and_tooling/website_research_hub_IA.md` §IX–§XV (addendum 2026-08-07).

WHAT THIS IS NOT. It is not the Trading desk and it is not the modeled portfolio, and the
distinction drives every choice below:

  * `/api/v1/trading/*` answers "what is true RIGHT NOW, what must I do" — as-of state, read on
    rebalance day. It serves frozen targets, plans and reviews.
  * `/api/v1/portfolio/*` answers "is the strategy any good" — 258 months of modeled book, where
    an IR is a meaningful statistic.
  * This router answers "are we running the strategy we said we'd run, and what is it doing" —
    a SERIES over the real account, currently ~1 week long.

That last point is a constraint, not a caveat. At n = 1 month a Sharpe is theatre, so this router
**refuses to compute ratio statistics** until there are enough observations (`_MIN_OBS_RATIOS`)
and publishes `stats_suppressed` so the page can say why rather than render a blank. The first
person to screenshot a one-month paper IR will be quoting it back at us in a year.

THREE TRAPS ENCODED HERE, each of which has already bitten someone:

1. **`trading.target_positions` holds ~3 rows per name** once the mandate rows are written
   (composite + core + sleeve). A query that does not name a mandate counts the book about three
   times; the quiet version is a dict keyed by isin where the last row wins and one mandate's
   slice silently replaces the whole position. Every read here pins `mandate = 'composite'` —
   the tradable row, and the one a human approved. (`live_target_and_sleeve_ledger.md` §10.)
2. **`trading.trade_plans` holds two plans per rebalance** — `preview` (review-time quotes,
   indicative) and `final` (what the executor sized on). Summing the table gives double the
   notional. Fidelity reads `final`; the preview→final delta is published separately because it
   is a real measurement (how much the book moved between approval and submission), not noise.
3. **The benchmark is `clean.beta_sp500_daily.tr_level`** — a daily TOTAL-return level. The
   price-only alternative understates the benchmark by its dividend yield every single day, and
   this is the only maintained daily benchmark the project has. Same source the reports use, on
   purpose: two implementations of "the benchmark" will drift.
4. **Every optional filter is written `CAST(:x AS <type>) IS NULL OR col = :x`, and the cast is
   load-bearing.** pg8000 — the Windows dev driver (`api/db.py` is platform-aware) — sends
   parameters untyped, and Postgres cannot infer a type for one whose only context is `IS NULL`:
   `could not determine data type of parameter $1`, a 500 on every endpoint here. It does not
   reproduce on the droplet, where psycopg2 substitutes client-side, so the naked form looks
   correct in production while making the page impossible to run locally. Do not "simplify" the
   casts away.

READ-ONLY, like every other analytics router. `skypilot_app` holds SELECT on `ibkr` and `trading`
and nothing else.
"""

import datetime as dt

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from api.db import get_db

router = APIRouter(prefix="/api/v1/paper", tags=["paper"])

# Only 'paper' resolves. Live 404s rather than 403s, so there is no surface to probe — the same
# rule the trading router applies to `[env]`.
ENVS = {"paper"}

# Below this many daily observations, annualized ratios are not published. 60 trading days is not
# a statistical threshold — nothing is significant at 60 — it is the point at which a number stops
# being actively misleading on a page someone may screenshot.
_MIN_OBS_RATIOS = 60

# A rebalance explains the book only once it has been sent. 'proposed'/'approved' has not traded.
_EXECUTED = ("submitted", "filled", "reconciled", "closed")


def _env(env: str) -> str:
    if env not in ENVS:
        raise HTTPException(status_code=404, detail="unknown environment")
    return env


def _f(v):
    return None if v is None else float(v)


# --------------------------------------------------------------------------- the book band ----
@router.get("/{env}/book")
def book(env: str, strategy: str | None = None):
    """The book band: what we hold, marked, and whether it tied out to the broker.

    `tied_out` is published as a first-class field rather than assumed, because `[10-P4]`'s rule
    is that no performance number is reported that has not tied out. The page renders the marker;
    it does not silently drop the numbers when it is false — a book that failed reconciliation is
    exactly the one you need to look at.

    Degradations follow the reports' convention (`performance_reporting_plan.md`): published and
    labelled, never withheld. Every silent-degradation fault this project has had ran for weeks
    under a job reporting success.
    """
    _env(env)
    with get_db() as conn:
        row = conn.execute(text("""
            SELECT b.date, b.strategy, b.nav, b.cash, b.gross_long, b.gross_short,
                   b.net_exposure, b.pnl_d, b.margin_util, b.account_id, b.n_long, b.n_short,
                   b.accrued_cash, b.broker_nlv, b.mark_quality, b.n_px_fallback,
                   b.n_unresolved, b.n_unexplained_qty, b.commission, b.trade_cash,
                   b.reconciled_at, b.built_at, b.snap_ts,
                   s.tied_out, s.nav_vs_broker, s.unresolved_breaks,
                   s.unresolved_price, s.unresolved_cash, s.unresolved_position,
                   s.unresolved_fill, s.unresolved_nav, s.unresolved_other
            FROM trading.book_daily b
            LEFT JOIN trading.book_daily_status s
                   ON s.date = b.date AND s.strategy = b.strategy
            WHERE (CAST(:strat AS text) IS NULL OR b.strategy = :strat)
            ORDER BY b.date DESC LIMIT 1"""), {"strat": strategy}).mappings().first()

        if row is None:
            # Not an error: before the first book build there is genuinely nothing to say, and a
            # 404 would make the page render a failure state for a correct condition.
            return {"env": env, "book": None,
                    "degradations": ["no book has been built yet"]}

        b = dict(row)
        nav = _f(b["nav"]) or 0.0

        # Gross/net are published in BOTH dollars and NAV fraction. The fraction is what the
        # mandate is stated in (150/50) and the dollars are what a broker screen shows; asking a
        # reader to divide is how the two get compared to each other by mistake.
        gl, gs = _f(b["gross_long"]) or 0.0, abs(_f(b["gross_short"]) or 0.0)
        b["gross_long_pct"] = gl / nav if nav else None
        b["gross_short_pct"] = gs / nav if nav else None
        b["gross_pct"] = (gl + gs) / nav if nav else None
        b["net_pct"] = (gl - gs) / nav if nav else None

        degr = []
        if b["mark_quality"] and b["mark_quality"] != "ok":
            degr.append(f"marks degraded ({b['mark_quality']})")
        if b["n_px_fallback"]:
            degr.append(f"{b['n_px_fallback']} position(s) marked on a fallback price")
        if b["tied_out"] is False:
            degr.append("book did NOT tie out to the broker")
        if b["unresolved_breaks"]:
            # Composition, not just a count ([10-PXCAL]). A thin-name mark tail and an uncaptured
            # fill are not the same event and must not read the same. On the current price
            # threshold 14-29 names/day breach 1%, so this line is DEGRADED most days — which is
            # exactly why the reader has to be able to see, without opening the log, whether the
            # cash and position counts are zero. Zeros are shown deliberately: "0 cash" is the
            # reassuring half and omitting it would leave the reader inferring silence.
            parts = ", ".join(
                f"{b[f'unresolved_{k}']} {k}"
                for k in ("price", "cash", "position", "fill", "nav", "other")
                if b.get(f"unresolved_{k}") or k in ("price", "cash", "position"))
            degr.append(f"{b['unresolved_breaks']} unresolved reconciliation break(s) — {parts}")
        if b["n_unexplained_qty"]:
            degr.append(f"{b['n_unexplained_qty']} position(s) with unexplained quantity")

        # Staleness is measured against the calendar, not against the job: a job that never ran
        # leaves no row to look stale, which is the F-006 failure shape.
        #
        # ⚠️ UTC, not local. Book dates are stamped by droplet jobs running in UTC, and this API
        # also serves a developer machine at UTC-7 — where `date.today()` can name a different
        # calendar day and shift the age by one. Answering a calendar question from the wrong
        # clock is F-009, found in three independent places already.
        age = (dt.datetime.now(dt.timezone.utc).date() - b["date"]).days if b["date"] else None
        if age is not None and age > 4:
            degr.append(f"book is {age} days old")

    return {"env": env, "book": b, "degradations": degr}


@router.get("/{env}/nav")
def nav_series(env: str, strategy: str | None = None):
    """Daily NAV against the benchmark, since inception, both rebased to 100.

    Two things are deliberately NOT done here:

    * **No ratio statistics below `_MIN_OBS_RATIOS`.** `stats_suppressed` says so explicitly so
      the page can print the reason. See the module docstring.
    * **The cash days are marked, not restated.** The account was funded before it traded, and a
      period reaching back into those days is labelled `incl. cash days` rather than silently
      re-based to the first fill. Holding cash through a benchmark rally is a real opportunity
      cost and erasing it would flatter the track on exactly the days it is most fragile.
      (`performance_reporting_plan.md`, "Two presentation rules".)
    """
    _env(env)
    with get_db() as conn:
        rows = conn.execute(text("""
            SELECT date, nav, pnl_d, gross_long, gross_short, n_long, n_short
            FROM trading.book_daily
            WHERE (CAST(:strat AS text) IS NULL OR strategy = :strat)
            ORDER BY date"""), {"strat": strategy}).mappings().all()
        if not rows:
            return {"env": env, "series": [], "stats_suppressed": True, "reason": "no book yet"}

        d0, d1 = rows[0]["date"], rows[-1]["date"]
        bench = {r["date"]: _f(r["tr_level"]) for r in conn.execute(text("""
            SELECT date, tr_level FROM clean.beta_sp500_daily
            WHERE date BETWEEN :a AND :b ORDER BY date"""),
            {"a": d0, "b": d1}).mappings()}

        # The first date the book actually held something — the boundary the page marks.
        first_invested = conn.execute(text("""
            SELECT min(date) FROM trading.book_daily
            WHERE (CAST(:strat AS text) IS NULL OR strategy = :strat)
              AND (COALESCE(gross_long,0) <> 0 OR COALESCE(gross_short,0) <> 0)"""),
            {"strat": strategy}).scalar()

    nav0 = _f(rows[0]["nav"])
    b0 = next((bench[r["date"]] for r in rows if bench.get(r["date"])), None)
    series = []
    for r in rows:
        bl = bench.get(r["date"])
        series.append({
            "date": r["date"].isoformat(),
            "nav": _f(r["nav"]),
            "nav_idx": (_f(r["nav"]) / nav0 * 100.0) if nav0 else None,
            "bench_idx": (bl / b0 * 100.0) if (bl and b0) else None,
            "pnl_d": _f(r["pnl_d"]),
            "invested": bool((_f(r["gross_long"]) or 0) or (_f(r["gross_short"]) or 0)),
        })

    n = len(series)
    return {
        "env": env,
        "series": series,
        "inception": rows[0]["date"].isoformat(),
        "first_invested": first_invested.isoformat() if first_invested else None,
        "incl_cash_days": bool(first_invested and first_invested > rows[0]["date"]),
        "n_obs": n,
        # The page must not compute these itself from `series` — the suppression is the point.
        "stats_suppressed": n < _MIN_OBS_RATIOS,
        "reason": (f"{n} observations — annualized ratios are not meaningful below "
                   f"{_MIN_OBS_RATIOS} and are withheld rather than rendered")
                  if n < _MIN_OBS_RATIOS else None,
    }


# ------------------------------------------------------------------------------- fidelity ----
@router.get("/{env}/fidelity")
def fidelity(env: str, rebalance_id: int | None = None):
    """Did we build the book we approved?

    This is the section with no counterpart on the modeled page, and the reason the paper track is
    worth a surface of its own. Four measurements:

    * **Coverage** — of the names the frozen book asked for, how many did we end up holding.
    * **Execution** — planned vs filled shares, at the plan level and in aggregate.
    * **Realized cost** — commission and fill-vs-reference slippage per traded dollar. This is
      `[06-T7]`'s calibration feed: the cost model that reversed the Stage-2 conclusions has never
      met a real fill, and this is where it first does.
    * **Plan drift** — how far the book moved between the preview a human approved and the final
      plan the executor sized. Approval binds the frozen BOOK, not share counts (`trading_ui_IA.md`
      §1.2 / G3), so this number is expected to be non-zero; publishing it is what makes that
      design visible rather than merely asserted.

    ⚠️ **Paper fills are simulated, so realized impact here is a LOWER BOUND.** That is an owner
    constraint (2026-08-02), not a hedge, and `impact_is_lower_bound` is returned on every response
    so the caveat cannot be dropped by a page that forgets to hardcode it.
    """
    _env(env)
    with get_db() as conn:
        reb = conn.execute(text("""
            SELECT rebalance_id, strategy, signal_date, status, sized_equity, submitted_at
            FROM trading.rebalances
            WHERE ((CAST(:rid AS integer) IS NULL AND status = ANY(:ex))
                   OR rebalance_id = :rid)
            ORDER BY rebalance_id DESC LIMIT 1"""),
            {"rid": rebalance_id, "ex": list(_EXECUTED)}).mappings().first()
        if reb is None:
            return {"env": env, "rebalance": None,
                    "note": "no rebalance has been executed yet"}
        rid = reb["rebalance_id"]

        # `mandate = 'composite'` — trap 2 in the module docstring. This is the row the executor
        # trades and the one a human approved.
        n_target = conn.execute(text("""
            SELECT count(*) FROM trading.target_positions
            WHERE rebalance_id = :r AND mandate = 'composite'
              AND COALESCE(target_qty, 0) <> 0"""), {"r": rid}).scalar() or 0

        plan = conn.execute(text("""
            SELECT count(*) AS n,
                   count(*) FILTER (WHERE dust_filtered)          AS n_dust,
                   count(*) FILTER (WHERE side = 'BUY')           AS n_buy,
                   count(*) FILTER (WHERE side = 'SELL')          AS n_sell,
                   sum(abs(est_notional))                         AS notional,
                   sum(abs(planned_qty))                          AS planned_qty
            FROM trading.trade_plans
            WHERE rebalance_id = :r AND plan_kind = 'final'"""),
            {"r": rid}).mappings().first()

        prev = conn.execute(text("""
            SELECT sum(abs(est_notional)) AS notional, count(*) AS n
            FROM trading.trade_plans
            WHERE rebalance_id = :r AND plan_kind = 'preview'"""),
            {"r": rid}).mappings().first()

        orders = conn.execute(text("""
            SELECT status, count(*) AS n FROM ibkr.orders
            WHERE rebalance_id = :r GROUP BY status"""), {"r": rid}).mappings().all()

        # Fills join to orders rather than to the plan: an execution is evidence about an ORDER,
        # and an order that was never sent has no fill to miss.
        fills = conn.execute(text("""
            SELECT count(*)                        AS n_fills,
                   count(DISTINCT e.conid)         AS n_names,
                   sum(abs(e.qty * e.price))       AS notional,
                   sum(e.commission)               AS commission,
                   sum(abs(e.qty))                 AS qty
            FROM ibkr.executions e
            JOIN ibkr.orders o ON o.internal_order_id = e.internal_order_id
            WHERE o.rebalance_id = :r"""), {"r": rid}).mappings().first()

        # ⚠️ COST IS READ FROM `trading.cost_calibration`, NOT COMPUTED HERE ([10-SHFL]).
        #
        # This endpoint originally measured fill-vs-`ref_price` itself and reported ~20.2 bps
        # against a ~20.0 prediction — an apparently excellent model. It is not: `ref_price` is the
        # DECISION price (the panel close the share count was sized on), so that number is mostly
        # the overnight market. NVDA alone moved 149 bp between decision and arrival, about five
        # times the entire predicted cost of its trade.
        #
        # The honest measurement is from the ARRIVAL mid (`trade_plans.price`, the mid at
        # submission), which separates delay — a real implementation cost, but not the cost model's
        # quantity — from execution. `[10-SHFL]`'s engine does that per name and stores it. Reading
        # it keeps ONE definition of realized cost on the site; recomputing it here would have kept
        # the flattering one alive next to the true one.
        cal = conn.execute(text("""
            SELECT sum(exec_bps        * notional) / NULLIF(sum(notional), 0) AS exec_bps,
                   sum(commission_bps  * notional) / NULLIF(sum(notional), 0) AS commission_bps,
                   sum(realized_bps    * notional) / NULLIF(sum(notional), 0) AS realized_bps,
                   sum(delay_bps       * notional) / NULLIF(sum(notional), 0) AS delay_bps,
                   sum(pred_bps        * notional) / NULLIF(sum(notional), 0) AS pred_bps,
                   sum(residual_bps    * notional) / NULLIF(sum(notional), 0) AS residual_bps,
                   sum(notional)                                              AS notional,
                   count(*)                                                   AS n_names,
                   count(*) FILTER (WHERE pred_source = 'late')               AS n_late
            FROM trading.cost_calibration WHERE rebalance_id = :r"""),
            {"r": rid}).mappings().first()

        panel = conn.execute(text("""
            SELECT max(panel_date) AS panel_date, max(panel_lag_days) AS panel_lag
            FROM trading.plan_cost_estimates WHERE rebalance_id = :r"""),
            {"r": rid}).mappings().first()

    traded = _f(fills["notional"]) or 0.0
    comm = _f(fills["commission"]) or 0.0

    return {
        "env": env,
        # `rebalance_id` must survive as an int — it is a path segment downstream, and 13.0 is not
        # a rebalance. Only the genuinely decimal fields are floated.
        "rebalance": {
            "rebalance_id": int(reb["rebalance_id"]),
            "strategy": reb["strategy"],
            "signal_date": reb["signal_date"].isoformat() if reb["signal_date"] else None,
            "status": reb["status"],
            "sized_equity": _f(reb["sized_equity"]),
            "submitted_at": reb["submitted_at"].isoformat() if reb["submitted_at"] else None,
        },
        "coverage": {
            "n_target": int(n_target),
            "n_planned": int(plan["n"] or 0),
            "n_dust_filtered": int(plan["n_dust"] or 0),
            "n_filled_names": int(fills["n_names"] or 0),
            "n_buy": int(plan["n_buy"] or 0),
            "n_sell": int(plan["n_sell"] or 0),
            "orders": {r["status"]: int(r["n"]) for r in orders},
        },
        "execution": {
            "planned_notional": _f(plan["notional"]),
            "filled_notional": traded,
            "planned_qty": _f(plan["planned_qty"]),
            "filled_qty": _f(fills["qty"]),
            "n_fills": int(fills["n_fills"] or 0),
        },
        # Every bps figure below is notional-weighted and measured from the ARRIVAL mid. `delay` is
        # reported and NOT charged into `realized`: not trading instantly is a real implementation
        # cost, but it is not the cost model's quantity and folding it in is what produced the
        # false confirmation this section used to show.
        "cost": {
            "commission_usd": comm,
            "measured_from": "arrival",
            "exec_bps": _f(cal["exec_bps"]) if cal else None,
            "commission_bps": _f(cal["commission_bps"]) if cal else None,
            "realized_bps": _f(cal["realized_bps"]) if cal else None,
            "delay_bps": _f(cal["delay_bps"]) if cal else None,
            "model_predicted_bps": _f(cal["pred_bps"]) if cal else None,
            # Signed so that NEGATIVE = the model over-predicted (we spent less than it said).
            "residual_bps": _f(cal["residual_bps"]) if cal else None,
            "n_names": int(cal["n_names"]) if cal and cal["n_names"] else 0,
            "prediction_source": (None if not cal or not cal["n_names"]
                                  else "backfill" if cal["n_late"] == cal["n_names"]
                                  else "plan" if not cal["n_late"] else "mixed"),
            "prediction_panel_date": (str(panel["panel_date"])
                                      if panel and panel["panel_date"] else None),
            "prediction_panel_lag_days": (int(panel["panel_lag"])
                                          if panel and panel["panel_lag"] is not None else None),
            # Paper fills cross the spread and do nothing else — there is no queue and no impact to
            # measure — so this calibrates spread and commission ONLY. Stated here rather than left
            # to the page, because it is the difference between a calibration and a coincidence.
            "calibrates": "spread + commission only — paper fills carry no impact ([10-SHFL])",
        },
        "plan_drift": {
            "preview_notional": _f(prev["notional"]) if prev else None,
            "final_notional": _f(plan["notional"]),
            "note": "approval binds the frozen book, not share counts — a non-zero delta here is "
                    "the design working, not a fault (trading_ui_IA.md §1.2)",
        },
        "impact_is_lower_bound": True,
        "impact_note": "paper fills are simulated; measured impact is a LOWER bound on what live "
                       "execution would cost (owner constraint, 2026-08-02)",
    }


# ------------------------------------------------------------------------------ shortfall ----
@router.get("/{env}/shortfall")
def shortfall(env: str, rebalance_id: int | None = None, top: int = Query(8, ge=1, le=40)):
    """Implementation shortfall for one rebalance window — READ from `[10-SHFL]`, not computed.

    THIS IS ALSO THE TRACK B OVERLAY. The IA (§XII.D) listed "shortfall series" and "Track B vs
    Track C" as two sections; they are one measurement. Track B is the live target book and Track C
    is what the broker holds, and their difference over one interval IS the shortfall — the engine's
    B0→B4 chain is exactly that difference, decomposed. Building both would have put the same number
    on the page twice under different names.

    THE CHAIN (`implementation_shortfall.md` §2): five books, each one effect apart, so the terms
    sum to the total by construction rather than by an attribution formula.

        B0 intent (target weights, fractional shares, decision price, no costs)
        B1 … at the ARRIVAL mid                                    → delay
        B2 … whole shares, dust filter applied                     → rounding + dust
        B3 … actual fills, unfilled left unfilled                  → fill price + unfilled
        B4 … less commission  ( = Track C )                        → commission

    Order-dependence is real and is published rather than hidden: **the total is the robust number,
    the split is interpretive.**

    ⚠️ DELAY IS IN THIS NUMBER AND OUT OF THE COST CALIBRATION (§3), and the two must never be
    crossed. Not trading instantly is a real implementation cost, so it belongs here. It is not the
    cost model's quantity, so it is excluded from `/fidelity` — calibrating an impact coefficient on
    market drift would fit direction, with a systematically wrong sign whenever the book is net long
    into a rising tape. Same dollars, two questions, two tables.
    """
    _env(env)
    with get_db() as conn:
        row = conn.execute(text("""
            SELECT * FROM trading.shortfall
            WHERE (CAST(:rid AS integer) IS NULL OR rebalance_id = :rid)
            ORDER BY rebalance_id DESC LIMIT 1"""), {"rid": rebalance_id}).mappings().first()
        if row is None:
            return {"env": env, "window": None,
                    "note": "no shortfall window computed yet — owned by [10-SHFL]"}
        rid = row["rebalance_id"]
        names = conn.execute(text("""
            SELECT ticker, mandate, delay_usd, rounding_usd, fill_usd, unfilled_usd,
                   commission_usd, total_usd
            FROM trading.shortfall_names
            WHERE rebalance_id = :r AND total_usd IS NOT NULL
            ORDER BY abs(total_usd) DESC LIMIT :n"""), {"r": rid, "n": top}).mappings().all()

    aum = _f(row["aum"]) or 0.0
    def _bps(v):
        v = _f(v)
        return (v / aum * 1e4) if (v is not None and aum) else None

    terms = [("delay", "delay_usd", "B0→B1 · the market moving between decision and arrival"),
             ("rounding", "rounding_usd", "B1→B2 · whole shares + the $500 dust filter"),
             ("fill", "fill_usd", "B2→B3 · fill price vs the arrival mid"),
             ("unfilled", "unfilled_usd", "B2→B3 · what did not trade"),
             ("commission", "commission_usd", "B3→B4 · broker commission")]

    return {
        "env": env,
        "window": {
            "rebalance_id": int(rid),
            "strategy": row["strategy"],
            "window_start": row["window_start"].isoformat() if row["window_start"] else None,
            "window_end": row["window_end"].isoformat() if row["window_end"] else None,
            "window_days": int(row["window_days"] or 0),
            # These three drive the whole presentation, so they are first-class, not footnotes.
            "is_open": bool(row["is_open"]),
            "is_establishment": bool(row["is_establishment"]),
            "aum": aum,
            "total_usd": _f(row["total_usd"]),
            "total_bps": _f(row["total_bps"]),
            "n_names": int(row["n_names"] or 0),
            "n_unfilled": int(row["n_unfilled"] or 0),
            "method": row["method"],
            "terminal_src": row["terminal_src"],
            "shape_source": row["shape_source"],
            "tied_out_days": int(row["tied_out_days"] or 0),
        },
        "chain": [{"term": k, "usd": _f(row[col]), "bps": _bps(row[col]), "step": desc}
                  for k, col, desc in terms],
        "names": [{"ticker": n["ticker"], "mandate": n["mandate"],
                   "delay_usd": _f(n["delay_usd"]), "fill_usd": _f(n["fill_usd"]),
                   "total_usd": _f(n["total_usd"]), "total_bps": _bps(n["total_usd"])}
                  for n in names],
        "caveats": {
            "delay_in_shortfall_not_calibration":
                "delay is counted here and deliberately excluded from /fidelity — same dollars, "
                "two questions (implementation_shortfall.md §3)",
            "order_dependent":
                "the chain terms sum to the total by construction; the total is the robust number, "
                "the split is interpretive",
        },
    }


# ------------------------------------------------------------------------------ positions ----
@router.get("/{env}/positions")
def positions(env: str, date: str | None = None, top: int = Query(10, ge=1, le=50)):
    """Holdings on the marked book, plus the day's largest contributors and detractors.

    Contribution is in **basis points of NAV**, not dollars and not position return. A 40% move on
    a 0.1% position is noise the reader should not have to deflate by hand, and dollars force a
    mental division by NAV on every row.

    **The core/sleeve split is READ, never recomputed.** `trading.position_attribution` is a
    derived snapshot written by `ledger.attribute()` on the trading side; this endpoint joins it to
    the marked book and does no attribution of its own. Reimplementing the rules here would be the
    second implementation `live_target_and_sleeve_ledger.md` §11 warns will drift, and it would
    drift silently because both versions would look plausible.

    A mandate's contribution is `pnl_d × (its share of the position)`, where the share comes from
    the snapshot's `attr_mkt_value / mkt_value`. `attr_weight` is the BLEND weight — the mandate's
    contribution to the book we hold — and is the right one for reporting; `w_native` (÷ k) is the
    mandate's own weight and belongs to the optimizer, not to a page. Publishing the wrong one
    would overstate the sleeve by 2×.

    `mandate_split` is null when no snapshot exists for the date, with its owner named — the
    attribution rides the daily book build, so a date whose book has not been built has none.
    """
    _env(env)
    with get_db() as conn:
        # CAST(), not `:d::date`. SQLAlchemy's bind-parameter scanner does not reliably separate a
        # parameter from a following `::` cast, and leaves the second occurrence unsubstituted —
        # a 500 that only appears once the same parameter is used twice in one statement.
        d = conn.execute(text("""
            SELECT max(date) FROM trading.book_daily_positions
            WHERE (CAST(:d AS date) IS NULL OR date = CAST(:d AS date))"""), {"d": date}).scalar()
        if d is None:
            return {"env": env, "date": None, "positions": [],
                    "mandate_split": None,
                    "mandate_split_note": "unavailable — owned by [08-PTRK] (the sleeve ledger is "
                                          "stateless and persists no attribution table)"}

        nav = conn.execute(text(
            "SELECT nav FROM trading.book_daily WHERE date = :d ORDER BY strategy LIMIT 1"),
            {"d": d}).scalar()
        nav = _f(nav) or 0.0

        rows = conn.execute(text("""
            SELECT conid, isin, ticker, side, qty, price, price_source,
                   mkt_value, prev_mkt_value, pnl_d, trade_cash
            FROM trading.book_daily_positions
            WHERE date = :d AND COALESCE(qty, 0) <> 0
            ORDER BY abs(mkt_value) DESC"""), {"d": d}).mappings().all()

        # Core vs sleeve, read from the ledger's snapshot. The share is taken on MARKET VALUE
        # rather than on quantity so a name split across mandates contributes its P&L in the same
        # proportion the money is split — and `attr_qty` is fractional, which would make a
        # quantity-based share look like a rounding artefact.
        split = conn.execute(text("""
            SELECT a.mandate,
                   count(*)                                              AS n_names,
                   sum(a.attr_weight)                                    AS net_weight,
                   sum(abs(a.attr_weight))                               AS gross_weight,
                   sum(a.attr_mkt_value)                                 AS mkt_value,
                   sum(p.pnl_d * a.attr_mkt_value
                       / NULLIF(p.mkt_value, 0))                         AS pnl_d,
                   count(*) FILTER (WHERE a.method <> 'prior_target')    AS n_fallback
            FROM trading.position_attribution a
            JOIN trading.book_daily_positions p
              ON p.date = a.date AND p.conid = a.conid
            WHERE a.date = :d
            GROUP BY a.mandate ORDER BY a.mandate"""), {"d": d}).mappings().all()

        # The residual is REPORTED, never absorbed — the ledger doc is explicit that silent
        # absorption is what makes a ledger untrustworthy. It is the market value the snapshot
        # could not place, which shows up here as book positions with no attribution row.
        resid = conn.execute(text("""
            SELECT count(*) AS n, sum(abs(p.mkt_value)) AS mkt_value
            FROM trading.book_daily_positions p
            LEFT JOIN trading.position_attribution a
                   ON a.date = p.date AND a.conid = p.conid
            WHERE p.date = :d AND COALESCE(p.qty, 0) <> 0 AND a.conid IS NULL"""),
            {"d": d}).mappings().first()

    out = []
    for r in rows:
        mv = _f(r["mkt_value"]) or 0.0
        pnl = _f(r["pnl_d"])
        out.append({
            "conid": r["conid"], "isin": r["isin"], "ticker": r["ticker"],
            "side": r["side"], "qty": _f(r["qty"]), "price": _f(r["price"]),
            "price_source": r["price_source"],
            "mkt_value": mv,
            "weight": (mv / nav) if nav else None,
            "pnl_d": pnl,
            "contrib_bps": (pnl / nav * 1e4) if (pnl is not None and nav) else None,
        })

    ranked = [p for p in out if p["contrib_bps"] is not None]
    ranked.sort(key=lambda p: p["contrib_bps"], reverse=True)

    mandate_split = None
    if split:
        mandate_split = {
            "by_mandate": [{
                "mandate": s["mandate"],
                "n_names": int(s["n_names"]),
                "net_weight": _f(s["net_weight"]),
                "gross_weight": _f(s["gross_weight"]),
                "mkt_value": _f(s["mkt_value"]),
                "pnl_d": _f(s["pnl_d"]),
                "contrib_bps": (_f(s["pnl_d"]) / nav * 1e4) if (nav and s["pnl_d"] is not None) else None,
                # How many names needed a fallback rule. prior_target is a 100% assignment and
                # exact by inspection; the fallbacks are judgement, and a page that does not
                # distinguish them presents both at the same confidence.
                "n_fallback_rule": int(s["n_fallback"] or 0),
            } for s in split],
            "residual": {
                "n_names": int(resid["n"] or 0) if resid else 0,
                "mkt_value": _f(resid["mkt_value"]) if resid else None,
            },
            "basis": "attr_weight — the mandate's BLEND contribution to the book we hold, not its "
                     "own (native) weight. The sleeve enters the blend at 0.5x, so the two differ "
                     "by 2x and only the blend basis sums back to the portfolio.",
        }

    return {
        "env": env,
        "date": d.isoformat(),
        "nav": nav,
        "n_positions": len(out),
        "positions": out,
        "contributors": ranked[:top],
        "detractors": list(reversed(ranked[-top:])) if ranked else [],
        "mandate_split": mandate_split,
        "mandate_split_note": None if mandate_split else
                              "no attribution snapshot for this date — it rides the daily book "
                              "build (jobs/attribute_positions), so a date whose book has not "
                              "been built has none. [08-PTRK]",
    }


# ------------------------------------------------------------------------------ exposures ----
# Sector/market columns of B are 0/1 dummies, so Bᵀ(w−b) on one of them IS an active WEIGHT — the
# very quantity `optimize.py` bounds with `sector_tol`. Style columns are cross-sectionally
# standardised, so theirs are in STANDARD DEVIATIONS of tilt. Rendering 0.13σ as "13%" is a unit
# error that reads perfectly plausibly, so the unit travels with every row rather than being
# inferred by the client from the factor name (`live_book_exposure.md` §6.3).
_UNIT = {"sector": "weight", "market": "beta", "style": "sigma"}

# Degradation thresholds, from `live_book_exposure.md` §8. B is monthly by design; 45 days means a
# month-end build has been missed, which is a different fault from B merely being three weeks old.
_MIN_COVERAGE = 0.95
_MAX_B_AGE_DAYS = 45


def _risk_row(r) -> dict | None:
    """One mandate's Target · Expected · Realized, from `trading.book_risk` ([10-LTE]).

    ⚠️ `realized` IS RETURNED EVEN WHEN IT IS NOT PUBLISHABLE, with `publishable=False` and its N.
    Withholding the field entirely would leave a renderer unable to distinguish "no series yet"
    from "a series too short to quote", and those are different states: the second one is progress.
    The relative error bar rides along so the caller cannot show a bare number.
    """
    if r is None:
        return None
    f = _f
    return {
        "te_target": f(r["te_target"]),
        "te_budget": f(r["te_budget"]),
        "cap_calibration": f(r["cap_calibration"]),
        "te_expected": f(r["expected_te"]),
        "te_expected_se": f(r["expected_te_se"]),
        "te_realized": f(r["realized_te_incep"]),
        "te_realized_63d": f(r["realized_te_63d"]),
        "te_realized_252d": f(r["realized_te_252d"]),
        # RELATIVE, not absolute: 5% at ±0.15 means 4.25–5.75%, not −10% to 20%.
        "te_realized_rel_se": f(r["realized_se_incep"]),
        "n_obs": int(r["n_obs"]) if r["n_obs"] is not None else 0,
        "publishable": bool(r["publishable"]),
        # Machinery, for the methodology note only — never a report row.
        "pred_te": f(r["pred_te"]),
        "bias": f(r["bias"]),
        "bias_source": r["bias_source"],
        "factor_var": f(r["factor_var"]),
        "specific_var": f(r["specific_var"]),
        "coverage_sigma": f(r["coverage_sigma"]),
        "f_asof": r["f_asof"].isoformat() if r["f_asof"] else None,
        "sigma_asof": r["sigma_asof"].isoformat() if r["sigma_asof"] else None,
    }


@router.get("/{env}/exposures")
def exposures(env: str, strategy: str | None = None, date: str | None = None):
    """What the book we HOLD is betting on, per mandate — and how much room is left in its bands.

    THE PANEL THIS SERVES HAS TWO TENANTS ([10-LEXPU] / [10-LTE], contract 2026-08-13). Exposure
    says what the book is BETTING ON; tracking error says HOW FAR IT WILL WANDER. Both are "what
    the book is doing between rebalances, per mandate, versus what we built", they share an as-of
    date, a mandate split and a coverage figure, and split across two surfaces a reader has to join
    them up themselves. So each mandate carries a `risk` KEY that is null until `[10-LTE]` computes
    it — the slot is reserved in the payload, not improvised into the layout later.

    WHY THIS IS NOT `/trading/{env}/rebalances/{id}/exposures`. That one reads
    `portfolio.attribution` and describes the TARGET at freeze: one snapshot, and then nothing looks
    again until the next rebalance. This reads `trading.book_exposures`, written nightly against the
    book we actually own, and it moves with all three drift mechanisms the frozen view cannot see —
    price drift, a monthly re-estimated `B`, and composition (unfilled orders, corporate actions).

    THREE THINGS THE PAYLOAD CARRIES ON PURPOSE, each of which the client would otherwise have to
    reinvent or guess:

    * **`unit` per factor row.** See `_UNIT` above.
    * **`headroom`, not just the exposure.** A breach table is a post-mortem — it fires the week
      after. "Consumer Defensive is 2bp inside a HARD ±3% band" is the sentence someone can act on,
      and it is the reason the series is stored daily at all.
    * **`band_kind`.** The core is `soft_constraints: false`, so a breach means the optimiser could
      NOT have done this at construction → drift. Both sleeves are soft, so their band is a hinge
      penalty the optimiser may deliberately pay → context. Same number, different findings, and a
      page that renders them alike pages someone about the design working as intended.

    ⚠️ THE BASIS IS NATIVE, which inverts the standing reporting rule. Elsewhere the rule is "report
    with `attr_weight` (the blend contribution), feed an optimizer with `w_native`". Here the bands
    were expressed on the mandate's OWN book, so native is the only basis on which "outside the
    band" means anything. It is read from the stored `basis` column rather than assumed.

    ⚠️ A LEG IS NOT BANDED. Each leg is re-normalised to its own gross, so judging it against a
    limit imposed on the net would compare a percentage of one book to a bound set on another. The
    short leg is also `|w|` — a positive-weight book of what we are SHORT OF — so a positive
    reading there is a bet AGAINST that factor. Both facts are returned as `notes` so a renderer
    cannot quietly drop them.
    """
    _env(env)
    with get_db() as conn:
        # CAST(), not `:d::date` — the bind-parameter trap documented on `/positions`. The cast on
        # the `IS NULL` side is NOT cosmetic: pg8000 (the Windows dev driver) sends parameters
        # untyped, and Postgres cannot infer a type for one whose only context is `IS NULL` —
        # "could not determine data type of parameter $1", a 500 that appears on a developer
        # machine and never on the droplet, where psycopg2 substitutes client-side.
        d = conn.execute(text("""
            SELECT max(date) FROM trading.book_exposures
            WHERE (CAST(:strat AS text) IS NULL OR strategy = :strat)
              AND (CAST(:d AS date) IS NULL OR date = CAST(:d AS date))"""),
            {"strat": strategy, "d": date}).scalar()
        if d is None:
            # Not an error. Before the first book there is genuinely nothing to measure, and the
            # exposure of a book that does not exist yet is not a thing.
            return {"env": env, "date": None, "mandates": [], "degradations": [],
                    "note": "no book exposure has been measured yet — it rides the daily book "
                            "build, so it begins the day the book does ([10-LEXP])"}

        strat = conn.execute(text(
            "SELECT strategy FROM trading.book_exposures WHERE date = :d "
            "AND (CAST(:strat AS text) IS NULL OR strategy = :strat) "
            "ORDER BY strategy LIMIT 1"),
            {"d": d, "strat": strategy}).scalar()

        hdrs = conn.execute(text("""
            SELECT mandate, leg, basis, benchmark, b_asof, b_age_days, gross, leg_gross,
                   n_names, n_covered, coverage_weight, n_no_isin
            FROM trading.book_exposures
            WHERE date = :d AND strategy = :s
            ORDER BY mandate, leg"""), {"d": d, "s": strat}).mappings().all()

        facs = conn.execute(text("""
            SELECT mandate, leg, factor, kind, exposure, band, band_kind, breach
            FROM trading.book_exposure_factors
            WHERE date = :d AND strategy = :s
            ORDER BY mandate, leg, abs(exposure) DESC"""),
            {"d": d, "s": strat}).mappings().all()

        # THE BAND HISTORY, which is what makes "for how long" answerable at all. Only banded rows
        # (net-leg sectors) are pulled — legs carry no band, so they have no breach to have a
        # duration. Small: ~22 rows per mandate per day.
        hist = conn.execute(text("""
            SELECT date, mandate, factor, breach
            FROM trading.book_exposure_factors
            WHERE strategy = :s AND band IS NOT NULL AND date <= :d
            ORDER BY date"""), {"s": strat, "d": d}).mappings().all()

        span = conn.execute(text(
            "SELECT min(date) AS d0, count(DISTINCT date) AS n FROM trading.book_exposures "
            "WHERE strategy = :s AND date <= :d"), {"s": strat, "d": d}).mappings().first()

        # [10-LTE]'s half of the panel. Read from the row the nightly job wrote — this endpoint
        # does no risk arithmetic of its own, for the same reason it does no exposure arithmetic.
        risk = conn.execute(text("""
            SELECT mandate, te_target, cap_calibration, te_budget, pred_te, bias, bias_source,
                   expected_te, expected_te_se, factor_var, specific_var,
                   realized_te_63d, realized_te_252d, realized_te_incep,
                   n_obs, realized_se_incep, publishable, coverage_sigma, f_asof, sigma_asof
            FROM trading.book_risk WHERE strategy = :s AND date = :d"""),
            {"s": strat, "d": d}).mappings().all()
        risk_by_mandate = {r["mandate"]: r for r in risk}

    # ---- band history, folded once ----------------------------------------------------------
    dates = sorted({r["date"] for r in hist})
    by_key: dict[tuple, dict] = {}
    for r in hist:
        by_key.setdefault((r["mandate"], r["factor"]), {})[r["date"]] = bool(r["breach"])

    def band_run(mandate: str, factor: str) -> dict:
        """Total breached days in the measured history, and the length of the run ending at `d`.

        ⚠️ A RUN IS COUNTED IN MEASURED DAYS, NOT CALENDAR DAYS, and `history` is returned beside
        it: with a series a few days old, "0 breach-days" means "not since we started looking", not
        "never". Presenting the first as the second is the shape of a false all-clear.
        """
        seen = by_key.get((mandate, factor), {})
        total = sum(1 for v in seen.values() if v)
        run, since = 0, None
        for dt_ in reversed(dates):
            if seen.get(dt_):
                run += 1
                since = dt_
            else:
                break
        return {"breach_days": total, "run_days": run,
                "since": since.isoformat() if since else None}

    # ---- assemble ----------------------------------------------------------------------------
    mandates, degr = [], []
    for m in sorted({h["mandate"] for h in hdrs}):
        net_h = next((h for h in hdrs if h["mandate"] == m and h["leg"] == "net"), None)
        if net_h is None:
            continue
        net_f = [f for f in facs if f["mandate"] == m and f["leg"] == "net"]

        rows = [{
            "factor": f["factor"], "kind": f["kind"], "unit": _UNIT.get(f["kind"], "raw"),
            "exposure": _f(f["exposure"]),
            "band": _f(f["band"]), "band_kind": f["band_kind"],
            "breach": f["breach"],
            # Signed room, so a breach reads as a negative headroom rather than as a separate
            # concept the client has to special-case.
            "headroom": (_f(f["band"]) - abs(_f(f["exposure"])))
                        if f["band"] is not None else None,
        } for f in net_f]

        banded = [r for r in rows if r["band"] is not None]
        tightest = min(banded, key=lambda r: r["headroom"]) if banded else None

        breaches = [{**{k: r[k] for k in
                        ("factor", "kind", "exposure", "band", "band_kind", "headroom")},
                     **band_run(m, r["factor"]), "current": True}
                    for r in banded if r["breach"]]
        # A band breached earlier in the window but not today is still part of "where the book has
        # been" — the monthly's question. Reported, flagged not-current.
        for r in banded:
            if not r["breach"]:
                run = band_run(m, r["factor"])
                if run["breach_days"]:
                    breaches.append({**{k: r[k] for k in
                                        ("factor", "kind", "exposure", "band", "band_kind",
                                         "headroom")},
                                     **run, "current": False})

        legs = [{
            "leg": h["leg"], "benchmark": h["benchmark"],
            "leg_gross": _f(h["leg_gross"]), "n_names": h["n_names"],
            "factors": [{"factor": f["factor"], "kind": f["kind"],
                         "unit": _UNIT.get(f["kind"], "raw"), "exposure": _f(f["exposure"])}
                        for f in facs if f["mandate"] == m and f["leg"] == h["leg"]],
        } for h in hdrs if h["mandate"] == m and h["leg"] != "net"]

        cov = _f(net_h["coverage_weight"])
        if cov is not None and cov < _MIN_COVERAGE:
            degr.append(f"{m}: exposure covers only {cov:.0%} of gross — the uncovered weight is "
                        f"absent from every number below, not zero")
        if net_h["n_no_isin"]:
            degr.append(f"{m}: {net_h['n_no_isin']} position(s) carry no isin and cannot be "
                        f"measured against the risk model")

        mandates.append({
            "mandate": m,
            # None = measured ABSOLUTE (b = 0): a dollar-neutral sleeve is an outright bet, not a
            # relative one, and calling its benchmark "cash" would invite a relative reading.
            "benchmark": net_h["benchmark"],
            "basis": net_h["basis"],
            "gross": _f(net_h["gross"]),
            "n_names": net_h["n_names"],
            "n_covered": net_h["n_covered"],
            "coverage_weight": cov,
            "n_no_isin": net_h["n_no_isin"],
            "band": tightest["band"] if tightest else None,
            "band_kind": tightest["band_kind"] if tightest else None,
            # ---- [10-LTE]'s row, filled from trading.book_risk ([10-LEXPU] reserved the slot).
            #
            # ⚠️ THREE NUMBERS, AND `pred_te`/`bias` ARE NOT AMONG THEM. The risk model
            # under-predicts by ~70% consistently, so a panel showing "predicted 3.00% vs target
            # 3.0% ✓" would be reassuring and wrong. The bias is BAKED INTO `te_expected`; the raw
            # prediction and the factor travel in the payload as machinery for a methodology note,
            # never as report rows — a reader must not have to multiply two numbers together to
            # learn what the book is doing.
            #
            # ⚠️ `te_budget` IS NOT A DUPLICATE OF `te_target`. Nominal vs what the optimiser
            # actually spent (te_target × cap_calibration). The sleeve's W4 dial sits near its 0.5
            # floor, so a nominal 6% is a ~3.7% budget, and showing only the nominal would read
            # "target 6.0 / expected 6.3, on target" while the optimiser deliberately spent 3.7%.
            "risk": _risk_row(risk_by_mandate.get(m)),
            "risk_note": None if m in risk_by_mandate else
                         "tracking error has not been measured for this mandate yet — [10-LTE]",
            "tightest": tightest,
            "factors": rows,
            "legs": legs,
            "breaches": sorted(breaches, key=lambda b: (not b["current"], b["headroom"])),
        })

    b_age = hdrs[0]["b_age_days"] if hdrs else None
    if b_age is not None and b_age > _MAX_B_AGE_DAYS:
        degr.append(f"the risk model B is {b_age} days old — a month-end build has been missed, "
                    f"so these exposures describe the book against a stale matrix")
    # Calendar age of the measurement, in UTC — the F-009 rule. A job that never ran leaves no row
    # to look stale, so the age is taken against the clock, not against the newest row's neighbours.
    age = (dt.datetime.now(dt.timezone.utc).date() - d).days
    if age > 4:
        degr.append(f"the newest measured book is {age} days old")

    return {
        "env": env,
        "strategy": strat,
        "date": d.isoformat(),
        "b_asof": hdrs[0]["b_asof"].isoformat() if hdrs and hdrs[0]["b_asof"] else None,
        "b_age_days": b_age,
        # Returned so "0 breach-days" cannot be read as "never" on a series a few days old.
        "history": {"start": span["d0"].isoformat() if span and span["d0"] else None,
                    "n_days": int(span["n"]) if span else 0},
        "mandates": mandates,
        "degradations": degr,
        "notes": {
            "units": "sector and market exposures are active WEIGHTS (fractions of the mandate's "
                     "own book); style exposures are in STANDARD DEVIATIONS of cross-sectional "
                     "tilt. Each row carries its own `unit` — do not infer it from the factor name.",
            "basis": "NATIVE — each mandate's own book, not its blend contribution. The bands were "
                     "written on the native book, so it is the only basis on which 'outside the "
                     "band' means anything.",
            "legs": "each leg is re-normalised to its own gross and carries NO band; the short leg "
                    "is |w|, a positive-weight book of what we are SHORT OF, so a positive reading "
                    "there is a bet AGAINST that factor.",
            "bands": "a HARD breach means the optimiser could not have done this at construction, "
                     "so it is drift; a SOFT breach is a hinge penalty the optimiser may have paid "
                     "deliberately, so it is context.",
            "b": "B is re-estimated monthly and held fixed intra-month by design — that is what "
                 "lets price drift be visible. `b_asof` is its month-end.",
        },
    }
