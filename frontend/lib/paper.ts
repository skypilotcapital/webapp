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

export interface PaperNavResponse {
  env: string;
  series: PaperNavPoint[];
  inception: string | null;
  first_invested: string | null;
  incl_cash_days: boolean;
  n_obs: number;
  stats_suppressed: boolean;
  reason: string | null;
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
  chain: { term: string; usd: number | null; bps: number | null; step: string }[];
  names: {
    ticker: string | null; mandate: string | null;
    delay_usd: number | null; fill_usd: number | null;
    total_usd: number | null; total_bps: number | null;
  }[];
  caveats: Record<string, string>;
}

/* ------------------------------------------------------------------------- exposures ---- */
// ⚠️ THE UNIT IS DATA, NOT A CONVENTION THE CLIENT MAY INFER. Sector and market columns of B are
// 0/1 dummies, so their exposure is an active WEIGHT — the same quantity `sector_tol` bounds.
// Style columns are cross-sectionally standardised, so theirs is in STANDARD DEVIATIONS. Rendering
// 0.13σ as "13%" is a unit error that reads perfectly plausibly; `unit` travels with every row so
// a formatter cannot get it wrong by looking at the factor name (`live_book_exposure.md` §6.3).
export type ExposureUnit = 'weight' | 'sigma' | 'beta' | 'raw';

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
  /** [10-LTE]'s slot — the panel contract (2026-08-13) reserves this row rather than letting a
   *  three-number risk line be wedged into an exposure-only layout later. Null until TE exists. */
  risk: null | {
    te_target: number | null; te_expected: number | null;
    te_realized: number | null; te_realized_se: number | null; window_days: number | null;
  };
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
  degradations: string[];
  note?: string;
  notes?: Record<string, string>;
}

export const fetchPaperExposures = (env = 'paper', strategy?: string) =>
  get<PaperExposures>(`/api/v1/paper/${env}/exposures${strategy ? `?strategy=${strategy}` : ''}`);

export const fetchPaperShortfall = (env = 'paper', top = 8) =>
  get<PaperShortfall>(`/api/v1/paper/${env}/shortfall?top=${top}`);

export const fetchPaperBook = (env = 'paper', strategy?: string) =>
  get<PaperBookResponse>(`/api/v1/paper/${env}/book${strategy ? `?strategy=${strategy}` : ''}`);

export const fetchPaperNav = (env = 'paper', strategy?: string) =>
  get<PaperNavResponse>(`/api/v1/paper/${env}/nav${strategy ? `?strategy=${strategy}` : ''}`);

export const fetchPaperFidelity = (env = 'paper') =>
  get<PaperFidelity>(`/api/v1/paper/${env}/fidelity`);

export const fetchPaperPositions = (env = 'paper', top = 10) =>
  get<PaperPositionsResponse>(`/api/v1/paper/${env}/positions?top=${top}`);
