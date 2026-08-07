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
                   s.tied_out, s.nav_vs_broker, s.unresolved_breaks
            FROM trading.book_daily b
            LEFT JOIN trading.book_daily_status s
                   ON s.date = b.date AND s.strategy = b.strategy
            WHERE (:strat IS NULL OR b.strategy = :strat)
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
            degr.append(f"{b['unresolved_breaks']} unresolved reconciliation break(s)")
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
            WHERE (:strat IS NULL OR strategy = :strat)
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
            WHERE (:strat IS NULL OR strategy = :strat)
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
            WHERE ((:rid IS NULL AND status = ANY(:ex)) OR rebalance_id = :rid)
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

        # Fill vs the plan's reference price, per traded dollar. Signed so that positive = we paid
        # away (bought higher / sold lower than reference) — the direction a cost should read in.
        slip = conn.execute(text("""
            SELECT sum(CASE WHEN o.side = 'BUY'  THEN (e.price - p.ref_price) * abs(e.qty)
                            WHEN o.side = 'SELL' THEN (p.ref_price - e.price) * abs(e.qty)
                       END)                                    AS slip_usd,
                   sum(abs(e.qty * e.price))                    AS notional
            FROM ibkr.executions e
            JOIN ibkr.orders o      ON o.internal_order_id = e.internal_order_id
            JOIN trading.trade_plans p ON p.rebalance_id = o.rebalance_id
                                      AND p.conid = o.conid AND p.plan_kind = 'final'
            WHERE o.rebalance_id = :r AND p.ref_price IS NOT NULL"""),
            {"r": rid}).mappings().first()

        # What the cost model PREDICTED for this book, so the two sit side by side.
        #
        # TWO SOURCES, plan-first. `trade_plans.est_cost_bps` is written at INSERT time from the
        # inputs the trade was sized on — the number we want. `plan_cost_estimates` carries LATE
        # predictions for plans frozen before that code existed (the plan itself is immutable, so
        # they cannot be written into it). A DB trigger allows a late row only where the plan's own
        # column is NULL, so the COALESCE cannot pick between two live copies of one number.
        # `source` is returned so the page can say which it showed.
        pred = conn.execute(text("""
            SELECT sum(COALESCE(p.est_cost_bps, e.est_cost_bps) * abs(p.est_notional))
                     / NULLIF(sum(abs(p.est_notional)) FILTER (
                         WHERE COALESCE(p.est_cost_bps, e.est_cost_bps) IS NOT NULL), 0)  AS bps,
                   count(*) FILTER (WHERE p.est_cost_bps IS NOT NULL)                     AS n_plan,
                   count(*) FILTER (WHERE p.est_cost_bps IS NULL
                                      AND e.est_cost_bps IS NOT NULL)                     AS n_late,
                   max(e.panel_date)                                                      AS panel_date,
                   max(e.panel_lag_days)                                                  AS panel_lag
            FROM trading.trade_plans p
            LEFT JOIN trading.plan_cost_estimates e
                   ON e.rebalance_id = p.rebalance_id AND e.conid = p.conid
                  AND e.plan_kind = p.plan_kind
            WHERE p.rebalance_id = :r AND p.plan_kind = 'final'"""),
            {"r": rid}).mappings().first()

    traded = _f(fills["notional"]) or 0.0
    comm = _f(fills["commission"]) or 0.0
    slip_usd = _f(slip["slip_usd"]) if slip else None

    def _bps(usd):
        return (usd / traded * 1e4) if (usd is not None and traded) else None

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
        "cost": {
            "commission_usd": comm,
            "commission_bps": _bps(comm),
            "slippage_usd": slip_usd,
            "slippage_bps": _bps(slip_usd),
            "realized_bps": _bps((comm or 0) + (slip_usd or 0)),
            "model_predicted_bps": _f(pred["bps"]) if pred else None,
            # [06-T7]. Named rather than left to the page to subtract, because the sign convention
            # (positive = we spent more than the model said) is the whole content of the number.
            "vs_model_bps": (_bps((comm or 0) + (slip_usd or 0)) - _f(pred["bps"]))
                            if (pred and pred["bps"] is not None and traded) else None,
            # Provenance, because a prediction written at plan time and one computed afterwards are
            # different claims and the page must not present them as the same one.
            "prediction_source": (None if not pred or pred["bps"] is None
                                  else "plan" if not pred["n_late"]
                                  else "backfill" if not pred["n_plan"] else "mixed"),
            "prediction_panel_date": (str(pred["panel_date"])
                                      if pred and pred["panel_date"] else None),
            "prediction_panel_lag_days": (int(pred["panel_lag"])
                                          if pred and pred["panel_lag"] is not None else None),
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
            WHERE (:d IS NULL OR date = CAST(:d AS date))"""), {"d": date}).scalar()
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
