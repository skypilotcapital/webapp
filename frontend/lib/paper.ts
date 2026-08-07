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
  cost: {
    commission_usd: number | null; commission_bps: number | null;
    slippage_usd: number | null; slippage_bps: number | null;
    realized_bps: number | null;
    model_predicted_bps: number | null;
    vs_model_bps: number | null;
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
  /** Always null in Phase A — the sleeve ledger is stateless and persists no attribution. */
  mandate_split: null;
  mandate_split_note: string;
}

export const fetchPaperBook = (env = 'paper', strategy?: string) =>
  get<PaperBookResponse>(`/api/v1/paper/${env}/book${strategy ? `?strategy=${strategy}` : ''}`);

export const fetchPaperNav = (env = 'paper', strategy?: string) =>
  get<PaperNavResponse>(`/api/v1/paper/${env}/nav${strategy ? `?strategy=${strategy}` : ''}`);

export const fetchPaperFidelity = (env = 'paper') =>
  get<PaperFidelity>(`/api/v1/paper/${env}/fidelity`);

export const fetchPaperPositions = (env = 'paper', top = 10) =>
  get<PaperPositionsResponse>(`/api/v1/paper/${env}/positions?top=${top}`);
