// The IBKR paper track — the book we actually own ([08-PTRK] Phase A).
//
// Design: `08_website_and_tooling/website_research_hub_IA.md` §IX–§XV.
//
// Read-only, like every analytics surface. The one thing worth knowing before using these types:
// `stats_suppressed` on the NAV series is not an error state. Below 60 observations the API
// deliberately withholds annualized ratios, and the page must render the REASON rather than a
// blank or a zero — a one-month paper IR is noise that gets screenshotted and quoted back.

const API_BASE = '/api-proxy';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export interface PaperBook {
  date: string;
  strategy: string;
  account_id: string;
  nav: number | null;
  cash: number | null;
  gross_long: number | null;
  gross_short: number | null;
  net_exposure: number | null;
  pnl_d: number | null;
  margin_util: number | null;
  n_long: number | null;
  n_short: number | null;
  accrued_cash: number | null;
  broker_nlv: number | null;
  mark_quality: string | null;
  n_px_fallback: number | null;
  n_unresolved: number | null;
  n_unexplained_qty: number | null;
  commission: number | null;
  trade_cash: number | null;
  reconciled_at: string | null;
  built_at: string | null;
  snap_ts: string | null;
  /** From book_daily_status. `false` is a state to SHOW, not a reason to hide the numbers —
   *  a book that failed reconciliation is the one you most need to look at. */
  tied_out: boolean | null;
  nav_vs_broker: number | null;
  unresolved_breaks: number | null;
  /** Per-kind split of `unresolved_breaks` ([10-PXCAL]). DISPLAY ONLY — these do not enter
   *  `tied_out`, which stays strict until the price threshold is calibrated. They exist so a
   *  reader can see that a DEGRADED day is price noise rather than a cash or position break. */
  unresolved_price: number | null;
  unresolved_cash: number | null;
  unresolved_position: number | null;
  unresolved_fill: number | null;
  unresolved_nav: number | null;
  unresolved_other: number | null;
  gross_long_pct: number | null;
  gross_short_pct: number | null;
  gross_pct: number | null;
  net_pct: number | null;
}

export interface PaperBookResponse {
  env: string;
  book: PaperBook | null;
  degradations: string[];
}

export interface PaperNavPoint {
  date: string;
  nav: number | null;
  nav_idx: number | null;
  bench_idx: number | null;
  pnl_d: number | null;
  /** Did the book hold anything that day? The cash days are MARKED, never restated away. */
  invested: boolean;
}

/** Window boundaries every performance section shares. A window is `(start, end]` on BOOK dates:
 *  `start` is the close it is measured FROM. Resolved once, server-side, so the chart, the engine
 *  split and the contributor tables describe the same days. */
export type PeriodKey = '1d' | '5d' | 'wtd' | 'mtd' | '1m' | '3m' | 'since_reb' | 'incep' | 'custom';
export interface PaperPeriods {
  '1d': string; '5d': string; wtd: string; mtd: string; '1m': string; '3m': string; since_reb: string;
  incep: string; end: string;
  /** Present only when the caller asked for `period=custom`: the resolved measured-from close for
   *  the typed `from` day. The preset map is computed against the LATEST book date, so it does not
   *  describe an end-bounded custom window — read `engines.window` for that, never this. */
  custom?: string;
  last_rebalance_date: string | null;
}

export interface PaperNavResponse {
  env: string;
  /** Rebased to 100 at `perf_inception` — the close of the first TRADED day (owner decision
   *  2026-09-10). The funded-but-cash days are excluded unless `include_cash_days` was asked. */
  series: PaperNavPoint[];
  inception_funded: string | null;
  perf_inception: string | null;
  first_invested: string | null;
  incl_cash_days: boolean;
  periods: PaperPeriods | null;
  n_obs: number;
  stats_suppressed: boolean;
  reason: string | null;
}

/* ------------------------------------------------------------------- windowed performance ---- */
export interface PaperEnginePoint {
  date: string;
  /** positions = the engines summed; book = the NAV move; cash_other = book − positions. */
  positions: number | null; book: number | null; cash_other: number | null;
  total: number | null; bench: number | null;
  [mandate: string]: number | string | null;
}
export interface PaperEngines {
  env: string;
  period: PeriodKey;
  window: {
    start: string; end: string; n_days: number;
    nav_start: number | null; nav_end: number | null;
    book_return: number | null; bench_return: number | null;
  } | null;
  note?: string;
  periods: PaperPeriods;
  /** bps of NAV at the window START — one denominator, so the engines sum to the book. */
  by_mandate: { mandate: string; pnl: number; contrib_bps: number | null; n_rows: number }[];
  unattributed: { pnl: number; contrib_bps: number | null; n_rows: number };
  positions: { pnl: number; contrib_bps: number | null };
  /** Dividends (received on longs, PAID on shorts), interest, trade-day commission — NAV
   *  movement no position owns. book = positions + cash_other by construction. */
  cash_other: { pnl: number | null; contrib_bps: number | null };
  total: { pnl: number; contrib_bps: number | null };
  carried_rows: number;
  series: PaperEnginePoint[];
  basis: string;
}

export interface PaperContributorRow {
  ticker: string | null; isin: string | null; conid: number; mandate: string;
  side: string | null; sector: string | null;
  /** BLEND weight at the window end (signed); the sleeve's native book is 2×. */
  held_weight: number | null; held_weight_start: number | null; native_weight: number | null;
  /** Month-end S&P 500 cap weight — core only. */
  bench_weight: number | null; active_weight: number | null;
  stock_return: number | null;
  days_held: number; entered: boolean; exited: boolean;
  /** EXACT: the mandate's share of daily P&L summed over the window, bps of start NAV. */
  contrib_bps: number | null; pnl: number;
  /** held weight at start × stock return — the simple product, for comparison. */
  approx_bps: number | null;
}
export interface PaperContributors {
  env: string;
  period: PeriodKey;
  window: { start: string; end: string; nav_start: number | null; bench_return: number | null } | null;
  note?: string;
  periods: PaperPeriods;
  bench_weights_asof: string | null;
  by_mandate: Record<string, {
    n_names: number; total_bps: number | null;
    contributors: PaperContributorRow[]; detractors: PaperContributorRow[];
  }>;
  notes: Record<string, string>;
}

/* --------------------------------------------------------------------------- integrity ---- */
export interface PaperRecon {
  env: string;
  dates: { date: string; tied_out: boolean | null; unresolved: number;
           by_kind: Record<string, number> }[];
  breaks: { id: number; date: string; kind: string; conid: number | null; ticker: string | null;
            internal_value: number | null; broker_value: number | null; diff: number | null;
            resolved: boolean; note: string | null; rebalance_id: number | null }[];
  n_breaks: number;
  note?: string;
}

export interface PaperCorporateAction {
  date: string; ticker: string | null; isin: string; action: string; value: number | null;
  contraticker: string | null; contraname: string | null; is_material: boolean;
  side: string | null; first_seen: string | null; held_through: boolean;
}
export interface PaperCorporateActions {
  env: string;
  window: { start: string; end: string } | null;
  feed: { latest: string | null; age_days: number | null; n_rows: number; stale: boolean } | null;
  actions: PaperCorporateAction[];
  dividends: PaperCorporateAction[];
  other: PaperCorporateAction[];
  n_dividends: number;
  note?: string;
}

export interface PaperFidelity {
  env: string;
  rebalance: {
    rebalance_id: number; strategy: string; signal_date: string;
    status: string; sized_equity: number | null; submitted_at: string | null;
  } | null;
  note?: string;
  coverage: {
    n_target: number; n_planned: number; n_dust_filtered: number;
    n_filled_names: number; n_buy: number; n_sell: number;
    orders: Record<string, number>;
  };
  execution: {
    planned_notional: number | null; filled_notional: number | null;
    planned_qty: number | null; filled_qty: number | null; n_fills: number;
  };
  /** Every bps figure is notional-weighted and measured from the ARRIVAL mid, read from
   *  `trading.cost_calibration` ([10-SHFL]) rather than recomputed. `delay_bps` is reported and
   *  NOT inside `realized_bps`: not trading instantly is a real implementation cost but it is not
   *  the cost model's quantity, and folding it in is what made this panel flatter the model. */
  cost: {
    commission_usd: number | null;
    measured_from: string;
    exec_bps: number | null;
    commission_bps: number | null;
    realized_bps: number | null;
    delay_bps: number | null;
    model_predicted_bps: number | null;
    /** NEGATIVE = the model over-predicted (we spent less than it said). */
    residual_bps: number | null;
    n_names: number;
    calibrates: string;
    /** 'plan' = written at INSERT from the inputs the trade was sized on. 'backfill' = computed
     *  after the fact for a plan frozen before that code existed — a weaker claim, and the page
     *  must say so rather than render the two identically. */
    prediction_source: 'plan' | 'backfill' | 'mixed' | null;
    prediction_panel_date: string | null;
    prediction_panel_lag_days: number | null;
  };
  plan_drift: {
    preview_notional: number | null; final_notional: number | null; note: string;
  };
  /** Always true on paper. Simulated fills mean measured impact is a floor, not an estimate. */
  impact_is_lower_bound: boolean;
  impact_note: string;
}

export interface PaperPosition {
  conid: number; isin: string | null; ticker: string | null;
  side: string | null; qty: number | null; price: number | null;
  price_source: string | null;
  mkt_value: number; weight: number | null;
  pnl_d: number | null;
  /** Basis points OF NAV — not dollars, not position return. */
  contrib_bps: number | null;
}

export interface PaperPositionsResponse {
  env: string;
  date: string | null;
  nav: number;
  n_positions: number;
  positions: PaperPosition[];
  contributors: PaperPosition[];
  detractors: PaperPosition[];
  /** Core vs sleeve, READ from the ledger's snapshot — never recomputed here. Null when the
   *  date has no snapshot (it rides the daily book build). */
  mandate_split: PaperMandateSplit | null;
  mandate_split_note: string | null;
}

export interface PaperMandateSplit {
  by_mandate: {
    mandate: string;
    n_names: number;
    /** BLEND weight — the mandate's contribution to the book we hold. NOT its native weight. */
    net_weight: number | null;
    gross_weight: number | null;
    mkt_value: number | null;
    pnl_d: number | null;
    contrib_bps: number | null;
    /** Names placed by a fallback rule rather than by intended target weight — judgement, not
     *  arithmetic, and shown separately for that reason. */
    n_fallback_rule: number;
  }[];
  /** Positions the ledger could not place. Reported, never absorbed. */
  residual: { n_names: number; mkt_value: number | null };
  basis: string;
}

export interface PaperShortfall {
  env: string;
  window: {
    rebalance_id: number; strategy: string;
    window_start: string | null; window_end: string | null; window_days: number;
    /** These three govern how the number may be read at all — not footnotes. */
    is_open: boolean; is_establishment: boolean;
    aum: number; total_usd: number | null; total_bps: number | null;
    n_names: number; n_unfilled: number;
    method: string | null; terminal_src: string | null; shape_source: string | null;
    tied_out_days: number;
  } | null;
  note?: string;
  /** Set when the rebalance the page asked for has no window yet — so the page can say which
   *  one DOES exist rather than silently rendering a different trade. */
  requested_rebalance_id?: number | null;
  latest_computed?: { rebalance_id: number; window_start: string; window_end: string;
                      is_establishment: boolean; is_open: boolean } | null;
  chain?: { term: string; usd: number | null; bps: number | null; step: string }[];
  names?: {
    ticker: string | null; mandate: string | null;
    delay_usd: number | null; fill_usd: number | null;
    total_usd: number | null; total_bps: number | null;
  }[];
  caveats?: Record<string, string>;
}

/* ------------------------------------------------------------------------- exposures ---- */
// ⚠️ THE UNIT IS DATA, NOT A CONVENTION THE CLIENT MAY INFER. Sector and market columns of B are
// 0/1 dummies, so their exposure is an active WEIGHT — the same quantity `sector_tol` bounds.
// Style columns are cross-sectionally standardised, so theirs is in STANDARD DEVIATIONS. Rendering
// 0.13σ as "13%" is a unit error that reads perfectly plausibly; `unit` travels with every row so
// a formatter cannot get it wrong by looking at the factor name (`live_book_exposure.md` §6.3).
// Re-exported, not redeclared: the canonical definition (and the formatter that honours it) lives
// in `lib/exposureUnits`, shared with the pre-trade panel.
export type { ExposureUnit } from './exposureUnits';
import type { ExposureUnit } from './exposureUnits';

export interface BookExposureFactor {
  factor: string;
  kind: 'sector' | 'style' | 'market';
  unit: ExposureUnit;
  exposure: number | null;
  /** Only NET-leg sector rows carry a band — `sector_tol` bounds exactly those dummies. */
  band: number | null;
  /** 'hard' = the optimiser could not have breached at construction, so a breach is DRIFT.
   *  'soft' = a hinge penalty it may deliberately have paid, so a breach is CONTEXT. */
  band_kind: 'hard' | 'soft' | null;
  breach: boolean | null;
  /** Signed room left: band − |exposure|. Negative IS the breach, so there is no second concept. */
  headroom: number | null;
}

export interface BookExposureLeg {
  leg: 'long' | 'short' | 'benchmark';
  benchmark: string | null;
  /** Each leg is re-normalised to its OWN gross, which is why it carries no band. */
  leg_gross: number | null;
  n_names: number | null;
  factors: Pick<BookExposureFactor, 'factor' | 'kind' | 'unit' | 'exposure'>[];
}

export interface BookExposureBreach extends
  Pick<BookExposureFactor, 'factor' | 'kind' | 'exposure' | 'band' | 'band_kind' | 'headroom'> {
  /** Breached on the newest measured day, as opposed to earlier in the window. */
  current: boolean;
  /** Counted in MEASURED days, not calendar days — read beside `history`. */
  breach_days: number;
  run_days: number;
  since: string | null;
}

/** Target · Expected · Realized for one mandate ([10-LTE]).
 *
 *  ⚠️ `pred_te` and `bias` ARE MACHINERY, NOT ROWS. The risk model under-predicts by ~70%
 *  consistently, so "predicted 3.00% vs target 3.0% ✓" would be reassuring and wrong. The bias is
 *  already baked into `te_expected`; these two travel only so a methodology note can show the
 *  arithmetic. A reader must never have to multiply two numbers together to learn what the book is
 *  doing. */
export interface BookRisk {
  /** 'config' = a target the optimiser was given. 'implied' = DERIVED from the components — the
   *  fund row and only the fund row, because a blend runs no optimizer and nobody set it. An
   *  implied number must never render under a heading that says "target". */
  target_source?: 'config' | 'implied';
  /** Nominal, from the LOCKED config. On the fund row this is the IMPLIED value instead. */
  te_target: number | null;
  /** What the optimiser actually SPENT: te_target × cap_calibration. Differs from the nominal
   *  wherever the W4 dial is active — the sleeve's sits near its 0.5 floor, so 6% nominal is a
   *  ~3.7% budget, and showing only the nominal reads as on-target when it is not the question. */
  te_budget: number | null;
  cap_calibration: number | null;
  /** THE REPORTED NUMBER — the risk model corrected for its known bias. */
  te_expected: number | null;
  /** Inherited from implied_b's own ~20% (N=12 monthly obs), so 5.1% is honestly 5.1% ± 1.0%. */
  te_expected_se: number | null;
  /** ⚠️ A DIFFERENT QUANTITY FROM `te_expected_se` — do not merge them into one ± on the page.
   *  `_se` is how precisely TODAY's correction was measured. This pair is how far that correction
   *  MOVES between regimes: [10-BIAS] Q3 measured η² = 0.48–0.87 of its variance explained by which
   *  regime you are in, means swinging up to 2.3×, and that pinning a median would have been wrong
   *  by +47% to −36%. In TE units (pred_te × the bias percentiles) so the panel never asks a reader
   *  to multiply by a bias — the same rule that keeps `bias` machinery rather than a row.
   *
   *  ⚠️ `te_expected` MAY FALL OUTSIDE [lo, hi]. That is the finding, not a glitch: it means the
   *  correction sits at a historical extreme (see `bias_pctile`). Never clamp the point into the
   *  band, and never widen the band to contain it. */
  te_expected_lo: number | null;
  te_expected_hi: number | null;
  /** Where the CURRENT correction sits in its own history, 0–100. High = the risk model is
   *  under-predicting more than usual right now. */
  bias_pctile: number | null;
  bias_n: number | null;
  te_realized: number | null;
  te_realized_63d: number | null;
  te_realized_252d: number | null;
  /** RELATIVE, not absolute: 5% at ±0.15 means 4.25–5.75%, not −10% to 20%. A floor, too —
   *  1/√(2N) assumes iid normal returns and real ones are fat-tailed and autocorrelated. */
  te_realized_rel_se: number | null;
  n_obs: number;
  /** False = a series exists but is too short to quote. Distinct from `risk === null`, which means
   *  nothing has been measured at all; the second is progress and the first is not. */
  publishable: boolean;
  pred_te: number | null;
  bias: number | null;
  bias_source: string | null;
  factor_var: number | null;
  specific_var: number | null;
  coverage_sigma: number | null;
  f_asof: string | null;
  sigma_asof: string | null;
}

export interface BookExposureMandate {
  mandate: string;
  /** null = measured ABSOLUTE (b = 0). A dollar-neutral sleeve is an outright bet, not a
   *  relative one — it has no benchmark rather than having cash as one. */
  benchmark: string | null;
  basis: string;
  gross: number | null;
  n_names: number | null;
  n_covered: number | null;
  coverage_weight: number | null;
  n_no_isin: number | null;
  band: number | null;
  band_kind: 'hard' | 'soft' | null;
  /** [10-LTE]'s row — the panel contract (2026-08-13) reserved this slot; the nightly job fills it.
   *  Null when tracking error has not been measured for this mandate yet. */
  risk: null | BookRisk;
  risk_note: string | null;
  tightest: BookExposureFactor | null;
  factors: BookExposureFactor[];
  legs: BookExposureLeg[];
  breaches: BookExposureBreach[];
}

export interface PaperExposures {
  env: string;
  strategy?: string;
  date: string | null;
  b_asof?: string | null;
  b_age_days?: number | null;
  /** The measured window. Without it, "0 breach-days" on a four-day series reads as "never". */
  history?: { start: string | null; n_days: number };
  mandates: BookExposureMandate[];
  /** The WHOLE netted book against the S&P 500 — one level up from the mandate blocks, which is why
   *  it is not a third entry in `mandates`. Its `te_target` is IMPLIED by the components, never set;
   *  `te_expected` is measured exactly from Σ on the blended weights. */
  fund?: BookRisk | null;
  fund_note?: string | null;
  degradations: string[];
  note?: string;
  notes?: Record<string, string>;
}

export const fetchPaperExposures = (env = 'paper', strategy?: string) =>
  get<PaperExposures>(`/api/v1/paper/${env}/exposures${strategy ? `?strategy=${strategy}` : ''}`);

const q = (o: Record<string, string | number | undefined>) =>
  Object.entries(o).filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

export const fetchPaperShortfall = (env = 'paper', top = 8, rebalanceId?: number, strategy?: string) =>
  get<PaperShortfall>(`/api/v1/paper/${env}/shortfall?${q({ top, rebalance_id: rebalanceId, strategy })}`);

export const fetchPaperBook = (env = 'paper', strategy?: string) =>
  get<PaperBookResponse>(`/api/v1/paper/${env}/book?${q({ strategy })}`);

export const fetchPaperNav = (env = 'paper', strategy?: string) =>
  get<PaperNavResponse>(`/api/v1/paper/${env}/nav?${q({ strategy })}`);

export const fetchPaperFidelity = (env = 'paper') =>
  get<PaperFidelity>(`/api/v1/paper/${env}/fidelity`);

export const fetchPaperPositions = (env = 'paper', top = 10) =>
  get<PaperPositionsResponse>(`/api/v1/paper/${env}/positions?top=${top}`);

// `start`/`end` apply to `period='custom'` only and are ignored by every preset. `start` is the
// first day the window should INCLUDE (the server resolves it to the close before, exactly as
// month-to-date does), so a typed window and a preset spanning the same days agree to the digit.
export const fetchPaperEngines = (env = 'paper', strategy?: string, period: PeriodKey = 'incep',
                                  start?: string, end?: string) =>
  get<PaperEngines>(`/api/v1/paper/${env}/engines?${q({ strategy, period, start, end })}`);

export const fetchPaperContributors = (env = 'paper', strategy?: string, period: PeriodKey = 'incep',
                                       top = 8, start?: string, end?: string) =>
  get<PaperContributors>(`/api/v1/paper/${env}/contributors?${q({ strategy, period, top, start, end })}`);

export const fetchPaperRecon = (env = 'paper', strategy?: string, days = 10) =>
  get<PaperRecon>(`/api/v1/paper/${env}/recon?${q({ strategy, days })}`);

export const fetchPaperCorporateActions = (env = 'paper', strategy?: string, days = 30) =>
  get<PaperCorporateActions>(`/api/v1/paper/${env}/corporate-actions?${q({ strategy, days })}`);
