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
from pydantic import BaseModel, Field
from sqlalchemy import text

from api.config import get_settings
from api.db import (approve_writes_enabled, get_approve_engine, get_db,
                    get_halt_engine, get_request_engine, halt_writes_enabled,
                    request_writes_enabled)

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
        return {"env": env, "rebalance_id": rebalance_id, "review": None,
                "can_approve": approve_writes_enabled()}
    return {"env": env, "rebalance_id": rebalance_id, "review": dict(rv),
            "can_approve": approve_writes_enabled()}


@router.get("/{env}/rebalances/{rebalance_id}/plan")
def rebalance_plan(env: str, rebalance_id: int,
                   kind: str = Query("preview", pattern="^(preview|final)$")):
    """The trade table. `preview` is the dry-run plan (display only); `final` is the contract.

    They are different objects and the caller must choose — a page that silently showed whichever
    existed would let an operator read rehearsal share counts as the ones about to be sent.
    """
    _env(env)
    with get_db() as conn:
        # Which SLEEVE each name comes from. The frozen provenance names the two component labels,
        # and their weights at the signal date are still in portfolio.weights — so the split is
        # read, not reconstructed.
        #
        # ⚠️ IT WORKS HERE BECAUSE THE UNIVERSES ARE DISJOINT. The core is S&P 500 and the sleeve is
        # R2500 501-2500, so no name appears in both (53 + 133 = 186 exactly, and the weights
        # reconcile: 1.000 + 0.5 x 0.626 = 1.313). Where two mandates DID overlap, the account
        # nets them per conid and the netting is not invertible from broker data
        # (`live_target_and_sleeve_ledger.md`) — attribution would then have to come from our own
        # records, not from a join like this one.
        src = conn.execute(text("SELECT source, signal_date FROM trading.rebalances "
                                "WHERE rebalance_id = :r"), {"r": rebalance_id}).mappings().first()
        sleeve_of: dict[str, str] = {}
        if src and src["source"]:
            labels = (src["source"] or {}).get("component_labels") or []
            for lbl in labels:
                tag = "sleeve" if "_ls_" in lbl else "core"
                for w in conn.execute(text(
                    "SELECT isin, weight FROM portfolio.weights "
                    "WHERE model_label = :l AND date = :d AND ABS(weight) > 1e-9"),
                        {"l": lbl, "d": src["signal_date"]}).mappings():
                    sleeve_of[w["isin"]] = tag

        rows = conn.execute(text("""
            SELECT p.ticker, p.conid, COALESCE(t.target_wt, 0) AS weight, p.current_qty,
                   p.target_qty, p.delta, p.side, p.planned_qty, p.ref_price, p.price,
                   p.price_src, p.est_notional, p.dust_filtered, p.note, p.planned_at,
                   t.isin, s.name AS company, s.sector, s.industry
            FROM trading.trade_plans p
            LEFT JOIN trading.target_positions t
                   ON t.rebalance_id = p.rebalance_id AND t.conid = p.conid
                  AND t.mandate = 'composite'
            LEFT JOIN secmaster.securities s ON s.isin = t.isin
            WHERE p.rebalance_id = :r AND p.plan_kind = :k
            ORDER BY ABS(COALESCE(p.est_notional, 0)) DESC"""),
            {"r": rebalance_id, "k": kind}).mappings().all()
    plan = [dict(r) for r in rows]
    for r in plan:
        r["sleeve"] = sleeve_of.get(r.get("isin") or "", "unknown")
    traded = [r for r in plan if r["side"] and not r["dust_filtered"]]
    return {"env": env, "rebalance_id": rebalance_id, "kind": kind, "plan": plan,
            "summary": {
                "n_rows": len(plan), "n_trades": len(traded),
                "n_buy": sum(1 for r in traded if r["side"] == "BUY"),
                "n_sell": sum(1 for r in traded if r["side"] == "SELL"),
                "n_dust": sum(1 for r in plan if r["dust_filtered"]),
                "gross_notional": float(sum(float(r["est_notional"] or 0) for r in traded)),
                "by_sleeve": {
                    tag: {
                        "n": sum(1 for r in traded if r["sleeve"] == tag),
                        "gross_notional": float(sum(float(r["est_notional"] or 0)
                                                    for r in traded if r["sleeve"] == tag)),
                    } for tag in ("core", "sleeve", "unknown")
                    if any(r["sleeve"] == tag for r in traded)
                },
            }}


@router.get("/{env}/rebalances/{rebalance_id}/exposures")
def rebalance_exposures(env: str, rebalance_id: int):
    """§3.9 — what the frozen book is BETTING ON, per sleeve, before you approve it.

    The pre-trade checks ask whether the book is SOUND (can we price it, borrow it, afford the
    margin). This asks what it is EXPOSED to — the class of error no per-name check can see,
    because every individual trade looks fine while forty of them together drift a sector to 8%
    active or lean the book onto size.

    Two views per sleeve: `factors` (the net, one row per factor) and — for a market-neutral book
    where the net is a difference of two large legs — `legs`, the long and short sides split apart.
    See the leg block below for why the net alone is not enough.

    ⚠️ EXPOSURES ONLY, NEVER CONTRIBUTIONS. `ret_contrib` needs the FOLLOWING month's factor
    returns (`build_attribution`: the holding-period return is `fr.loc[t_next]`), so for the book
    you are about to trade it does not exist and cannot. That is fine for this screen — pre-trade
    the question is "what am I taking on", not "what did it earn". Return attribution stays in
    Portfolios, where it is retrospective by nature.

    ⚠️ AND IT REPORTS ITS OWN AS-OF DATE. Attribution is computed by a local job, so the newest
    available date can lag the signal date. A stale exposure shown as current would be worse than
    none — it would describe a book you are not trading — so the date is part of the payload and
    `is_current` is computed, not assumed.
    """
    _env(env)
    with get_db() as conn:
        hdr = conn.execute(text("SELECT source, signal_date FROM trading.rebalances "
                                "WHERE rebalance_id = :r"),
                           {"r": rebalance_id}).mappings().first()
        if hdr is None:
            raise HTTPException(status_code=404, detail="no such rebalance")
        sig = hdr["signal_date"]
        labels = ((hdr["source"] or {}).get("component_labels") or [])

        sleeves = []
        for lbl in labels:
            tag = "sleeve" if "_ls_" in lbl else "core"
            asof = conn.execute(text(
                "SELECT max(date) FROM portfolio.attribution "
                "WHERE model_label = :l AND date <= :d"), {"l": lbl, "d": sig}).scalar()
            if asof is None:
                sleeves.append({"sleeve": tag, "label": lbl, "as_of": None, "is_current": False,
                                "factors": [], "note": "no attribution computed for this book yet"})
                continue
            rows = conn.execute(text("""
                SELECT factor, active_exposure, risk_var_contrib
                FROM portfolio.attribution
                WHERE model_label = :l AND date = :d AND factor NOT IN ('total', 'specific')
                  AND active_exposure IS NOT NULL
                ORDER BY ABS(active_exposure) DESC"""),
                {"l": lbl, "d": asof}).mappings().all()
            spec = conn.execute(text(
                "SELECT risk_var_contrib FROM portfolio.attribution "
                "WHERE model_label = :l AND date = :d AND factor = 'specific'"),
                {"l": lbl, "d": asof}).scalar()

            # ⚠️ THE NET IS NOT THE BOOK, FOR A MARKET-NEUTRAL SLEEVE ([10-EXPO]). The rows above
            # are attributed with b = 0, so they are the OUTRIGHT NET of longs minus shorts: a net
            # of +7% earnings_yield is equally consistent with +2%/−21% and with +8%/+1%. When the
            # leg split exists for this book, serve it — same date, so it describes the same book.
            #
            # `long`/`short` are each normalised to their own gross and measured against the
            # universe's cap-weighted benchmark; `benchmark` is that b's own exposure, kept so the
            # decomposition can be re-checked without the risk model (see GATE D in
            # build_attribution). The SHORT leg is |w|, a positive book of what you are SHORT OF —
            # so a positive profitability reading there is a bet AGAINST profitability, and the
            # client is required to say so.
            legs = conn.execute(text("""
                SELECT leg, factor, active_exposure, leg_gross, n_names
                FROM portfolio.leg_exposures
                WHERE model_label = :l AND date = :d
                ORDER BY leg, ABS(active_exposure) DESC"""),
                {"l": lbl, "d": asof}).mappings().all()

            sleeves.append({
                "sleeve": tag, "label": lbl, "as_of": asof, "is_current": asof == sig,
                "specific_risk_var": spec,
                # Sectors and styles answer different questions and a PM reads them separately —
                # "am I accidentally long energy" is not "am I accidentally long size".
                "factors": [{"factor": r["factor"],
                             "kind": ("sector" if r["factor"].startswith("sec_")
                                      else "market" if r["factor"] == "market" else "style"),
                             "active_exposure": r["active_exposure"],
                             "risk_var_contrib": r["risk_var_contrib"]} for r in rows],
                "legs": [{"leg": r["leg"], "factor": r["factor"],
                          "kind": ("sector" if r["factor"].startswith("sec_")
                                   else "market" if r["factor"] == "market" else "style"),
                          "active_exposure": r["active_exposure"],
                          "leg_gross": r["leg_gross"], "n_names": r["n_names"]}
                         for r in legs],
            })
    return {"env": env, "rebalance_id": rebalance_id, "signal_date": sig, "sleeves": sleeves}


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
            "SELECT step, ord, label, act, manual_only, telemetry, notes, manual_cmd, "
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

        # ARTIFACT VERIFICATION — the same "check the output, not the job row" principle the
        # readiness panel is built on, applied backwards. A step can be provably complete with NO
        # telemetry: target generation produced the book rebalance #5 was frozen from, but it ran
        # before its run_log instrumentation existed. Reporting that as "no record" is true and
        # useless; the honest answer is "it completed — here is the output".
        artifacts = {}
        if hdr is not None:
            sig = hdr["signal_date"]
            for step, sql in (
                ("factor_build",
                 "SELECT count(*) FROM factor.scores WHERE date = :d"),
                ("broad_build",
                 "SELECT count(*) FROM factor.scores_full WHERE date = :d"),
                ("target_gen",
                 "SELECT count(*) FROM portfolio.weights w JOIN portfolio.backtest_meta m "
                 "  ON m.model_label = w.model_label "
                 "WHERE m.is_production AND w.date = :d"),
            ):
                try:
                    artifacts[step] = int(conn.execute(text(sql), {"d": sig}).scalar() or 0)
                except Exception:                                     # noqa: BLE001
                    conn.rollback()
                    artifacts[step] = None

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
            if hdr["status"] == "cancelled" and not hdr["approved_at"]:
                run = {"status": "failed", "started_at": None, "finished_at": None,
                       "detail": "cancelled without approval"}
            elif hdr["approved_at"]:
                run = {"status": "ok", "started_at": hdr["approved_at"],
                       "finished_at": hdr["approved_at"],
                       "detail": f"approved by {hdr['approved_by']} (claimed, not authenticated)"}
            elif hdr["status"] == "proposed":
                run = {"status": "awaiting", "started_at": None, "finished_at": None,
                       "detail": "review the pre-trade checks, then approve"}
        # No telemetry, but the output is there: say so, and say how we know.
        if run is None and artifacts.get(step):
            run = {"status": "ok", "started_at": None, "finished_at": None,
                   "detail": f"no run record, but its output is present "
                             f"({artifacts[step]:,} rows at {hdr['signal_date']}) — verified by "
                             f"artifact, not telemetry"}

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
            # {id} resolved server-side against the OPEN rebalance, so the operator copies a
            # command that is ready to run rather than one they must edit under time pressure.
            "manual_cmd": (s["manual_cmd"] or "").replace(
                "{id}", str(rebalance_id) if rebalance_id is not None else "N") or None,
            "ran_at": run["finished_at"] or run["started_at"] if run else None,
            "detail": run["detail"] if run else None,
            "notes": s["notes"],
        })

    # "Happened but unrecorded" must not look like "hasn't happened yet" — the same collapse rule
    # (b) forbids at the ok/warn/failed end. If a LATER step has run, every earlier step must have
    # run too (you cannot freeze a book that was never generated), so a missing record there is a
    # gap in telemetry, not a step still to come. Live example: target generation produced the
    # book rebalance 5 was frozen from, but ran before its run_log instrumentation existed.
    #
    # ⚠️ NEVER INFER FOR A MANUAL-ONLY STEP. The premise is a DATA dependency — you cannot freeze a
    # book that was never generated — and it does not hold for a human gate. Rebalance 7 proves it:
    # a drill that deliberately sent orders WITHOUT approval, whose approval row the inference
    # then described as "ran before this step had telemetry". Asserting that a human approved
    # something when `approved_at` is NULL is the worst thing this ledger could say.
    done = [s["ord"] for s in out if s["state"] in ("ok", "warn", "failed", "awaiting")]
    if done:
        furthest = max(done)
        for s in out:
            if s["ord"] < furthest and s["state"] == "not_due" and not s["manual_only"]:
                s["state"] = "no_record"
                s["detail"] = s["detail"] or "ran before this step had telemetry — no record kept"

    stale = None
    if sched:
        stale = max(s["collected_at"] for s in sched)
    return {"env": env, "rebalance": dict(hdr) if hdr else None, "steps": out,
            "schedule_collected_at": stale}


@router.get("/{env}/readiness")
def readiness(env: str):
    """§3.9 — upstream freshness, surfaced days early.

    "A late factor build puts the rebalance at risk on trade day, and that is knowable on the 2nd
    rather than discovered on the 5th."

    ⚠️ IT CHECKS THE OUTPUTS, NOT THE JOB STATUSES. The ledger already shows whether each build
    RAN; this asks the different and more important question — did the data the next rebalance
    needs actually LAND for the month-end we are about to trade? That distinction is the whole
    F-006 lesson: the daily job reported "complete" every weekday for months while five things
    underneath it were dead. A green job row is not evidence of a green artifact.

    The chain is a chain: factor.scores feeds the models, the models feed portfolio.weights, and
    the freeze copies portfolio.weights. A hole anywhere upstream surfaces at the freeze, which is
    two days before the trade and far too late to rebuild a 2.5-hour factor panel.
    """
    _env(env)
    with get_db() as conn:
        # The month-end we are trading. The open rebalance names it; with none open, the last
        # completed month-end is the one the NEXT rebalance will use.
        signal = conn.execute(text(
            "SELECT signal_date FROM trading.rebalances "
            "WHERE status NOT IN ('cancelled','closed','reconciled') "
            "ORDER BY rebalance_id DESC LIMIT 1")).scalar()
        if signal is None:
            signal = conn.execute(text(
                "SELECT MAX(date) FROM clean.prices WHERE date < date_trunc('month', now())")
            ).scalar()

        prod_labels = [r[0] for r in conn.execute(text(
            "SELECT model_label FROM portfolio.backtest_meta WHERE is_production LIMIT 5")).all()]

        checks = []

        def add(name, what, sql, params, why):
            # A check that cannot RUN is its own state — never "present" and never "missing".
            # Reporting an unreadable artifact as missing would cry wolf on trade morning;
            # reporting it as present is the failure this whole panel exists to prevent. And one
            # ungranted table must not 500 the page: the other checks are still worth having.
            try:
                row = conn.execute(text(sql), params).mappings().first()
            except Exception as e:                                    # noqa: BLE001
                conn.rollback()
                checks.append({"name": name, "what": what, "rows": None, "present": None,
                               "landed_at": None, "why": why,
                               "error": f"cannot check: {type(e).__name__}"})
                return
            n = int(row["n"] or 0) if row else 0
            checks.append({"name": name, "what": what, "rows": n, "present": n > 0,
                           "landed_at": (row or {}).get("landed_at"), "why": why,
                           "error": None})

        add("factor.scores", "SP500 feature panel",
            "SELECT count(*) AS n, NULL::timestamptz AS landed_at "
            "FROM factor.scores WHERE date = :d", {"d": signal},
            "the 53-feature panel the models read; without it there are no predictions")
        add("factor.scores_full", "R2500 feature panel",
            "SELECT count(*) AS n, NULL::timestamptz AS landed_at "
            "FROM factor.scores_full WHERE date = :d", {"d": signal},
            "the broad universe, built chained behind the SP500 panel (~2h20m)")
        add("targets.forward_returns", "training targets",
            "SELECT count(*) AS n, NULL::timestamptz AS landed_at "
            "FROM targets.forward_returns WHERE eom_date = :d", {"d": signal},
            "what the models are trained against")
        for lbl in prod_labels:
            add(f"portfolio.weights · {lbl[:34]}", "the book itself",
                "SELECT count(*) AS n, NULL::timestamptz AS landed_at FROM portfolio.weights "
                "WHERE model_label = :l AND date = :d", {"l": lbl, "d": signal},
                "the optimizer's output — this is what the freeze copies")

        # Calendar pressure. Deliberately counted in WEEKDAYS since the month-end rather than
        # against a computed TD3: the trade date is the 3rd TRADING day (operating_calendar.md),
        # holidays shift it, and half-implementing an exchange calendar for a warning banner would
        # be a worse error than reporting the elapsed window honestly.
        elapsed = conn.execute(text(
            # CAST(...), not `:d::date` — SQLAlchemy reads the `::` cast as part of the bind
            # parameter name and hands Postgres a syntax error.
            "SELECT count(*) FROM generate_series(CAST(:d AS date) + 1, current_date, "
            "                                     INTERVAL '1 day') g "
            "WHERE extract(isodow FROM g) < 6"), {"d": signal}).scalar() or 0

    missing = [c for c in checks if c["present"] is False]
    unknown = [c for c in checks if c["present"] is None]
    verdict = ("unknown" if unknown and not missing else
               "ready" if not missing else
               "late" if elapsed >= 3 else
               "at_risk" if elapsed >= 2 else "building")
    return {"env": env, "signal_date": signal, "weekdays_since_month_end": int(elapsed),
            "checks": checks, "n_missing": len(missing), "n_unknown": len(unknown),
            "verdict": verdict,
            "note": ("Trade day is TD3, the 3rd trading day of the month "
                     "(operating_calendar.md). Everything above must be present before the freeze.")}


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


# =================================================================================================
# THE ONE WRITE ([10-RBAL] phase 3)
#
# The web surface gets the HALT half of the kill switch and nothing else (§3.8). Reasons, in order:
#
#   * Halting is the half that WORKS. With MKT/DAY most of what has been sent is already filled, so
#     cancel-all mostly cancels nothing, while the halt reliably saves the unsent remainder.
#   * Halting is a tiny privilege — it writes a flag. Cancel-all means the website's backend gaining
#     authority to talk to IBKR and cancel orders, which deserves its own design, not a free ride.
#   * ⚠️ THIS MUST NEVER BE THE ONLY PATH. The frontend is Vercel and the API is on the droplet, so
#     if the droplet is degraded this button dies exactly when it is needed. `jobs.kill_switch` and
#     the IBKR browser stay first-class, and the file flag stays the no-dependency path.
#
# Latency-to-halt is the metric this control is judged on, not feature count.
# =================================================================================================

@router.get("/{env}/halt")
def halt_state(env: str, rebalance_id: int | None = None):
    """Current halt state. Read-only, so it works even when the write path is not configured."""
    _env(env)
    with get_db() as conn:
        row = conn.execute(text("""
            SELECT halt_id, rebalance_id, set_at, set_by, source, reason
            FROM trading.halts
            WHERE cleared_at IS NULL AND (rebalance_id IS NULL OR rebalance_id = :r)
            ORDER BY set_at LIMIT 1"""), {"r": rebalance_id}).mappings().first()
        recent = conn.execute(text(
            "SELECT halt_id, rebalance_id, set_at, set_by, source, reason, cleared_at, cleared_by "
            "FROM trading.halts ORDER BY set_at DESC LIMIT 10")).mappings().all()
    return {"env": env, "halted": row is not None, "active": dict(row) if row else None,
            "history": [dict(r) for r in recent],
            "can_write": halt_writes_enabled(),
            # The file half is invisible from here BY DESIGN — it lives on the droplet's disk and
            # this API may be the thing that is broken. The UI must say so rather than imply that
            # "not halted" is the whole truth.
            "file_flag_not_visible_here": True}


class HaltRequest(BaseModel):
    by: str = Field(min_length=1, max_length=80)
    reason: str = Field(min_length=1, max_length=500)
    rebalance_id: int | None = None


@router.post("/{env}/halt")
def set_halt(env: str, body: HaltRequest):
    """Stop the submitter before its next order.

    Writes `trading.halts`; `orders.halted()` reads it before EVERY order, so a running basket
    stops between any two of its 186. It does not cancel anything already working at the broker —
    that is `jobs.kill_switch`, deliberately CLI-only.

    `by` is a CLAIMED name (Q1). It is recorded, not verified, and the UI says so.
    """
    _env(env)
    eng = get_halt_engine()
    if eng is None:
        # 503, not 500: the capability is absent, not broken. And the message points at the path
        # that still works, because a halt request is not a moment for a bare error.
        raise HTTPException(status_code=503, detail=(
            "halt write path not configured on this deployment — use the CLI: "
            "python -m jobs.kill_switch --rebalance-id N --halt-only"))
    with eng.begin() as conn:
        if body.rebalance_id is not None:
            ok = conn.execute(text("SELECT 1 FROM trading.rebalances WHERE rebalance_id = :r"),
                              {"r": body.rebalance_id}).first()
            if not ok:
                raise HTTPException(status_code=404, detail="no such rebalance")
        # ON CONFLICT DO NOTHING against halts_one_active: a second click while a halt is already
        # in force is a no-op, not a duplicate row and not an error. The caller asked for trading
        # to be stopped; trading is stopped.
        row = conn.execute(text(
            "INSERT INTO trading.halts (rebalance_id, set_by, source, reason) "
            "VALUES (:r, :by, 'web', :reason) ON CONFLICT DO NOTHING RETURNING halt_id"),
            {"r": body.rebalance_id, "by": body.by, "reason": body.reason}).first()
    return {"env": env, "halted": True, "halt_id": row[0] if row else None,
            "already_halted": row is None,
            "note": ("The submitter stops before its next order. Orders already WORKING at the "
                     "broker are not cancelled — that is jobs.kill_switch, which is CLI-only.")}


@router.post("/{env}/halt/clear")
def clear_halt(env: str, body: HaltRequest):
    """Lift the DB halt.

    ⚠️ Clearing here does NOT clear the file flag, which lives on the droplet's disk and is the
    path that survives this API being down. If a halt was set by the CLI, `jobs.kill_switch
    --clear` is what lifts it. The response says so, because an operator who believes they have
    cleared a halt and then cannot trade will not enjoy discovering the other half by experiment.
    """
    _env(env)
    eng = get_halt_engine()
    if eng is None:
        raise HTTPException(status_code=503, detail="halt write path not configured")
    with eng.begin() as conn:
        n = conn.execute(text(
            "UPDATE trading.halts SET cleared_at = now(), cleared_by = :by "
            "WHERE cleared_at IS NULL AND rebalance_id IS NOT DISTINCT FROM :r"),
            {"by": body.by, "r": body.rebalance_id}).rowcount
    return {"env": env, "cleared": n, "halted": False,
            "note": ("Cleared the DATABASE halt only. A halt set from the CLI also wrote a file "
                     "flag on the droplet, which this cannot see or remove — use "
                     "`python -m jobs.kill_switch --clear` for that.")}


# =================================================================================================
# THE APPROVAL GATE (Q2, [10-RBAL] phase 4)
#
# The one place a human is REQUIRED to make a decision. The web version can do strictly less than
# the CLI, on purpose: it cannot recompute a review — that needs a broker session, which this API
# must never hold (§3.8) — so it can only RATIFY one that already exists, is fresh, is clean, and
# is the one the operator actually had on screen. Anything else goes to the terminal, where the
# full output is in front of them when they decide.
# =================================================================================================

APPROVE_MAX_REVIEW_AGE_S = 4 * 3600


class ApproveRequest(BaseModel):
    by: str = Field(min_length=1, max_length=80)
    # The review the browser was DISPLAYING. Required: approving without naming what you read is
    # the "someone looked at this screen once" that §3.2 exists to rule out.
    review_id: int
    phrase: str | None = Field(default=None, max_length=40)
    note: str | None = Field(default=None, max_length=500)


@router.post("/{env}/rebalances/{rebalance_id}/approve")
def approve(env: str, rebalance_id: int, body: ApproveRequest):
    """Mark a proposed rebalance approved. Submits NOTHING — execution is a separate, deliberate
    second action (§3.2) and remains CLI-only.

    ⚠️ EVERY PRECONDITION IS RE-CHECKED HERE against the database, ignoring what the browser
    believes (Q2: the write path is never trusted). The browser is a display; this is the gate.
    Five refusals, each for a different way an approval could be hollow:

      1. not 'proposed'   — already approved, submitted or cancelled underneath the page
      2. no review at all — nobody has looked; there is nothing to ratify
      3. stale review     — a pre-trade check computed hours ago is not a pre-trade check
      4. a FAILED check   — the web has no --force. Overriding is a judgement that belongs in the
                            terminal with the full output visible, not behind a button
      5. a NEWER review   — the operator read one thing and clicked on another. Refuse and make
                            them look again; this is what `approved_review_id` exists for
    """
    _env(env)
    # A deliberate word, typed, not a button alone — the same shape as execution so the two most
    # consequential actions on the site feel the same and neither can be fired by a stray click.
    if (body.phrase or "").strip().lower() != "approve":
        raise HTTPException(status_code=400, detail="type 'approve' to confirm")
    eng = get_approve_engine()
    if eng is None:
        raise HTTPException(status_code=503, detail=(
            "approval write path not configured on this deployment — approve from the CLI: "
            f"python -m jobs.approve_rebalance --rebalance-id {rebalance_id} --approver NAME"))

    with eng.begin() as conn:
        hdr = conn.execute(text(
            "SELECT status FROM trading.rebalances WHERE rebalance_id = :r"),
            {"r": rebalance_id}).mappings().first()
        if hdr is None:
            raise HTTPException(status_code=404, detail="no such rebalance")
        if hdr["status"] != "proposed":
            raise HTTPException(status_code=409, detail=(
                f"rebalance is '{hdr['status']}', not 'proposed' — nothing to approve"))

        rv = conn.execute(text("""
            SELECT review_id, worst_state, summary,
                   EXTRACT(EPOCH FROM (now() - computed_at)) AS age_s
            FROM trading.rebalance_reviews
            WHERE rebalance_id = :r ORDER BY computed_at DESC LIMIT 1"""),
            {"r": rebalance_id}).mappings().first()
        if rv is None:
            raise HTTPException(status_code=409, detail=(
                "no pre-trade review exists for this rebalance. Run it first — approving a book "
                "nobody has checked is exactly what this gate prevents."))
        if int(rv["review_id"]) != int(body.review_id):
            # "different", not "newer": the id sent may be stale OR simply wrong, and asserting
            # which is a guess. What matters is that the operator read something other than the
            # current review, and the fix is the same either way.
            raise HTTPException(status_code=409, detail=(
                f"the current review is #{rv['review_id']}, not the #{body.review_id} your screen "
                f"was showing. Reload and read it before approving."))
        if float(rv["age_s"]) > APPROVE_MAX_REVIEW_AGE_S:
            raise HTTPException(status_code=409, detail=(
                f"the review is {float(rv['age_s']) / 3600:.1f} h old. Re-run it against current "
                "positions and quotes — a stale pre-trade check is not a pre-trade check."))
        if rv["worst_state"] == "fail":
            raise HTTPException(status_code=409, detail=(
                "a pre-trade check FAILED. The website has no override: approve from the CLI with "
                "--force if you have decided the failure is acceptable, so that the full output is "
                "in front of you when you do."))

        note = (f"APPROVED via web by {body.by} (claimed, not authenticated) against review "
                f"#{rv['review_id']}: {rv['summary'] or ''}")
        if body.note:
            note += f"  |  {body.note}"
        # WHERE status='proposed' again, inside the same transaction: optimistic concurrency, so
        # two operators clicking at the same moment cannot both succeed.
        n = conn.execute(text(
            "UPDATE trading.rebalances "
            "SET status = 'approved', approved_by = :by, approved_at = now(), "
            "    approved_review_id = :rev, "
            "    notes = COALESCE(notes || E'\\n', '') || :note "
            "WHERE rebalance_id = :r AND status = 'proposed'"),
            {"by": body.by, "rev": rv["review_id"], "note": note, "r": rebalance_id}).rowcount
        if not n:
            raise HTTPException(status_code=409,
                                detail="rebalance changed underneath the approval")
    return {"env": env, "rebalance_id": rebalance_id, "status": "approved",
            "approved_review_id": int(rv["review_id"]),
            "note": ("Approval recorded. NOTHING has been submitted — execution is a separate "
                     "action and remains CLI-only: "
                     f"python run_rebalance.py --rebalance-id {rebalance_id} --execute")}


# =================================================================================================
# TIER-1 TRIGGERS ([10-RBAL] phase 5, §3.10)
#
# THE WEBSITE NEVER RUNS A STEP. IT REQUESTS ONE. A button writes a row here; `jobs.run_worker` on
# the droplet picks it up. Three reasons, none stylistic:
#
#   * Duration — a 186-order submission takes minutes, and HTTP request/response is the wrong shape
#     for it. You would be fighting gateway timeouts on the most important call in the system.
#   * Ambiguity — if the browser closes mid-request you get a half-executed step of unknown extent,
#     which is exactly the state the cOID design exists to make impossible (F-011).
#   * It is the plan-is-a-contract principle again: write the intent down, then act on it. A
#     durable row survives a reboot, gives the ledger its queued->running->ok/failed states for
#     free, and is the audit record of who asked for what.
#
# ONE CODE PATH: the scheduler and the button enqueue the SAME row. A separate manual path rots
# quietly and then fails during an incident, which is the only time anyone reaches for it.
# =================================================================================================

# Tier 1 only — idempotent, no money moves. `approval` is a decision with its own endpoint above;
# `execution` sends real orders and is the LAST thing to get a trigger, behind the auth boundary
# that makes website auth into trading auth. The worker refuses both again independently.
TRIGGERABLE = {"freeze", "dry_run", "fill_capture", "factor_build", "target_gen"}


class RunRequest(BaseModel):
    step: str = Field(min_length=1, max_length=40)
    by: str = Field(min_length=1, max_length=80)
    rebalance_id: int | None = None


@router.post("/{env}/run-requests")
def enqueue_run(env: str, body: RunRequest):
    """Ask for a step to run. Returns as soon as the intent is recorded — it does not wait.

    The 409 on an already-active request is the partial unique index doing its job: a double-click
    must not double-run. It is reported as "already queued", not as an error, because that is what
    the operator needs to know.
    """
    _env(env)
    if body.step not in TRIGGERABLE:
        raise HTTPException(status_code=400, detail=(
            f"'{body.step}' cannot be triggered from the web. Approval has its own gate, and "
            f"execution sends real orders — both stay deliberate human actions (§3.10)."))
    eng = get_request_engine()
    if eng is None:
        raise HTTPException(status_code=503,
                            detail="run-request path not configured on this deployment")
    try:
        with eng.begin() as conn:
            if body.rebalance_id is not None:
                ok = conn.execute(text("SELECT 1 FROM trading.rebalances WHERE rebalance_id = :r"),
                                  {"r": body.rebalance_id}).first()
                if not ok:
                    raise HTTPException(status_code=404, detail="no such rebalance")
            row = conn.execute(text(
                "INSERT INTO trading.run_requests (rebalance_id, step, source, requested_by) "
                "VALUES (:r, :s, 'web', :by) RETURNING request_id"),
                {"r": body.rebalance_id, "s": body.step, "by": body.by}).first()
    except HTTPException:
        raise
    except Exception as e:                                            # noqa: BLE001
        if "run_requests_one_active" in str(e):
            raise HTTPException(status_code=409, detail=(
                f"'{body.step}' is already queued or running for this rebalance — "
                f"one at a time, so a double-click cannot double-run."))
        raise
    return {"env": env, "request_id": row[0], "step": body.step, "status": "queued",
            "note": "Queued. The droplet worker polls every minute; watch the ledger for the result."}


# =================================================================================================
# EXECUTION FROM THE WEB (user decision, 2026-08-05)
#
# §3.10 sanctioned this for PAPER — "acceptable, with confirm-to-arm and the HALT control on the
# same screen" — and forbade it for live. This implements the paper half.
#
# TWO SECRETS, BECAUSE THEY PROVE DIFFERENT THINGS:
#
#   * The typed PHRASE ("execute 5") proves INTENT, and it carries the rebalance id so muscle
#     memory cannot fire on the wrong book. It is not a secret and is not treated as one.
#   * The PASSCODE proves AUTHORITY. The site sits behind one shared login, so having the page open
#     is not evidence of anything; a second secret that is not the site's means the person clicking
#     holds the trading credential. Checked server-side with a constant-time compare, never sent to
#     the browser, never in any response.
#
# Neither is the real protection. The real protection is that this endpoint cannot execute
# anything — it can only put a row in a queue, and the worker re-reads the database and refuses
# unless the book is APPROVED and nothing is halted.
# =================================================================================================

# A SECOND allow-list, deliberately not `ENVS`. If 'live' is ever added there for a read screen,
# execution must not silently become available with it — the two lists have different reasons to
# change, so they are different lists.
EXECUTE_ENVS = {"paper"}


class ExecuteRequest(BaseModel):
    by: str = Field(min_length=1, max_length=80)
    phrase: str = Field(min_length=1, max_length=60)


@router.post("/{env}/rebalances/{rebalance_id}/execute")
def execute(env: str, rebalance_id: int, body: ExecuteRequest):
    """Request execution of an APPROVED rebalance. Queues it; the droplet worker submits.

    It does not send orders itself and it does not wait for them. A 186-order submission takes
    minutes, and holding an HTTP request open across it is how you get a half-executed rebalance of
    unknown extent when a browser closes — the exact state the cOID design exists to prevent.
    """
    _env(env)
    if env not in EXECUTE_ENVS:
        raise HTTPException(status_code=403, detail="execution is not available in this environment")

    # ⚠️ NO PASSCODE — user decision 2026-08-05, PAPER ONLY. The typed phrase proves intent; on a
    # paper account with simulated fills and no client money, a second secret is friction without
    # a matching risk. What actually guards this is unchanged and is not in the browser: the worker
    # re-reads the database and refuses unless the book is APPROVED and nothing is halted.
    #
    # This is explicitly a paper-grade control. Live execution is a different decision that Q1
    # (per-user auth) and Q3 (live access control) both gate, and `EXECUTE_ENVS` keeps it out.
    if body.phrase.strip().lower() != "execute":
        raise HTTPException(status_code=400, detail="type 'execute' to confirm")

    eng = get_request_engine()
    if eng is None:
        raise HTTPException(status_code=503, detail="run-request path not configured")

    with get_db() as conn:
        hdr = conn.execute(text("SELECT status FROM trading.rebalances WHERE rebalance_id = :r"),
                           {"r": rebalance_id}).mappings().first()
        if hdr is None:
            raise HTTPException(status_code=404, detail="no such rebalance")
        if hdr["status"] != "approved":
            raise HTTPException(status_code=409, detail=(
                f"rebalance is '{hdr['status']}', not 'approved'. Approval is a separate, "
                f"deliberate action and it has to happen first."))
        halt = conn.execute(text(
            "SELECT set_by, reason FROM trading.halts WHERE cleared_at IS NULL "
            "AND (rebalance_id IS NULL OR rebalance_id = :r) LIMIT 1"),
            {"r": rebalance_id}).mappings().first()
        if halt:
            raise HTTPException(status_code=409, detail=(
                f"trading is HALTED by {halt['set_by']} — {halt['reason']}. Clear the halt first."))

    try:
        with eng.begin() as conn:
            row = conn.execute(text(
                "INSERT INTO trading.run_requests (rebalance_id, step, source, requested_by) "
                "VALUES (:r, 'execution', 'web', :by) RETURNING request_id"),
                {"r": rebalance_id, "by": body.by}).first()
    except Exception as e:                                            # noqa: BLE001
        if "run_requests_one_active" in str(e):
            raise HTTPException(status_code=409, detail=(
                "execution is already queued or running for this rebalance. Watch the ledger — "
                "do not queue a second one."))
        raise
    return {"env": env, "rebalance_id": rebalance_id, "request_id": row[0], "status": "queued",
            "note": ("Queued. The worker picks it up within a minute, re-checks that the book is "
                     "approved and unhalted, then submits in waves. HALT stops it between orders.")}


@router.get("/{env}/run-requests")
def list_runs(env: str, rebalance_id: int | None = None, limit: int = Query(20, ge=1, le=100)):
    """Recent run requests — the queued->running->ok/failed trail the ledger renders."""
    _env(env)
    with get_db() as conn:
        rows = conn.execute(text("""
            SELECT request_id, rebalance_id, step, source, requested_by, requested_at,
                   status, started_at, finished_at, result
            FROM trading.run_requests
            WHERE (:r IS NULL OR rebalance_id = :r)
            ORDER BY requested_at DESC LIMIT :lim"""),
            {"r": rebalance_id, "lim": limit}).mappings().all()
    return {"env": env, "requests": [dict(r) for r in rows],
            "can_request": request_writes_enabled(),
            "can_execute": request_writes_enabled() and env in EXECUTE_ENVS,
            "triggerable": sorted(TRIGGERABLE)}
