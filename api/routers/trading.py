"""
Trading — the operational surface ([10-RBAL] phase 1).

Answers "what are we about to do, did it happen, do the books agree?" — the third question the
site asks, after Research's "which strategy?" and Portfolios' "how is it doing?". Design:
`10_trading_live_ops/trading_ui_IA.md`.

TWO BOUNDARIES THIS ROUTER DOES NOT CROSS, both deliberate:

1. **It never talks to IBKR.** Positions, quotes and margin what-ifs all need a broker session,
   and a website backend that can talk to the broker is a much larger grant than anything here
   needs (§3.8 — the web gets the halt FLAG, not the authority to cancel orders). So the pre-trade
   review is COMPUTED on the droplet by `review.py` and this router serves the stored snapshot,
   with its `computed_at` exposed so the page can show staleness. A review is only a pre-trade
   check if it was computed against the state you are about to trade from.

2. **It is read-only.** Every write in the design — approval, halt, run requests — arrives in a
   later phase behind its own narrow role (§9.1 Q2), and `skypilot_app` has SELECT and nothing
   else. Reads are unblocked at the DB layer today; writes are not, on purpose.

`{env}` is validated against an allow-list and `live` 404s until a live account exists, so the
route cannot be reached by guessing the URL (Q3).
"""

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from api.db import get_db

router = APIRouter(prefix="/api/v1/trading", tags=["trading"])

# Only 'paper' resolves today. Live 404s — NOT 403 — so there is no surface to probe (Q3).
ENVS = {"paper"}


def _env(env: str) -> str:
    if env not in ENVS:
        raise HTTPException(status_code=404, detail="unknown environment")
    return env


@router.get("/{env}/rebalances")
def rebalances(env: str, limit: int = Query(25, ge=1, le=200)):
    """Rebalance list, newest first. The OPEN one leads; the rest are the archive.

    Archive on STATE, not on time (§3.7): a time rule would archive a rebalance that is still
    unreconciled — exactly the one you most need in front of you.
    """
    _env(env)
    with get_db() as conn:
        rows = conn.execute(text("""
            SELECT r.rebalance_id, r.strategy, r.signal_date, r.status, r.sized_equity,
                   r.proposed_at, r.approved_by, r.approved_at, r.submitted_at, r.closed_at,
                   r.source ->> 'label' AS label,
                   (SELECT count(*) FROM trading.target_positions t
                     WHERE t.rebalance_id = r.rebalance_id AND t.mandate = 'composite') AS n_names,
                   (r.status NOT IN ('cancelled', 'closed', 'reconciled'))               AS is_open
            FROM trading.rebalances r
            ORDER BY r.rebalance_id DESC
            LIMIT :lim"""), {"lim": limit}).mappings().all()
    return {"env": env, "rebalances": [dict(r) for r in rows]}


@router.get("/{env}/rebalances/{rebalance_id}")
def rebalance_detail(env: str, rebalance_id: int):
    """Header + provenance + the append-only event history."""
    _env(env)
    with get_db() as conn:
        hdr = conn.execute(text(
            "SELECT rebalance_id, strategy, signal_date, status, sized_equity, source, notes, "
            "       proposed_at, approved_by, approved_at, submitted_at, closed_at "
            "FROM trading.rebalances WHERE rebalance_id = :r"),
            {"r": rebalance_id}).mappings().first()
        if hdr is None:
            raise HTTPException(status_code=404, detail="no such rebalance")
        events = conn.execute(text(
            "SELECT at, kind, from_status, to_status, actor, detail "
            "FROM trading.rebalance_events WHERE rebalance_id = :r ORDER BY at"),
            {"r": rebalance_id}).mappings().all()
        orders = conn.execute(text(
            "SELECT status, count(*) AS n FROM ibkr.orders WHERE rebalance_id = :r GROUP BY status"),
            {"r": rebalance_id}).mappings().all()
    return {"env": env, "header": dict(hdr),
            "events": [dict(e) for e in events],
            "orders": {o["status"]: o["n"] for o in orders}}


@router.get("/{env}/rebalances/{rebalance_id}/review")
def rebalance_review(env: str, rebalance_id: int):
    """The latest stored pre-trade review.

    `computed_at` and `is_stale` are part of the payload, not decoration: this is a SNAPSHOT of a
    broker-dependent computation, and a review from three days ago is not a pre-trade check. The
    page must render age prominently.
    """
    _env(env)
    with get_db() as conn:
        rv = conn.execute(text("""
            SELECT review_id, computed_at, computed_by, worst_state, n_trades, gross_notional,
                   pct_margin, checks, summary,
                   (now() - computed_at) > interval '4 hours' AS is_stale,
                   EXTRACT(EPOCH FROM (now() - computed_at))  AS age_seconds
            FROM trading.rebalance_reviews
            WHERE rebalance_id = :r ORDER BY computed_at DESC LIMIT 1"""),
            {"r": rebalance_id}).mappings().first()
    if rv is None:
        # Not an error: a rebalance simply may not have been reviewed yet. The page says so
        # rather than showing an empty checklist, which would read as "all clear".
        return {"env": env, "rebalance_id": rebalance_id, "review": None}
    return {"env": env, "rebalance_id": rebalance_id, "review": dict(rv)}


@router.get("/{env}/rebalances/{rebalance_id}/plan")
def rebalance_plan(env: str, rebalance_id: int,
                   kind: str = Query("preview", pattern="^(preview|final)$")):
    """The trade table. `preview` is the dry-run plan (display only); `final` is the contract.

    They are different objects and the caller must choose — a page that silently showed whichever
    existed would let an operator read rehearsal share counts as the ones about to be sent.
    """
    _env(env)
    with get_db() as conn:
        rows = conn.execute(text("""
            SELECT p.ticker, p.conid, COALESCE(t.target_wt, 0) AS weight, p.current_qty,
                   p.target_qty, p.delta, p.side, p.planned_qty, p.ref_price, p.price,
                   p.price_src, p.est_notional, p.dust_filtered, p.note, p.planned_at
            FROM trading.trade_plans p
            LEFT JOIN trading.target_positions t
                   ON t.rebalance_id = p.rebalance_id AND t.conid = p.conid
                  AND t.mandate = 'composite'
            WHERE p.rebalance_id = :r AND p.plan_kind = :k
            ORDER BY ABS(COALESCE(p.est_notional, 0)) DESC"""),
            {"r": rebalance_id, "k": kind}).mappings().all()
    plan = [dict(r) for r in rows]
    traded = [r for r in plan if r["side"] and not r["dust_filtered"]]
    return {"env": env, "rebalance_id": rebalance_id, "kind": kind, "plan": plan,
            "summary": {
                "n_rows": len(plan), "n_trades": len(traded),
                "n_buy": sum(1 for r in traded if r["side"] == "BUY"),
                "n_sell": sum(1 for r in traded if r["side"] == "SELL"),
                "n_dust": sum(1 for r in plan if r["dust_filtered"]),
                "gross_notional": float(sum(float(r["est_notional"] or 0) for r in traded)),
            }}


@router.get("/{env}/ledger")
def ledger(env: str, rebalance_id: int | None = None):
    """S7 — the rebalance as an ordered PROCESS with a clock. One row per step.

    THE THREE RULES THIS ENDPOINT EXISTS TO OBEY (§3.7):

    (a) The step list comes from `cycle_steps` (logical order — domain knowledge no scheduler
        holds) and the SCHEDULE from `scheduled_jobs`, mirrored hourly from real systemd timers
        and crontab. Neither is hand-maintained here.

    (b) Four states, not two. `not_due` (nothing scheduled or not reached yet) must not look like
        `ok`, and neither may look like `failed`. `job_runs` already carries `warn` for
        completed-but-degraded, and it is preserved end to end.

    (c) `manual_only` is permanent for approval — the Mode column should say so forever.

    A step whose telemetry does not exist yet reports `state='unbuilt'`, which the UI must render
    distinctly. Reconciliation is the live example: showing it as "not due" would imply it is
    coming, when in fact nothing will ever write it until [10-P4] lands.
    """
    _env(env)
    with get_db() as conn:
        if rebalance_id is None:
            open_r = conn.execute(text(
                "SELECT rebalance_id FROM trading.rebalances "
                "WHERE status NOT IN ('cancelled','closed','reconciled') "
                "ORDER BY rebalance_id DESC LIMIT 1")).scalar()
            rebalance_id = open_r
        hdr = None
        if rebalance_id is not None:
            hdr = conn.execute(text(
                "SELECT rebalance_id, strategy, signal_date, status, proposed_at, approved_by, "
                "       approved_at, submitted_at FROM trading.rebalances WHERE rebalance_id = :r"),
                {"r": rebalance_id}).mappings().first()

        steps = conn.execute(text(
            "SELECT step, ord, label, act, manual_only, telemetry, notes, "
            "       COALESCE(job_name, step) AS job_name "
            "FROM trading.cycle_steps ORDER BY ord")).mappings().all()

        sched = conn.execute(text(
            "SELECT step, unit, kind, schedule, enabled, next_run, last_run, collected_at "
            "FROM trading.scheduled_jobs WHERE step IS NOT NULL")).mappings().all()
        by_step = {}
        for s in sched:
            by_step.setdefault(s["step"], []).append(dict(s))

        # Observed runs, scoped to THIS REBALANCE — not to a time window.
        #
        # ⚠️ It was a 7-day window first, and the ledger promptly showed rebalance 7's fill-capture
        # drill as rebalance 5's fill capture, which in turn made `execution` infer it had run.
        # "Last month's ok must not make this month's step look done" needs the cycle key, not a
        # date range; `trading.job_runs.rebalance_id` exists for this.
        runs = conn.execute(text("""
            SELECT job, status, started_at, finished_at, detail
            FROM trading.job_runs
            WHERE rebalance_id = :rid
            ORDER BY started_at DESC"""),
            {"rid": rebalance_id}).mappings().all() if rebalance_id is not None else []
        latest_run = {}
        for r in runs:
            latest_run.setdefault(r["job"], dict(r))

        # The data-side steps are multi-step CHAINS in pipeline.run_log, and each rolls up to one
        # ledger row: the operator wants to know whether the book got built, not which of ten
        # sub-steps is running. `mode` is the discriminator — 'as-of' is the monthly SP500 factor
        # build, 'broad' the R2500 one, and target_gen is its own flow.
        plog = conn.execute(text("""
            SELECT flow, mode, step, status, started_at, completed_at, error_msg
            FROM pipeline.run_log
            WHERE (flow = 'target_gen' OR (flow = 'build_factor_layer' AND mode IN ('as-of','broad')))
              AND started_at >= now() - interval '35 days'
            ORDER BY started_at DESC""")).mappings().all()

        review = None
        if rebalance_id is not None:
            review = conn.execute(text(
                "SELECT computed_at, worst_state FROM trading.rebalance_reviews "
                "WHERE rebalance_id = :r ORDER BY computed_at DESC LIMIT 1"),
                {"r": rebalance_id}).mappings().first()

    def _rollup(rows):
        """Latest attempt per sub-step, then worst outcome.

        ⚠️ Latest ATTEMPT, not any attempt. On 2026-08-01 the monthly build's `quality` step
        errored at 01:00 and succeeded on the 02:18 retry; a rollup that flagged any failure in
        the window would render a recovered chain as failed forever, which is the mirror image of
        the collapse rule (b) forbids.
        """
        latest = {}
        for r in rows:                                    # rows arrive newest-first
            latest.setdefault(r["step"], r)
        if not latest:
            return None
        bad = [r for r in latest.values() if r["status"] not in ("complete", "ok")]
        newest = max(latest.values(), key=lambda r: r["started_at"])
        return {"status": "fail" if bad else "ok",
                "started_at": newest["started_at"], "finished_at": newest["completed_at"],
                "detail": (f"{len(bad)} step(s) failed: "
                           + ", ".join(f"{r['step']} ({(r['error_msg'] or '')[:40]})" for r in bad)
                           if bad else
                           f"{len(latest)} step(s) complete, latest {newest['step']}")}

    chain_runs = {
        "target_gen":   _rollup([p for p in plog if p["flow"] == "target_gen"]),
        "factor_build": _rollup([p for p in plog if p["flow"] == "build_factor_layer"
                                 and p["mode"] == "as-of"]),
        "broad_build":  _rollup([p for p in plog if p["flow"] == "build_factor_layer"
                                 and p["mode"] == "broad"]),
    }

    out = []
    for s in steps:
        step, sched_rows = s["step"], by_step.get(s["step"], [])
        # Key on job_name, not step: `freeze` is recorded by a job called `freeze_targets`, and
        # assuming the two strings match made a step that ran read as "no record".
        run = latest_run.get(s["job_name"])
        if chain_runs.get(step):
            run = chain_runs[step]
        # The human gate is not a job: its evidence is the rebalance row itself.
        if step == "approval" and hdr:
            if hdr["approved_at"]:
                run = {"status": "ok", "started_at": hdr["approved_at"],
                       "finished_at": hdr["approved_at"],
                       "detail": f"approved by {hdr['approved_by']} (claimed, not authenticated)"}
            elif hdr["status"] == "proposed":
                run = {"status": "awaiting", "started_at": None, "finished_at": None,
                       "detail": "waiting on a human"}
        if step == "dry_run" and review is not None and run is None:
            run = {"status": review["worst_state"].replace("fail", "warn"),
                   "started_at": review["computed_at"], "finished_at": review["computed_at"],
                   "detail": "review computed"}

        if run:
            state = {"ok": "ok", "warn": "warn", "fail": "failed", "running": "running",
                     "awaiting": "awaiting"}.get(run["status"], run["status"])
        elif s["telemetry"] and "not built" in (s["notes"] or ""):
            state = "unbuilt"
        else:
            state = "not_due"

        chained = "CHAINED" in (s["notes"] or "")
        out.append({
            "step": step, "label": s["label"], "act": s["act"], "ord": s["ord"],
            "mode": ("manual" if s["manual_only"] else
                     "chained" if chained else
                     "scheduled" if sched_rows else "manual"),
            "manual_only": s["manual_only"],
            "scheduled": sched_rows or None,
            "chained": chained,
            "state": state,
            "ran_at": run["finished_at"] or run["started_at"] if run else None,
            "detail": run["detail"] if run else None,
            "notes": s["notes"],
        })

    # "Happened but unrecorded" must not look like "hasn't happened yet" — the same collapse rule
    # (b) forbids at the ok/warn/failed end. If a LATER step has run, every earlier step must have
    # run too (you cannot freeze a book that was never generated), so a missing record there is a
    # gap in telemetry, not a step still to come. Live example: target generation produced the
    # book rebalance 5 was frozen from, but ran before its run_log instrumentation existed.
    done = [s["ord"] for s in out if s["state"] in ("ok", "warn", "failed", "awaiting")]
    if done:
        furthest = max(done)
        for s in out:
            if s["ord"] < furthest and s["state"] == "not_due":
                s["state"] = "no_record"
                s["detail"] = s["detail"] or "ran before this step had telemetry — no record kept"

    stale = None
    if sched:
        stale = max(s["collected_at"] for s in sched)
    return {"env": env, "rebalance": dict(hdr) if hdr else None, "steps": out,
            "schedule_collected_at": stale}


@router.get("/{env}/health")
def health(env: str):
    """S6-lite: job outcomes and the freshness of the schedule mirror.

    A mirror that silently stopped refreshing is the reassuring-but-wrong artifact §3.7 rule (a)
    is about, so its own age is a first-class field here.
    """
    _env(env)
    with get_db() as conn:
        jobs = conn.execute(text(
            "SELECT DISTINCT ON (job) job, status, started_at, finished_at, detail "
            "FROM trading.job_runs ORDER BY job, started_at DESC")).mappings().all()
        acct = conn.execute(text(
            "SELECT snap_ts, account_id, net_liquidation, excess_liquidity, gross_position_value "
            "FROM ibkr.account_snapshots ORDER BY snap_ts DESC LIMIT 1")).mappings().first()
        sched_age = conn.execute(text(
            "SELECT max(collected_at) FROM trading.scheduled_jobs")).scalar()
    return {"env": env, "jobs": [dict(j) for j in jobs],
            "account": dict(acct) if acct else None,
            "schedule_collected_at": sched_age}


@router.get("/{env}/rebalances/{rebalance_id}/blotter")
def blotter(env: str, rebalance_id: int):
    """S4 — plan vs actual, keyed to OUR rebalance.

    Not a broker blotter: IBKR has one and it is better. This shows the thing the broker cannot,
    because the broker never saw the plan — what we meant to trade beside what happened.

    Semantics mirror `orders.fill_reconciliation` in the trading repo deliberately, so the screen
    and the CLI cannot disagree about the same rebalance:

      * `filled` is SUM(qty) and sales are stored SIGNED, so a residual is planned − filled.
      * `slip_bps` is signed so POSITIVE ALWAYS MEANS WORSE FOR US, whichever side we were on,
        measured against the plan price — the arrival reference the share count was derived from.
      * ⚠️ Slippage is NULL where nothing filled. An avg price of 0 there means "no data", and
        running it through the formula prints a confident −10,000 bps for every unfilled name.
      * Dust and side-less rows are excluded: they were never orders.

    Feeds open question [06-T7] (cost-model calibration against real fills) — arrival-vs-fill by
    name and size is exactly that dataset, so it comes back in a shape that exports.
    """
    _env(env)
    with get_db() as conn:
        rows = conn.execute(text("""
            SELECT p.ticker, p.conid, p.side, p.delta AS planned, p.price AS plan_price,
                   p.est_notional, o.coid, o.status, o.ibkr_order_id, o.qty AS submitted_qty,
                   o.submitted_at, o.last_status_at,
                   COALESCE(f.filled, 0) AS filled, f.avg_price,
                   COALESCE(f.commission, 0) AS commission, COALESCE(f.n, 0) AS n_fills,
                   f.first_fill, f.last_fill
            FROM trading.trade_plans p
            LEFT JOIN ibkr.orders o
                   ON o.rebalance_id = p.rebalance_id AND o.conid = p.conid
            LEFT JOIN (SELECT internal_order_id, SUM(qty) AS filled, COUNT(*) AS n,
                              SUM(ABS(qty) * price) / NULLIF(SUM(ABS(qty)), 0) AS avg_price,
                              SUM(commission) AS commission,
                              MIN(exec_ts) AS first_fill, MAX(exec_ts) AS last_fill
                       FROM ibkr.executions GROUP BY 1) f
                   ON f.internal_order_id = o.internal_order_id
            WHERE p.rebalance_id = :r AND p.plan_kind = 'final'
              AND p.dust_filtered = FALSE AND p.side IS NOT NULL
            ORDER BY ABS(COALESCE(p.delta, 0) - COALESCE(f.filled, 0)) DESC"""),
            {"r": rebalance_id}).mappings().all()

        # The cross-check on a lying trades endpoint: orders the BROKER calls filled for which we
        # hold no execution rows. `capture_fills` reporting "0 new executions" is indistinguishable
        # from a healthy no-op, so it has to be compared against something independent.
        unexplained = conn.execute(text("""
            SELECT o.coid, o.status, o.conid
            FROM ibkr.orders o
            WHERE o.rebalance_id = :r AND o.status IN ('filled', 'partial')
              AND NOT EXISTS (SELECT 1 FROM ibkr.executions e
                               WHERE e.internal_order_id = o.internal_order_id)"""),
            {"r": rebalance_id}).mappings().all()

    out, roll = [], {"planned": 0, "submitted": 0, "filled": 0, "unfilled": 0, "partial": 0,
                     "rejected": 0, "commission": 0.0, "est_cost": 0.0}
    for r in rows:
        d = dict(r)
        planned = float(d["planned"] or 0)
        filled = float(d["filled"] or 0)
        d["residual"] = planned - filled
        px, avg = d["plan_price"], d["avg_price"]
        # NULL, not zero — see the docstring. A confident wrong number is worse than a blank.
        d["slip_bps"] = (
            (float(avg) - float(px)) / float(px) * 10_000 * (1 if planned > 0 else -1)
            if filled and px and avg and float(px) != 0 else None)
        out.append(d)

        roll["planned"] += 1
        if d["coid"]:
            roll["submitted"] += 1
        if d["status"] == "rejected":
            roll["rejected"] += 1
        elif filled == 0:
            roll["unfilled"] += 1
        elif abs(filled) < abs(planned):
            roll["partial"] += 1
        else:
            roll["filled"] += 1
        roll["commission"] += float(d["commission"] or 0)
        roll["est_cost"] += float(d["est_notional"] or 0)

    # Rejected and unfilled to the top — they are the rows that need a decision.
    rank = {"rejected": 0, "unfilled": 1, "partial": 2}
    def _key(d):
        s = ("rejected" if d["status"] == "rejected" else
             "unfilled" if not float(d["filled"] or 0) else
             "partial" if abs(float(d["filled"] or 0)) < abs(float(d["planned"] or 0)) else "done")
        return (rank.get(s, 3), -abs(float(d["est_notional"] or 0)))
    out.sort(key=_key)

    filled_rows = [d for d in out if d["slip_bps"] is not None]
    roll["avg_slip_bps"] = (sum(d["slip_bps"] for d in filled_rows) / len(filled_rows)
                            if filled_rows else None)
    return {"env": env, "rebalance_id": rebalance_id, "rows": out, "rollup": roll,
            "unexplained_fills": [dict(u) for u in unexplained]}
