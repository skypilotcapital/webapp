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
            "SELECT step, ord, label, act, manual_only, telemetry, notes "
            "FROM trading.cycle_steps ORDER BY ord")).mappings().all()

        sched = conn.execute(text(
            "SELECT step, unit, kind, schedule, enabled, next_run, last_run, collected_at "
            "FROM trading.scheduled_jobs WHERE step IS NOT NULL")).mappings().all()
        by_step = {}
        for s in sched:
            by_step.setdefault(s["step"], []).append(dict(s))

        # Observed runs. job_runs covers the trading-repo steps; run_log covers the data/alpha
        # ones. Both are queried for THIS cycle only — an 'ok' from last month must not make this
        # month's step look done.
        since = hdr["proposed_at"] if hdr and hdr["proposed_at"] else None
        runs = conn.execute(text("""
            SELECT job AS step, status, started_at, finished_at, detail
            FROM trading.job_runs
            WHERE (:since IS NULL OR started_at >= :since - interval '7 days')
            ORDER BY started_at DESC"""), {"since": since}).mappings().all()
        latest_run = {}
        for r in runs:
            latest_run.setdefault(r["step"], dict(r))

        plog = conn.execute(text("""
            SELECT step, status, started_at, completed_at, error_msg
            FROM pipeline.run_log
            WHERE flow IN ('target_gen', 'build_factor_layer')
              AND started_at >= now() - interval '35 days'
            ORDER BY started_at DESC""")).mappings().all()
        # The ten-step target_gen chain rolls up to ONE ledger row: the operator wants to know
        # whether the book got built, not which of ten sub-steps is running.
        tg = [p for p in plog if p["status"] is not None]
        target_gen = None
        if tg:
            failed = next((p for p in tg if p["status"] not in ("complete", "ok")), None)
            newest = tg[0]
            target_gen = {"status": "fail" if failed else "ok",
                          "started_at": newest["started_at"],
                          "finished_at": newest["completed_at"],
                          "detail": (failed["error_msg"] if failed
                                     else f"{len(tg)} step(s) recorded, latest {newest['step']}")}

        review = None
        if rebalance_id is not None:
            review = conn.execute(text(
                "SELECT computed_at, worst_state FROM trading.rebalance_reviews "
                "WHERE rebalance_id = :r ORDER BY computed_at DESC LIMIT 1"),
                {"r": rebalance_id}).mappings().first()

    out = []
    for s in steps:
        step, sched_rows = s["step"], by_step.get(s["step"], [])
        run = latest_run.get(step)
        if step == "target_gen" and target_gen:
            run = target_gen
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

        out.append({
            "step": step, "label": s["label"], "act": s["act"], "ord": s["ord"],
            "mode": "manual" if s["manual_only"] else ("scheduled" if sched_rows else "manual"),
            "manual_only": s["manual_only"],
            "scheduled": sched_rows or None,
            "chained": "CHAINED" in (s["notes"] or ""),
            "state": state,
            "ran_at": run["finished_at"] or run["started_at"] if run else None,
            "detail": run["detail"] if run else None,
            "notes": s["notes"],
        })

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
