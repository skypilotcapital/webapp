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

import csv
import io
import json

from fastapi import APIRouter, HTTPException, Query, Response
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
        # Repair lineage, BOTH directions. A reader landing on either book must be able to tell a
        # REPAIR from a RE-DECISION and find the other half — otherwise a cancelled book looks
        # abandoned and its replacement looks like it appeared from nowhere.
        succ = conn.execute(text(
            "SELECT rebalance_id, status, proposed_at FROM trading.rebalances "
            "WHERE (source->'repair'->>'repair_of')::int = :r ORDER BY rebalance_id"),
            {"r": rebalance_id}).mappings().all()

    src = hdr["source"]
    if isinstance(src, str):
        src = json.loads(src)
    rep = (src or {}).get("repair")
    return {"env": env, "header": dict(hdr),
            "events": [dict(e) for e in events],
            "orders": {o["status"]: o["n"] for o in orders},
            # present => this book IS a repair of `repair_of`; absent => an ordinary freeze
            "repair": rep,
            "superseded_by": [dict(s) for s in succ]}


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


# --- [10-TACT] position-state semantics --------------------------------------------------------
# ⚠️ MIRROR OF `Code_Repo/trading/rebalance.py::action_of`. THE SOURCE OF TRUTH IS THERE — it is
# where the console review, the executor and the unit test (`tests/test_action_semantics.py`) read
# it from. This copy exists only because the webapp cannot import the trading repo, and any change
# to the vocabulary or the transition rules has to be made in BOTH places or the screen and the
# terminal will describe the same order differently.
#
# It is deliberately NOT the same thing as the submission wave (`rebalance.wave_of`): a wave says
# WHEN an order may be sent and classifies a zero-crossing by what it does first; an action says
# what the order DOES and never files a flip under a trim. See rebalance.py for the full argument.
#
# Not stored: it is a pure function of two columns that are (`current_qty`, `target_qty`), and
# persisting a derived value is how two copies of it get to disagree.
_ACTIONS = ["open_long", "add", "trim", "close_long", "flip_short",
            "open_short", "add_short", "cover", "close_short", "flip_long", "hold", "dust"]


def _action_of(current_qty, target_qty, dust: bool = False):
    if target_qty is None:
        return None                    # unresolved: we do not know what it would do
    cur, tgt = int(current_qty or 0), int(target_qty or 0)
    if tgt == cur:
        return "hold"
    if dust:
        return "dust"
    if cur == 0:
        return "open_long" if tgt > 0 else "open_short"
    if cur > 0:
        if tgt > cur:
            return "add"
        if tgt > 0:
            return "trim"
        return "close_long" if tgt == 0 else "flip_short"
    if tgt < cur:
        return "add_short"
    if tgt < 0:
        return "cover"
    return "close_short" if tgt == 0 else "flip_long"


def _in_sleeve(row: dict, tag: str) -> bool:
    """Does this row belong in the `tag` tab?

    A `composite` name belongs in BOTH — it is genuinely in both mandates, and hiding it from each
    tab because it is in the other is the worst of the three options. It still renders as ONE row
    carrying the netted delta, badged `composite`, so the tab totals deliberately double-count it;
    `summary.n_composite` is published so that arithmetic can be reconciled rather than puzzled at.
    """
    if row["sleeve"] == tag:
        return True
    return row["sleeve"] == "composite" and tag in (row.get("mandate_wt") or {})


def _mandate_weights(conn, reb) -> dict:
    """{isin: {'core': wt, 'sleeve': wt}} for one rebalance's frozen book.

    TWO SOURCES, in order of authority:

    1. `trading.target_positions` rows with mandate <> 'composite'. This is the frozen record of
       the split, written by `freeze.py` as part of [10-LEDG]. Preferred whenever it exists.
    2. `portfolio.weights` on the frozen provenance's component labels, for rebalances frozen
       before (1) existed. ⚠️ This is a RECONSTRUCTION, not a record: `portfolio.weights` is
       delete-and-rewritten wholesale by every `--persist` run, so a re-run of the model can
       change — or empty — the mandate attribution shown against an old rebalance. That is the
       reason (1) exists and why it wins.

    ⚠️ NOTE FOR ANY OTHER READER OF `target_positions`: once the mandate rows are written the table
    holds ~3 rows per name, so a query that does not name a mandate counts the book twice. The
    quiet version of that bug is a dict keyed by isin where the last row wins and one mandate's
    slice silently replaces the whole position. The trade-plan join above stays pinned to
    `mandate = 'composite'` — the tradable row — for exactly this reason.
    """
    out: dict[str, dict[str, float]] = {}
    if not reb:
        return out
    for r in conn.execute(text("""
        SELECT mandate, isin, target_wt FROM trading.target_positions
        WHERE rebalance_id = :r AND mandate <> 'composite'"""),
            {"r": reb["rebalance_id"]}).mappings():
        out.setdefault(r["isin"], {})[r["mandate"]] = float(r["target_wt"] or 0)
    if out:
        return out

    for lbl in ((reb["source"] or {}).get("component_labels") or []):
        tag = "sleeve" if "_ls_" in lbl else "core"
        for w in conn.execute(text(
            "SELECT isin, weight FROM portfolio.weights "
            "WHERE model_label = :l AND date = :d AND ABS(weight) > 1e-9"),
                {"l": lbl, "d": reb["signal_date"]}).mappings():
            out.setdefault(w["isin"], {})[tag] = float(w["weight"])
    return out


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
        src = conn.execute(text(
            "SELECT rebalance_id, strategy, source, signal_date FROM trading.rebalances "
            "WHERE rebalance_id = :r"), {"r": rebalance_id}).mappings().first()
        mandate_wt = _mandate_weights(conn, src)

        # ⚠️ ONE ROW PER ORDER ([10-TACT] gap 3, decided 2026-08-07). A name can be reachable from
        # BOTH mandates — an S&P 500 member that has fallen below rank 500 is in the core because
        # it is in the index and in the sleeve because of where it ranks, potentially long in one
        # and short in the other. The account nets it to one position and `trade_plans` is keyed
        # (rebalance_id, conid), so there is exactly one order; the table must not invent a second
        # row for it. It gets ONE row tagged `composite`, carrying the netted delta, with the
        # per-mandate split alongside so the reader can see where it came from.
        #
        # This used to be a silent last-write-wins overwrite of a single-valued dict, which is the
        # bad failure: the name would simply have been filed under whichever component label was
        # read last, with nothing on screen to say a choice had been made.
        sleeve_of = {isin: (next(iter(m)) if len(m) == 1 else "composite")
                     for isin, m in mandate_wt.items()}

        # What we INTENDED to hold at the last rebalance. This is the only mandate attribution
        # available for a name we are exiting (it is not in today's book, so today's weights say
        # nothing about it) — and it is the one number here that must never be read as a holding.
        # The broker nets both mandates into one quantity per conid and THE NETTING IS NOT
        # INVERTIBLE from broker data (`live_target_and_sleeve_ledger.md`), so what we actually
        # hold per mandate comes from our own ledger ([10-LEDG], unbuilt). The gap between intent
        # and holding is precisely what [10-SHFL] measures; conflating them here would corrupt
        # that number at its source. `current_qty` below is the position; this is intent.
        # ⚠️ EVERY STATUS FROM `approved` ONWARDS, spelled out against the table's own CHECK
        # constraint (draft/proposed/approved/submitted/filled/reconciled/closed/cancelled). A
        # guessed vocabulary here fails the worst way available: the query returns no prior
        # rebalance, every prior column renders '—', and nothing anywhere says the lookup missed.
        # `draft`/`proposed` never became a book; `cancelled` was abandoned.
        prior = conn.execute(text("""
            SELECT rebalance_id, strategy, source, signal_date FROM trading.rebalances
            WHERE strategy = :s AND rebalance_id < :r
              AND status IN ('approved','submitted','filled','reconciled','closed')
            ORDER BY rebalance_id DESC LIMIT 1"""),
            {"s": (src or {}).get("strategy"), "r": rebalance_id}).mappings().first()
        prior_mandate_wt = _mandate_weights(conn, prior)
        prior_wt = {isin: sum(m.values()) for isin, m in prior_mandate_wt.items()}
        prior_sleeve = {isin: (next(iter(m)) if len(m) == 1 else "composite")
                        for isin, m in prior_mandate_wt.items()}

        rows = conn.execute(text("""
            SELECT p.ticker, p.conid, COALESCE(t.target_wt, 0) AS weight, p.current_qty,
                   p.target_qty, p.delta, p.side, p.planned_qty, p.ref_price, p.price,
                   p.price_src, p.est_notional, p.dust_filtered, p.note, p.planned_at,
                   COALESCE(t.isin, ic.isin) AS isin,
                   s.name AS company, s.sector, s.industry
            FROM trading.trade_plans p
            LEFT JOIN trading.target_positions t
                   ON t.rebalance_id = p.rebalance_id AND t.conid = p.conid
                  AND t.mandate = 'composite'
            -- ⚠️ An EXIT has no target row ([10-TACT] gap 1), so `t.isin` is NULL for it and the
            -- securities join used to fall through: no company, no sector, and therefore no way
            -- to place it in a sleeve tab. The conid bridge resolves it independently of today's
            -- book, which is the point — an exit is defined by NOT being in today's book.
            LEFT JOIN secmaster.ibkr_contracts ic ON ic.conid = p.conid
            LEFT JOIN secmaster.securities s ON s.isin = COALESCE(t.isin, ic.isin)
            WHERE p.rebalance_id = :r AND p.plan_kind = :k
            ORDER BY ABS(COALESCE(p.est_notional, 0)) DESC"""),
            {"r": rebalance_id, "k": kind}).mappings().all()
    plan = [dict(r) for r in rows]
    for r in plan:
        isin = r.get("isin") or ""
        r["action"] = _action_of(r["current_qty"], r["target_qty"], bool(r["dust_filtered"]))
        r["mandate_wt"] = mandate_wt.get(isin) or None
        # An exit is in no sleeve TODAY — that is what makes it an exit. Fall back to the sleeve it
        # was in last month so it lands in a tab instead of in 'unknown', and flag which of the two
        # we used: `prior` is intent, not holding, and the column header has to say so.
        r["sleeve"] = sleeve_of.get(isin) or prior_sleeve.get(isin) or "unknown"
        r["sleeve_src"] = ("target" if isin in sleeve_of
                           else "prior_intent" if isin in prior_sleeve else None)
        r["prior_wt"] = prior_wt.get(isin)
        r["prior_mandate"] = prior_sleeve.get(isin)
    traded = [r for r in plan if r["side"] and not r["dust_filtered"]]
    return {"env": env, "rebalance_id": rebalance_id, "kind": kind, "plan": plan,
            "summary": {
                "n_rows": len(plan), "n_trades": len(traded),
                "n_buy": sum(1 for r in traded if r["side"] == "BUY"),
                "n_sell": sum(1 for r in traded if r["side"] == "SELL"),
                "n_dust": sum(1 for r in plan if r["dust_filtered"]),
                "gross_notional": float(sum(float(r["est_notional"] or 0) for r in traded)),
                # Held at target, deliberately untouched. At ~30% turnover on ~460 names this is
                # most of the book, and it is a decision — counting it keeps "we chose not to
                # trade this" from rendering as "this is not in the book" ([10-CAREP]).
                "n_hold": sum(1 for r in plan if r["action"] == "hold"),
                "n_exit": sum(1 for r in plan if r["action"] in ("close_long", "close_short")),
                "n_flip": sum(1 for r in plan if r["action"] in ("flip_short", "flip_long")),
                "n_composite": sum(1 for r in plan if r["sleeve"] == "composite"),
                "by_action": {
                    a: {
                        "n": sum(1 for r in plan if r["action"] == a),
                        "gross_notional": float(sum(float(r["est_notional"] or 0)
                                                    for r in plan if r["action"] == a)),
                    } for a in _ACTIONS if any(r["action"] == a for r in plan)
                },
                "by_sleeve": {
                    tag: {
                        "n": sum(1 for r in traded if _in_sleeve(r, tag)),
                        "gross_notional": float(sum(float(r["est_notional"] or 0)
                                                    for r in traded if _in_sleeve(r, tag))),
                    } for tag in ("core", "sleeve", "unknown")
                    if any(_in_sleeve(r, tag) for r in traded)
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


@router.get("/{env}/rebalances/{rebalance_id}/gross-exposure")
def rebalance_gross_exposure(env: str, rebalance_id: int, history: int = 24):
    """[10-GEXP] — HOW BIG is this book, and WHY is it that size?

    The exposures endpoint above says what the book is betting ON. This says how large the bet is
    and, more usefully, what determined that. The provoking case: a frozen book at gross 1.31
    against a design documented as 150/50, with nothing on the page explaining the gap.

    THE ONE THING A READER SHOULD LEAVE WITH: **gross is an output, not a setting.** Nobody chose
    1.31. The chain, in the order the payload presents it:

        vol_budget = te_target x cap_calibration      what the sleeve is ALLOWED to risk
        pred_vol                                      what the optimizer spent — it spends the lot,
                                                      the vol cap binds every month
        sigma_eff  = pred_vol / gross                 vol per unit of gross
        gross      = pred_vol / sigma_eff             therefore an OUTPUT of the two above

    and `n_names` / `n_at_floor` / `min_position` are why `sigma_eff` moves: the position-size floor
    forbids a proportional scale-down, so a shrinking book sheds NAMES, loses diversification, and
    needs more gross per unit of vol — which sheds more names. Full argument in
    `05_risk_optimizer/degrossing_review_2026-07.md` §10; the page carries the story, not the essay.

    ⚠️ A LEVEL ALONE MEANS NOTHING, so this never returns one on its own. te6 ran gross 1.75-2.0 in
    2005-2019 (when the GROSS cap bound, not the vol cap) and 0.84-0.97 since 2021. Every reading
    comes with the book's own trailing range, its percentile in its own history, and `history`
    months of series — the `pipeline/coverage.py` rule: report the CHANGE, not the level.

    ⚠️ AND IT REPORTS ITS OWN AS-OF DATE, per sleeve, exactly like `/exposures`. Diagnostics are
    written by the monthly optimizer run; a sleeve whose newest row predates the signal date is
    describing a DIFFERENT book and says so via `is_current`, rather than being rendered as the
    thing you are about to trade.

    ⚠️ AND EACH ROW DECLARES ITS PROVENANCE (`source`). `portfolio.weights` is the authority on what
    the book IS and this table on WHY, so the shape columns always describe the published holdings.
    On a `run` row the chain came from the same pass that wrote those holdings. On a `backfill` row
    it was reconstructed by a later re-run of the same config — which for the L/S books does not
    reliably land on the identical book (measured 2026-08-05). The number stays right; the client is
    told how far to trust the explanation attached to it.

    MONITOR, NEVER GATE. Nothing here blocks approval — it informs the human doing the approving.
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

        # The COMPOSITE is what actually gets traded, and it is the number the reviewer is looking
        # at on screen. It comes from the frozen rows themselves — not from any model book — so it
        # is the book being approved, not a reconstruction of it.
        # The LEG SPLIT, not just the total, because the question a reader actually arrives with is
        # "this is supposed to be 150/50 — why is it 1.31?", and the answer is legible only as
        # 115-long / 16-short. Total gross alone cannot distinguish a symmetric shrink from a short
        # book that has nearly disappeared.
        comp = conn.execute(text("""
            SELECT COUNT(*) AS n, COALESCE(SUM(ABS(target_wt)), 0) AS gross,
                   COALESCE(SUM(target_wt), 0) AS net,
                   COALESCE(SUM(target_wt) FILTER (WHERE target_wt > 0), 0) AS long_gross,
                   COALESCE(-SUM(target_wt) FILTER (WHERE target_wt < 0), 0) AS short_gross,
                   COUNT(*) FILTER (WHERE target_wt > 0) AS n_long,
                   COUNT(*) FILTER (WHERE target_wt < 0) AS n_short
            FROM trading.target_positions WHERE rebalance_id = :r"""),
            {"r": rebalance_id}).mappings().first()

        sleeves = []
        for lbl in labels:
            tag = "sleeve" if "_ls_" in lbl else "core"
            asof = conn.execute(text(
                "SELECT max(date) FROM portfolio.risk_diagnostics "
                "WHERE model_label = :l AND date <= :d"), {"l": lbl, "d": sig}).scalar()
            if asof is None:
                sleeves.append({"sleeve": tag, "label": lbl, "as_of": None, "is_current": False,
                                "current": None, "prev": None, "context": {}, "history": [],
                                "note": "no risk diagnostics for this book yet"})
                continue
            cur = conn.execute(text("""
                SELECT date, is_live, gross, net, n_long, n_short, n_names, median_abs_w,
                       n_at_floor, min_position, active_share, te_target, cap_calibration,
                       cap_lo, cap_hi, cap_bound, vol_budget, pred_vol, sigma_eff, status,
                       realized_vol_12m, realized_vol_24m, implied_b, source
                FROM portfolio.risk_diagnostics WHERE model_label = :l AND date = :d"""),
                {"l": lbl, "d": asof}).mappings().first()
            # Series for the sparkline. Gross and cap_calibration TOGETHER: the ratchet's effect on
            # the book is only legible against time, and against the cap it is being driven by.
            hist = conn.execute(text("""
                SELECT date, gross, active_share, cap_calibration, cap_bound, n_names,
                       pred_vol, sigma_eff
                FROM portfolio.risk_diagnostics
                WHERE model_label = :l AND date <= :d
                ORDER BY date DESC LIMIT :n"""),
                {"l": lbl, "d": asof, "n": max(1, min(history, 240))}).mappings().all()

            # ⚠️ CONTEXT IS COMPUTED FOR BOTH SIZE MEASURES, and the client picks the one its
            # mandate makes meaningful. A long-only book is fully invested, so its gross is 1.00
            # EVERY month — a range of 1.00–1.00 and a percentile over a constant are not small
            # numbers, they are undefined ones, and "p87 of 259 months" invites a reader to think
            # the book is unusually large when nothing has varied at all. What varies for a
            # long-only book is how far it sits from its benchmark: active share.
            #
            # Both are computed here rather than branching on the label, so the sleeve/core rule
            # lives in exactly one place (the component that renders it) instead of two.
            ctx = {}
            for metric in ("gross", "active_share"):
                row = conn.execute(text(f"""
                    SELECT MIN({metric}) AS lo, MAX({metric}) AS hi, COUNT({metric}) AS months,
                           AVG(CASE WHEN {metric} <= :v THEN 1.0 ELSE 0.0 END) AS pctile
                    FROM portfolio.risk_diagnostics
                    WHERE model_label = :l AND date <= :d AND {metric} IS NOT NULL"""),
                    {"l": lbl, "d": asof, "v": cur[metric]}).mappings().first() if \
                    cur[metric] is not None else None
                w12 = [r[metric] for r in hist[:12] if r[metric] is not None]
                ctx[metric] = ({"lo": row["lo"], "hi": row["hi"], "months": row["months"],
                                "pctile": row["pctile"],
                                "lo12": min(w12, default=None), "hi12": max(w12, default=None)}
                               if row else None)
            prev = conn.execute(text("""
                SELECT gross, active_share FROM portfolio.risk_diagnostics
                WHERE model_label = :l AND date < :d ORDER BY date DESC LIMIT 1"""),
                {"l": lbl, "d": asof}).mappings().first()

            sleeves.append({
                "sleeve": tag, "label": lbl, "as_of": asof, "is_current": asof == sig,
                "current": dict(cur),
                "prev": dict(prev) if prev else None,
                "context": ctx,
                "history": [dict(r) for r in reversed(hist)],
            })
    return {"env": env, "rebalance_id": rebalance_id, "signal_date": sig,
            "composite": dict(comp) if comp else None, "sleeves": sleeves}


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

        # `exceptional` steps are EXCLUDED. The repair (`refreeze`) is an exception path, not a
        # stage of the month: rendering it as a cycle row would put a permanent "not run" step into
        # every clean cycle, which is rule (b) in reverse — a step that is CORRECTLY never run,
        # displayed as one that has not run yet. Repairs surface against the book they superseded.
        steps = conn.execute(text(
            "SELECT step, ord, label, act, manual_only, telemetry, notes, manual_cmd, "
            "       COALESCE(job_name, step) AS job_name "
            "FROM trading.cycle_steps WHERE NOT COALESCE(exceptional, FALSE) "
            "ORDER BY ord")).mappings().all()

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
        measured against the ARRIVAL price.
      * ⚠️ Slippage is NULL in two distinct cases. Nothing filled — an avg price of 0 means "no
        data", and running it through the formula prints a confident −10,000 bps. And no arrival
        price: `trade_plans.price` falls back to the frozen signal-date close when no live quote
        survives the deviation guard (`price_src='ref'`), and measuring against THAT is
        fill-vs-decision mislabelled as fill-vs-arrival — the [10-ARRIVAL] error, which reads
        flatteringly small. `has_arrival` says which rows carry a real one.
      * `avg_slip_bps` is NOTIONAL-weighted, matching `shortfall.calibration_summary`, the
        `/sessions` roll-up and `capture_fills`. It was a plain mean until the [10-ARRIVAL] audit:
        on a 460-name book with a long small-trade tail, a $600 odd lot moved the headline as much
        as a $41k trade, in a number whose stated purpose is feeding [06-T7].
      * Dust and side-less rows are excluded: they were never orders.

    Feeds open question [06-T7] (cost-model calibration against real fills) — arrival-vs-fill by
    name and size is exactly that dataset, so it comes back in a shape that exports.
    """
    _env(env)
    with get_db() as conn:
        rows = conn.execute(text("""
            SELECT p.ticker, p.conid, p.side, p.delta AS planned, p.price AS plan_price,
                   p.price_src,
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
        # Mirrors orders.ARRIVAL_PRICE_SRC — an ALLOWLIST, so an unrecognised future price source
        # reads as missing coverage rather than as a confidently mis-anchored number.
        d["has_arrival"] = str(d.get("price_src")) in ("mid", "last", "mid_stale", "last_stale")
        # NULL, not zero — see the docstring. A confident wrong number is worse than a blank.
        d["slip_bps"] = (
            (float(avg) - float(px)) / float(px) * 10_000 * (1 if planned > 0 else -1)
            if filled and px and avg and float(px) != 0 and d["has_arrival"] else None)
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

    # NOTIONAL-weighted, on the filled notional — the same weighting and the same denominator as
    # shortfall.calibration_summary, so the screen and the authority cannot disagree about one
    # rebalance. Coverage rides along: below 100% the headline describes a subset of the dollars
    # traded, and a roll-up that hides which subset is how a mixed sample stays invisible.
    slip_rows = [d for d in out if d["slip_bps"] is not None]
    slip_den = sum(abs(float(d["filled"] or 0)) * float(d["avg_price"] or 0) for d in slip_rows)
    traded = sum(abs(float(d["filled"] or 0)) * float(d["avg_price"] or 0)
                 for d in out if d["avg_price"])
    roll["avg_slip_bps"] = (
        sum(d["slip_bps"] * abs(float(d["filled"])) * float(d["avg_price"]) for d in slip_rows)
        / slip_den) if slip_den else None
    roll["n_no_arrival"] = sum(1 for d in out if float(d["filled"] or 0) and not d["has_arrival"])
    roll["slip_coverage"] = (slip_den / traded) if traded else None
    return {"env": env, "rebalance_id": rebalance_id, "rows": out, "rollup": roll,
            "unexplained_fills": [dict(u) for u in unexplained]}


# CSV column order = the screen's column order. The export is the same rows the blotter renders,
# not a second query — a download that can disagree with the page it was downloaded from is worse
# than no download.
_CSV_COLS = ["ticker", "conid", "side", "planned", "filled", "residual", "plan_price",
             # `price_src` travels with `plan_price` wherever it goes: [06-T7] calibrates on this
             # export, and a decision price in an arrival column is invisible once it leaves here.
             "price_src", "has_arrival",
             "avg_price", "slip_bps", "commission", "n_fills", "est_notional",
             "status", "coid", "ibkr_order_id", "submitted_at", "first_fill", "last_fill"]


@router.get("/{env}/rebalances/{rebalance_id}/blotter.csv")
def blotter_csv(env: str, rebalance_id: int):
    """The session's blotter as CSV — the audit extract.

    Generated on demand from the same immutable rows the screen reads, and deliberately NOT written
    to disk anywhere. `trading.target_positions` is immutable by trigger, `ibkr.executions` is keyed
    on IBKR's execution_id, and the database is backed up nightly — a stored file would be a second
    copy of an already-durable record, with its own retention, its own backup and its own ability to
    drift from the source. Regenerating is free and always agrees.

    Also the dataset [06-T7] wants for calibrating the cost model against real fills: arrival price
    (`plan_price`, the reference the share count was derived from) beside `avg_price` and size.
    """
    data = blotter(env, rebalance_id)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=_CSV_COLS, extrasaction="ignore")
    w.writeheader()
    for r in data["rows"]:
        w.writerow({k: r.get(k) for k in _CSV_COLS})
    stamp = None
    with get_db() as conn:
        stamp = conn.execute(text(
            "SELECT COALESCE(submitted_at, proposed_at)::date FROM trading.rebalances "
            "WHERE rebalance_id = :r"), {"r": rebalance_id}).scalar()
    name = f"blotter_{stamp or 'unknown'}_rebalance{rebalance_id}.csv"
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/{env}/sessions")
def sessions(env: str, limit: int = Query(24, ge=1, le=120)):
    """One row per TRADING SESSION — a rebalance that reached the broker — newest first.

    The monthly record at a glance. `submitted_at` is the test, not status: a book can be cancelled
    after submitting, and is far more often cancelled before ever trading, so status would both
    admit books that never traded and risk excluding one that did.

    Everything here is aggregate; the per-name detail is the blotter. Slippage is notional-weighted
    rather than a plain mean, because a 400bp slip on a $1.6k odd lot should not read the same as
    400bp on a $90k trade.
    """
    _env(env)
    with get_db() as conn:
        rows = conn.execute(text("""
            SELECT r.rebalance_id, r.strategy, r.signal_date, r.status, r.sized_equity,
                   r.submitted_at, r.closed_at, r.approved_by,
                   COUNT(*) FILTER (WHERE p.side IS NOT NULL AND NOT p.dust_filtered) AS planned,
                   COUNT(*) FILTER (WHERE f.filled IS NOT NULL AND f.filled <> 0)     AS filled,
                   COALESCE(SUM(ABS(f.filled) * f.avg_price), 0)                      AS gross_traded,
                   COALESCE(SUM(f.commission), 0)                                     AS commission,
                   -- ⚠️ GATED ON price_src: `p.price` is the frozen close, not the arrival mid,
                   -- wherever no live quote survived the deviation guard, and slippage measured
                   -- against it is fill-vs-DECISION ([10-ARRIVAL]). Allowlist, so a new price
                   -- source drops coverage instead of silently entering the average.
                   SUM(CASE WHEN f.filled IS NOT NULL AND p.price > 0 AND f.avg_price IS NOT NULL
                             AND p.price_src IN ('mid','last','mid_stale','last_stale')
                            THEN (f.avg_price - p.price) / p.price * 10000
                                 * (CASE WHEN p.delta > 0 THEN 1 ELSE -1 END)
                                 * ABS(f.filled) * f.avg_price END)                   AS slip_num,
                   SUM(CASE WHEN f.filled IS NOT NULL AND p.price > 0 AND f.avg_price IS NOT NULL
                             AND p.price_src IN ('mid','last','mid_stale','last_stale')
                            THEN ABS(f.filled) * f.avg_price END)                     AS slip_den
            FROM trading.rebalances r
            JOIN trading.trade_plans p
              ON p.rebalance_id = r.rebalance_id AND p.plan_kind = 'final'
             AND p.side IS NOT NULL AND NOT p.dust_filtered
            LEFT JOIN ibkr.orders o ON o.rebalance_id = p.rebalance_id AND o.conid = p.conid
            LEFT JOIN (SELECT internal_order_id, SUM(qty) AS filled,
                              SUM(ABS(qty) * price) / NULLIF(SUM(ABS(qty)), 0) AS avg_price,
                              SUM(commission) AS commission
                       FROM ibkr.executions GROUP BY 1) f
                   ON f.internal_order_id = o.internal_order_id
            WHERE r.submitted_at IS NOT NULL
            GROUP BY r.rebalance_id
            ORDER BY r.submitted_at DESC
            LIMIT :n"""), {"n": limit}).mappings().all()

    out = []
    for r in rows:
        d = dict(r)
        den = float(d.pop("slip_den") or 0)
        num = float(d.pop("slip_num") or 0)
        d["avg_slip_bps"] = (num / den) if den else None
        d["unfilled"] = int(d["planned"]) - int(d["filled"])
        out.append(d)
    return {"env": env, "sessions": out}


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


# =================================================================================================
# TRADABILITY + TIER 1.5 REPAIR ([10-TRAD] / [10-CAEX], 2026-08-05)
#
# The case: EA was taken private between the freeze and the trade of rebalance 5. It sat in an
# APPROVED book as a 51-share buy with no bid, no ask and a previous-close marker, and nothing in
# the pipeline noticed. These endpoints are the two halves of not repeating that — see it, fix it.
#
# ⚠️ NO IBKR PRICE EVER CROSSES THIS BOUNDARY, and that is a licensing constraint, not a style
# choice. `ibkr.quote_snapshots` carries: "IBKR market data is licensed for internal use; nothing
# derived from this table may appear on the investor-facing site without confirming with IBKR"
# (ibkr_data_ingestion_spec.md §8). The trading section sits on the same domain behind the same
# shared login as the investor-facing pages, so the conservative reading governs.
#
# What is published is therefore OUR OWN operational assessment — a status enum and the count of
# consecutive captures that produced it — together with OUR book weight and notional. bid, ask,
# last and mark are read on the server to compute the status and are then dropped. A reader can
# see THAT a name is untradeable and how much of the book it is; they cannot read a quote off it.
# =================================================================================================

# IBKR marks a price it cannot vouch for as live: 'C' = previous close, 'H' = halted. `sizing_price`
# already refuses these; here they are the detection signal rather than a sizing guard.
_MARKERS = ("C", "H")


def _classify(bid, ask, last) -> tuple[str, str]:
    """(status, why) for one snapshot row. Mirrors rebalance.sizing_price's acceptance test, which
    is what makes this a PRE-check of the executor rather than a second opinion about it."""
    def marked(v):
        s = str(v or "").strip()
        return s[:1].upper() in _MARKERS

    if marked(bid) or marked(ask) or marked(last):
        return "stale_marker", "priced at previous close / halted, not a live quote"
    try:
        b, a = float(bid), float(ask)
    except (TypeError, ValueError):
        return "no_two_sided_quote", "no bid and/or no ask in the last capture"
    if b > 0 and a >= b:
        return "tradable", ""
    return "no_two_sided_quote", "bid/ask not a valid two-sided market"


@router.get("/{env}/rebalances/{rebalance_id}/tradability")
def tradability(env: str, rebalance_id: int, lookback: int = Query(5, ge=1, le=30)):
    """Per-name tradability of a frozen book, from the most recent quote capture.

    Reported PER NAME with weight and notional, never as a count: the response to an untradeable
    target depends entirely on how much weight it carries (corporate_actions_policy.md §3 tiers a
    1% name and a 6% name completely differently), and a bare number cannot answer that.

    `consecutive` counts how many of the most recent captures showed the name unquotable. One is
    usually thin-market noise; two or more is a halt or a delisting, and is the earliest signal
    available to us — the actions feed lags by up to a week and would not have caught EA at all.
    """
    _env(env)
    with get_db() as conn:
        hdr = conn.execute(text(
            "SELECT rebalance_id, strategy, signal_date, status, sized_equity "
            "FROM trading.rebalances WHERE rebalance_id = :r"),
            {"r": rebalance_id}).mappings().first()
        if hdr is None:
            raise HTTPException(status_code=404, detail="no such rebalance")

        snaps = conn.execute(text(
            "SELECT DISTINCT snap_ts FROM ibkr.quote_snapshots "
            "ORDER BY snap_ts DESC LIMIT :n"), {"n": lookback}).scalars().all()
        if not snaps:
            return {"env": env, "rebalance_id": rebalance_id, "as_of": None,
                    "state": "no_data", "names": [], "n_flagged": 0, "weight_flagged": 0.0,
                    "note": ("No quote captures exist yet. Tradability is UNKNOWN, which is not "
                             "the same as clear — the 18:00 UTC capture is the source.")}

        rows = conn.execute(text("""
            SELECT t.isin, t.ticker, t.conid, t.target_wt::float AS weight,
                   t.target_qty::float AS qty, t.ref_price::float AS ref_price,
                   q.snap_ts, q.bid, q.ask, q.last
            FROM trading.target_positions t
            LEFT JOIN ibkr.quote_snapshots q
                   ON q.conid = t.conid AND q.snap_ts = ANY(:ts)
            WHERE t.rebalance_id = :r AND t.mandate = 'composite'"""),
            {"r": rebalance_id, "ts": list(snaps)}).mappings().all()

    equity = float(hdr["sized_equity"] or 0.0)
    latest = snaps[0]
    per: dict[str, dict] = {}
    for r in rows:
        e = per.setdefault(r["isin"], {
            "isin": r["isin"], "ticker": r["ticker"], "conid": r["conid"],
            "weight": r["weight"], "notional": abs(r["weight"]) * equity,
            "side": "long" if (r["weight"] or 0) > 0 else "short",
            "status": "unknown", "why": "no quote captured for this conid",
            "consecutive": 0, "last_seen": None})
        if r["snap_ts"] is None:
            continue
        status, why = _classify(r["bid"], r["ask"], r["last"])
        if r["snap_ts"] == latest:
            e["status"], e["why"], e["last_seen"] = status, why, r["snap_ts"]
        if status != "tradable":
            e["consecutive"] += 1

    names = sorted(per.values(), key=lambda x: -abs(x["weight"]))
    flagged = [n for n in names if n["status"] != "tradable"]
    # 'unknown' is deliberately flagged rather than assumed fine. A conid the capture never
    # returned is a name we have no evidence about, and treating absence of evidence as evidence
    # of tradability is precisely how EA reached an approved book.
    return {
        "env": env, "rebalance_id": rebalance_id, "strategy": hdr["strategy"],
        "status": hdr["status"], "as_of": latest, "captures_examined": len(snaps),
        "state": "flagged" if flagged else "clear",
        "n_names": len(names), "n_flagged": len(flagged),
        "weight_flagged": round(sum(abs(n["weight"]) for n in flagged), 6),
        "notional_flagged": round(sum(n["notional"] for n in flagged), 2),
        "names": flagged,
        "note": ("Statuses are our own assessment computed server-side; IBKR quote values are not "
                 "published (ibkr_data_ingestion_spec.md §8)."),
    }


class RepairRequest(BaseModel):
    by: str = Field(min_length=1, max_length=80)
    phrase: str = Field(min_length=1, max_length=60)
    exclude: list[str] = Field(min_length=1, max_length=25)
    method: str = Field(pattern="^(drop|prorata)$")
    reason: str = Field(min_length=3, max_length=500)


@router.post("/{env}/rebalances/{rebalance_id}/repair")
def repair_book(env: str, rebalance_id: int, body: RepairRequest):
    """Request a Tier 1.5 repair: cancel this book and re-freeze it minus the named targets.

    Queues it. The droplet worker runs the same `jobs.freeze_targets` a CLI operator would, which
    re-resolves every ticker against the book, redistributes within the excluded name's own mandate
    and re-checks the position-cap and sector gates. **A gate failure from the web is final** —
    there is no override on this path, by design: a breach has to reach a human at a terminal who
    can read it and write down why it is acceptable.

    `method` is required and has no default. 'drop' leaves the weight uninvested and 'prorata'
    redistributes it; they produce different books and the choice belongs to the operator, not to
    whoever wrote the form.

    The typed phrase proves intent, matching the execute control. There is no passcode: this sends
    no orders. It does, though, CANCEL AN APPROVAL — the replacement comes back as 'proposed' and
    has to be approved again — so it is not a free action either.
    """
    _env(env)
    if body.phrase.strip().lower() != f"repair {rebalance_id}":
        raise HTTPException(status_code=400,
                            detail=f"type 'repair {rebalance_id}' to confirm")
    eng = get_request_engine()
    if eng is None:
        raise HTTPException(status_code=503, detail="run-request path not configured")

    with get_db() as conn:
        hdr = conn.execute(text(
            "SELECT status, strategy FROM trading.rebalances WHERE rebalance_id = :r"),
            {"r": rebalance_id}).mappings().first()
        if hdr is None:
            raise HTTPException(status_code=404, detail="no such rebalance")
        if hdr["status"] in ("cancelled", "closed", "reconciled"):
            raise HTTPException(status_code=409, detail=(
                f"rebalance is '{hdr['status']}' — a repair supersedes an ACTIVE book. "
                f"Freeze a fresh one instead."))
        n_orders = conn.execute(text(
            "SELECT count(*) FROM ibkr.orders WHERE rebalance_id = :r"),
            {"r": rebalance_id}).scalar()
        if n_orders:
            raise HTTPException(status_code=409, detail=(
                f"{n_orders} order(s) already exist at the broker for this rebalance. Repairing a "
                f"part-executed book would leave the target and the account describing different "
                f"portfolios — reconcile and decide by hand."))

    # The payload rides in `params` as typed JSON. It is never interpolated into a command: the
    # worker passes only `--from-request <int>` and the job reads this back out of the database
    # (run_worker's module docstring; freeze_targets.params_from_request).
    params = {"exclude": [s.strip().upper() for s in body.exclude if s.strip()],
              "method": body.method, "reason": body.reason, "strategy": hdr["strategy"]}
    if not params["exclude"]:
        raise HTTPException(status_code=400, detail="name at least one target to exclude")
    try:
        with eng.begin() as conn:
            row = conn.execute(text(
                "INSERT INTO trading.run_requests (rebalance_id, step, source, requested_by, params) "
                "VALUES (:r, 'refreeze', 'web', :by, CAST(:p AS jsonb)) RETURNING request_id"),
                {"r": rebalance_id, "by": body.by, "p": json.dumps(params)}).first()
    except Exception as e:                                            # noqa: BLE001
        if "run_requests_one_active" in str(e):
            raise HTTPException(status_code=409, detail=(
                "a repair is already queued or running for this rebalance — one at a time."))
        raise
    return {"env": env, "rebalance_id": rebalance_id, "request_id": row[0], "status": "queued",
            "excluded": params["exclude"], "method": body.method,
            "note": ("Queued. The worker cancels this book and freezes its replacement in one "
                     "transaction, at the SAME signal date and price as-of. The new book comes "
                     "back as 'proposed' and MUST BE APPROVED AGAIN before it can trade.")}


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
