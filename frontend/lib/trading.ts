// Trading — the operational surface ([10-RBAL] phase 1).
//
// Read-only. Every write in the design (approval, halt, run requests) lands in a later phase
// behind its own narrow DB role; nothing here posts.

const API_BASE = '/api-proxy';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// The five states the ledger renders. FOUR of them are the §3.7 rule-(b) set — "not due yet"
// must not look like "ok", and neither may look like "failed" — plus two the build added because
// the honest answer was neither: `unbuilt` (nothing will ever write this until [10-P4] lands) and
// `no_record` (it demonstrably ran, before its telemetry existed).
export type StepState =
  | 'ok' | 'warn' | 'failed' | 'running' | 'awaiting' | 'not_due' | 'no_record' | 'unbuilt';

export interface ScheduledJob {
  unit: string; kind: 'systemd' | 'cron'; schedule: string;
  enabled: boolean; next_run: string | null; last_run: string | null; collected_at: string;
}

export interface LedgerStep {
  step: string; label: string; act: string; ord: number;
  mode: 'scheduled' | 'manual' | 'chained';
  manual_only: boolean;
  scheduled: ScheduledJob[] | null;
  chained: boolean;
  state: StepState;
  /** The CLI equivalent, with {id} already resolved. For execution this is not a fallback —
   *  it is the only way to run it (§3.10 auth boundary). */
  manual_cmd: string | null;
  ran_at: string | null;
  detail: string | null;
  notes: string | null;
}

export interface LedgerRebalance {
  rebalance_id: number; strategy: string; signal_date: string; status: string;
  proposed_at: string | null; approved_by: string | null; approved_at: string | null;
  submitted_at: string | null;
}

export interface Ledger {
  env: string;
  rebalance: LedgerRebalance | null;
  steps: LedgerStep[];
  schedule_collected_at: string | null;
}

export interface RebalanceRow {
  rebalance_id: number; strategy: string; signal_date: string; status: string;
  sized_equity: number | null; proposed_at: string | null; approved_by: string | null;
  approved_at: string | null; submitted_at: string | null; closed_at: string | null;
  label: string | null; n_names: number; is_open: boolean;
}

export interface ReviewCheck {
  name: string; state: 'ok' | 'warn' | 'fail'; headline: string; detail: string[];
}

/** True when the deployment has approval credentials. False disables the control rather than
 *  letting a click fail — the same posture as the halt button. */
export interface ReviewResponse { review: Review | null; can_approve: boolean }

export interface Review {
  review_id: number; computed_at: string; computed_by: string | null;
  worst_state: 'ok' | 'warn' | 'fail';
  n_trades: number | null; gross_notional: number | null; pct_margin: number | null;
  checks: ReviewCheck[]; summary: string | null;
  is_stale: boolean; age_seconds: number;
}

export interface RebalanceDetail {
  env: string;
  header: {
    rebalance_id: number; strategy: string; signal_date: string; status: string;
    sized_equity: number | null; source: Record<string, unknown> | null; notes: string | null;
    proposed_at: string | null; approved_by: string | null; approved_at: string | null;
    submitted_at: string | null; closed_at: string | null;
  };
  events: { at: string; kind: string; from_status: string | null; to_status: string | null;
            actor: string | null; detail: string | null }[];
  orders: Record<string, number>;
  /** Present iff this book IS a Tier 1.5 repair of another. Absent = an ordinary freeze. This is
   *  what lets a reader tell a REPAIR from a RE-DECISION without reading the provenance blob. */
  repair?: RepairProvenance | null;
  /** The book(s) that superseded this one. Lineage is exposed in BOTH directions so a cancelled
   *  book does not look abandoned and its replacement does not look like it appeared from nowhere. */
  superseded_by?: { rebalance_id: number; status: string; proposed_at: string }[];
}

export interface PlanRow {
  ticker: string; conid: number; weight: number; current_qty: number | null;
  target_qty: number | null; delta: number | null; side: string | null;
  planned_qty: number | null; ref_price: number | null; price: number | null;
  price_src: string | null; est_notional: number | null; dust_filtered: boolean;
  note: string | null; planned_at: string;
  isin: string | null; company: string | null; sector: string | null; industry: string | null;
  /** 'core' (S&P 500 long-only) | 'sleeve' (R2500 L/S) | 'unknown'. Read from the frozen
   *  provenance, not inferred — see the endpoint for why it is only safe here. */
  sleeve: 'core' | 'sleeve' | 'unknown';
}

export interface PlanResponse {
  kind: 'preview' | 'final';
  plan: PlanRow[];
  summary: { n_rows: number; n_trades: number; n_buy: number; n_sell: number;
             n_dust: number; gross_notional: number;
             by_sleeve: Record<string, { n: number; gross_notional: number }> };
}

export const fetchLedger = (env: string, rebalanceId?: number) =>
  get<Ledger>(`/api/v1/trading/${env}/ledger` +
    (rebalanceId ? `?rebalance_id=${rebalanceId}` : ''));

export const fetchRebalances = (env: string) =>
  get<{ rebalances: RebalanceRow[] }>(`/api/v1/trading/${env}/rebalances`);

export const fetchRebalance = (env: string, id: number) =>
  get<RebalanceDetail>(`/api/v1/trading/${env}/rebalances/${id}`);

export const fetchReview = (env: string, id: number) =>
  get<ReviewResponse>(`/api/v1/trading/${env}/rebalances/${id}/review`);

// `kind` is explicit on purpose: preview (a rehearsal) and final (the contract the executor
// submits) are different objects, and a page that silently showed whichever existed would let an
// operator read rehearsal share counts as the ones about to be sent.
export const fetchPlan = (env: string, id: number, kind: 'preview' | 'final' = 'preview') =>
  get<PlanResponse>(`/api/v1/trading/${env}/rebalances/${id}/plan?kind=${kind}`);

export interface BlotterRow {
  ticker: string; conid: number; side: string; planned: number; plan_price: number | null;
  est_notional: number | null; coid: string | null; status: string | null;
  ibkr_order_id: string | null; submitted_qty: number | null; submitted_at: string | null;
  filled: number; avg_price: number | null; commission: number; n_fills: number;
  first_fill: string | null; last_fill: string | null;
  residual: number;
  /** Signed so POSITIVE always means worse for us. null where nothing filled — an avg price of
   *  0 is "no data", and running it through the formula prints a confident −10,000 bps. */
  slip_bps: number | null;
}

export interface Blotter {
  rows: BlotterRow[];
  rollup: {
    planned: number; submitted: number; filled: number; unfilled: number; partial: number;
    rejected: number; commission: number; est_cost: number; avg_slip_bps: number | null;
  };
  unexplained_fills: { coid: string; status: string; conid: number }[];
}

export const fetchBlotter = (env: string, id: number) =>
  get<Blotter>(`/api/v1/trading/${env}/rebalances/${id}/blotter`);

export interface HaltState {
  halted: boolean;
  active: { halt_id: number; rebalance_id: number | null; set_at: string; set_by: string;
            source: string; reason: string | null } | null;
  history: { halt_id: number; set_at: string; set_by: string; source: string;
             reason: string | null; cleared_at: string | null; cleared_by: string | null }[];
  /** False when the deployment has no halter credentials — the button disables rather than
   *  silently writing through the read role. */
  can_write: boolean;
  /** Always true: the file half of the switch lives on the droplet's disk and this API may be the
   *  very thing that is broken, so "not halted" here is never the whole truth. */
  file_flag_not_visible_here: boolean;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const fetchHaltState = (env: string, rebalanceId?: number) =>
  get<HaltState>(`/api/v1/trading/${env}/halt` +
    (rebalanceId ? `?rebalance_id=${rebalanceId}` : ''));

export const postHalt = (env: string, by: string, reason: string, rebalanceId?: number) =>
  post(`/api/v1/trading/${env}/halt`, { by, reason, rebalance_id: rebalanceId ?? null });

export const clearHalt = (env: string, by: string, rebalanceId?: number) =>
  post(`/api/v1/trading/${env}/halt/clear`,
       { by, reason: 'cleared from the operations page', rebalance_id: rebalanceId ?? null });

export const approveRebalance = (
  env: string, id: number, by: string, reviewId: number, phrase: string,
) => post(`/api/v1/trading/${env}/rebalances/${id}/approve`,
          { by, review_id: reviewId, phrase });

export interface RunRequestRow {
  request_id: number; rebalance_id: number | null; step: string; source: string;
  requested_by: string; requested_at: string;
  status: 'queued' | 'running' | 'ok' | 'warn' | 'failed' | 'cancelled';
  started_at: string | null; finished_at: string | null; result: string | null;
}

export const fetchRunRequests = (env: string, rebalanceId?: number) =>
  get<{ requests: RunRequestRow[]; can_request: boolean; can_execute: boolean;
        triggerable: string[] }>(
    `/api/v1/trading/${env}/run-requests` + (rebalanceId ? `?rebalance_id=${rebalanceId}` : ''));

// The website REQUESTS a step; it never runs one. Returns as soon as the intent is recorded.
export const requestRun = (env: string, step: string, by: string, rebalanceId?: number) =>
  post<{ request_id: number }>(`/api/v1/trading/${env}/run-requests`,
                               { step, by, rebalance_id: rebalanceId ?? null });

export interface ReadinessCheck {
  name: string; what: string; rows: number | null;
  /** true / false / null — null means the check could not RUN, which is neither present nor
   *  missing. Reporting an unreadable artifact as missing cries wolf; as present is the failure
   *  the panel exists to prevent. */
  present: boolean | null;
  landed_at: string | null; why: string; error: string | null;
}

export interface Readiness {
  signal_date: string; weekdays_since_month_end: number;
  checks: ReadinessCheck[]; n_missing: number; n_unknown: number;
  verdict: 'ready' | 'building' | 'at_risk' | 'late' | 'unknown';
  note: string;
}

export const fetchReadiness = (env: string) =>
  get<Readiness>(`/api/v1/trading/${env}/readiness`);

// Execution: two secrets, and neither is the real protection — the worker re-reads the database
// and refuses unless the book is approved and nothing is halted. The passcode is never returned
// by any endpoint, only posted.
export const executeRebalance = (env: string, id: number, by: string, phrase: string) =>
  post<{ request_id: number }>(
    `/api/v1/trading/${env}/rebalances/${id}/execute`, { by, phrase });


export interface ExposureFactor {
  factor: string; kind: 'sector' | 'style' | 'market';
  active_exposure: number; risk_var_contrib: number | null;
}

/** One side of a market-neutral book ([10-EXPO]). The net alone cannot distinguish a +20%/−13%
 *  book from a +8%/+1% one, and for a sleeve that is de-grossing that is the wrong blindness.
 *
 *  `long` and `short` are each normalised to their OWN gross (`leg_gross`, reported so the scaling
 *  is visible) and measured against the universe's cap-weighted benchmark. `benchmark` is that
 *  benchmark's own exposure.
 *
 *  ⚠️ THE SHORT LEG IS A HOLDING, NOT A PREFERENCE. It is |w| — a positive book of what you are
 *  SHORT OF — so a positive profitability number there means the names you are short are
 *  profitable, i.e. a bet AGAINST profitability. Any surface rendering it must say which it is
 *  showing; sign confusion on the short side is reliable. */
export interface ExposureLeg {
  leg: 'long' | 'short' | 'benchmark';
  factor: string; kind: 'sector' | 'style' | 'market';
  active_exposure: number; leg_gross: number | null; n_names: number | null;
}

export interface Exposures {
  signal_date: string;
  sleeves: {
    sleeve: string; label: string;
    /** The date the exposures were computed for. May LAG the signal date — attribution is a local
     *  job — so `is_current` is computed rather than assumed, and the UI says which book it is
     *  describing. */
    as_of: string | null; is_current: boolean;
    specific_risk_var?: number | null;
    factors: ExposureFactor[];
    /** Empty for a long-only book (its net IS its position vs the benchmark) and for any L/S book
     *  whose leg split has not been computed. */
    legs?: ExposureLeg[];
    note?: string;
  }[];
}

export const fetchExposures = (env: string, id: number) =>
  get<Exposures>(`/api/v1/trading/${env}/rebalances/${id}/exposures`);

/** [10-GEXP] HOW BIG the book is, and the chain that determined it.
 *
 *  ⚠️ GROSS IS AN OUTPUT, NOT A SETTING. Read the fields in this order and the arithmetic closes:
 *  `vol_budget = te_target × cap_calibration` is what the sleeve may risk; `pred_vol` is what the
 *  optimizer spent (the vol cap binds, so it spends all of it); `sigma_eff = pred_vol / gross` is
 *  the vol per unit of gross; therefore `gross = pred_vol / sigma_eff`. Nobody picks the gross.
 *
 *  `cap_bound` is the fact that went unsaid for five months: 'floor' or 'ceiling' means the
 *  estimator was OVERRULED by a bound, which is a different state from a cap it chose. */
export interface RiskDiagnostic {
  date: string; is_live: boolean;
  gross: number; net: number;
  n_long: number; n_short: number; n_names: number;
  median_abs_w: number | null; n_at_floor: number; min_position: number | null;
  active_share: number | null;
  te_target: number; cap_calibration: number;
  cap_lo: number | null; cap_hi: number | null;
  cap_bound: 'floor' | 'ceiling' | 'interior' | 'static';
  vol_budget: number; pred_vol: number; sigma_eff: number; status: string;
  realized_vol_12m: number | null; realized_vol_24m: number | null; implied_b: number | null;
  /** Provenance. The SHAPE columns (gross, names, median |w|) are always the published holdings.
   *  'run' = the chain came from the same pass that wrote those holdings. 'backfill' = the chain
   *  was reconstructed by a later re-run of the same config, which for the L/S books does not
   *  reliably reproduce the identical book — so the size is exact and the explanation is a
   *  close reconstruction. */
  source: 'run' | 'backfill' | null;
}

export interface GrossExposure {
  signal_date: string;
  /** The book actually being approved, from the FROZEN rows — not a reconstruction. The leg split
   *  is carried because "why is a 150/50 running 1.31?" is answerable only as 115-long/16-short. */
  composite: { n: number; gross: number; net: number; long_gross: number; short_gross: number;
               n_long: number; n_short: number } | null;
  sleeves: {
    sleeve: string; label: string;
    /** May LAG the signal date; `is_current` is computed, never assumed. A risk number rendered as
     *  current while describing an older book is worse than showing none. */
    as_of: string | null; is_current: boolean;
    current: RiskDiagnostic | null;
    prev: { gross: number; active_share: number | null } | null;
    /** Whole-history context for BOTH size measures — pick the one the mandate makes meaningful.
     *  A long-only book's gross is 1.00 every month, so its range and percentile are undefined
     *  rather than merely small; what varies for it is active share. Null when the book has no
     *  values for that measure (an L/S book has no active share — its benchmark is cash). */
    context: Partial<Record<'gross' | 'active_share',
      { lo: number; hi: number; months: number; pctile: number;
        lo12: number | null; hi12: number | null } | null>>;
    history: Pick<RiskDiagnostic,
      'date' | 'gross' | 'active_share' | 'cap_calibration' | 'cap_bound' | 'n_names'
      | 'pred_vol' | 'sigma_eff'>[];
    note?: string;
  }[];
}

export const fetchGrossExposure = (env: string, id: number, history = 24) =>
  get<GrossExposure>(
    `/api/v1/trading/${env}/rebalances/${id}/gross-exposure?history=${history}`);

// =================================================================================================
// TRADABILITY + TIER 1.5 REPAIR ([10-TRAD] / [10-CAEX], 2026-08-05)
//
// EA was taken private between the freeze and the trade of rebalance 5 and sat in an APPROVED book
// as a 51-share buy of a company that had stopped trading. Nothing noticed. These are the two
// halves of not repeating that: see it, then fix it without re-running the optimizer.
//
// ⚠️ There is no bid/ask/last in any of these types, and that is deliberate. IBKR market data is
// licensed for internal use and may not be redistributed on the investor-facing site
// (ibkr_data_ingestion_spec.md §8), so the API computes a STATUS server-side and publishes only
// that, alongside our own weight and notional.
// =================================================================================================

export type TradabilityStatus =
  | 'tradable'
  /** no bid and/or no ask in the latest capture — a halt or a delisting, or a very thin market */
  | 'no_two_sided_quote'
  /** priced at previous close ('C') or halted ('H') — not a live quote */
  | 'stale_marker'
  /** the capture never returned this conid. NOT the same as fine: absence of evidence. */
  | 'unknown';

export interface TradabilityName {
  isin: string; ticker: string; conid: number | null;
  weight: number; notional: number; side: 'long' | 'short';
  status: TradabilityStatus; why: string;
  /** how many of the recent captures showed it unquotable. 1 is often noise; >=2 is a real event. */
  consecutive: number;
  last_seen: string | null;
}

export interface Tradability {
  rebalance_id: number; strategy: string; status: string;
  as_of: string | null; captures_examined: number;
  /** 'no_data' is a THIRD state on purpose — unknown is not clear. */
  state: 'clear' | 'flagged' | 'no_data';
  n_names: number; n_flagged: number;
  weight_flagged: number; notional_flagged: number;
  names: TradabilityName[];
  note: string;
}

export const fetchTradability = (env: string, id: number) =>
  get<Tradability>(`/api/v1/trading/${env}/rebalances/${id}/tradability`);

/** The provenance stamp's `repair` block — present iff the book IS a repair. */
export interface RepairProvenance {
  method: 'drop' | 'prorata';
  excluded: string[];
  excluded_detail: { isin: string; ticker: string; mandate: string; weight: number }[];
  redistribution: { mandate: string; side: string; released_wt: number; factor: number;
                    n_scaled: number; note: string }[];
  n_before: number; n_after: number;
  gross_before: number; gross_after: number;
  net_before: number; net_after: number;
  gates: { gate: string; mandate: string; basis: string; state: 'ok' | 'warn' | 'fail';
           breaches: Record<string, unknown>[] }[];
  gate_state: 'ok' | 'warn' | 'fail';
  unchecked_gates: string[];
  overridden?: boolean;
  reason: string | null;
  repair_of: number | null;
  actor: string | null;
}

// method has NO default: 'drop' leaves the weight uninvested and 'prorata' redistributes it within
// the excluded name's own mandate. Different books; the operator chooses.
export const repairRebalance = (
  env: string, id: number, by: string, phrase: string,
  exclude: string[], method: 'drop' | 'prorata', reason: string,
) => post<{ request_id: number; excluded: string[]; method: string }>(
  `/api/v1/trading/${env}/rebalances/${id}/repair`, { by, phrase, exclude, method, reason });
