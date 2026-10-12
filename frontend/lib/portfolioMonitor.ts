// Portfolio Monitor — what STATE the book we hold is in right now ([08-PMON]).
//
// Design: `08_website_and_tooling/portfolio_monitor_IA.md`. Two pages on the live IBKR paper
// account: Holdings and Exposures. Everything here READS stored rows; the browser formats and
// arranges. Three decisions shape the types (owner, 2026-10-12):
//
//   * TARGET MEANS THE LIVE BOOK — the frozen target of the governing rebalance, never the
//     research book.
//   * NO FLAGS — the payload carries no breach booleans and no headroom. Values, targets,
//     benchmarks and bands are shown side by side, and nothing is coloured by how far apart they are.
//   * EVERY SOURCE HAS ITS OWN AS-OF — book date, risk-model month-end, benchmark month-end, borrow
//     file — and they are printed separately, never merged.

import type { BookRisk } from '@/lib/paper';
import type { ExposureUnit } from '@/lib/exposureUnits';

const API_BASE = '/api-proxy';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export interface MonitorTarget {
  rebalance_id: number;
  signal_date: string | null;
  status: string;
  trade_date: string | null;
}

export interface HoldingRow {
  conid: number | null;
  isin: string | null;
  ticker: string | null;
  name: string | null;
  sector: string | null;
  side: 'long' | 'short';
  /** False = in the target, not held (e.g. an unfilled order). */
  held: boolean;
  /** core | sleeve | split | unattributed — what the ledger recorded, never re-allocated here. */
  mandate: string;
  mandate_split: { mandate: string; qty: number | null; mkt_value: number | null; method: string }[];
  qty: number | null;
  price: number | null;
  price_source: string | null;
  mkt_value: number;
  /** % of NAV, as a fraction. */
  weight: number | null;
  /** The frozen target's weight (composite row), fraction of NAV. 0 = not in the target. */
  target_weight: number;
  drift_pp: number | null;
  /** Market value minus target weight × today's NAV. Not an order. */
  drift_usd: number | null;
  pnl_d: number | null;
  pnl_since_rebalance: number | null;
  /** Core names only: S&P 500 month-end cap weight. */
  bench_weight: number | null;
  active_weight: number | null;
  /** Shorts only. Percent per year, as IBKR publishes it. */
  borrow_fee_pct: number | null;
  borrow_available: number | null;
  borrow_date: string | null;
  last_fill: string | null;
}

export interface MonitorHoldings {
  env: string;
  strategy: string;
  account_id: string | null;
  date: string | null;
  expected_date: string;
  built_at: string | null;
  nav: number | null;
  book: null | {
    cash: number | null; gross_long: number | null; gross_short: number | null;
    net: number | null; n_long: number | null; n_short: number | null; pnl_d: number | null;
  };
  target: MonitorTarget | null;
  target_note: string | null;
  since_rebalance_start: string;
  benchmark_asof: string | null;
  notices: string[];
  rows: HoldingRow[];
  notes: Record<string, string>;
  note?: string;
}

export interface ExposureRow {
  factor: string;
  kind: 'sector' | 'style' | 'market';
  unit: ExposureUnit;
  /** The benchmark's OWN exposure (absolute). null where the mandate has none (the sleeve's net). */
  benchmark: number | null;
  /** The frozen live target, same convention as `today`. */
  target: number | null;
  today: number | null;
  /** today − target. */
  change: number | null;
  band: number | null;
  band_kind: 'hard' | 'soft' | null;
}

export interface ExposureLeg {
  leg: 'long' | 'short';
  benchmark: string | null;
  leg_gross: number | null;
  n_names: number | null;
  target_leg_gross: number | null;
  target_n_names: number | null;
  factors: ExposureRow[];
}

export interface ExposureMandate {
  mandate: string;
  /** null = measured ABSOLUTE (the sleeve is market-neutral, measured against cash). */
  benchmark: string | null;
  basis: string;
  gross: number | null;
  n_names: number | null;
  n_covered: number | null;
  coverage_weight: number | null;
  n_no_isin: number | null;
  band: number | null;
  band_kind: 'hard' | 'soft' | null;
  target: null | { rebalance_id: number; signal_date: string | null; gross: number | null;
                   n_names: number | null; coverage_weight: number | null };
  target_note: string | null;
  risk: BookRisk | null;
  risk_note: string | null;
  sectors: ExposureRow[];
  styles: ExposureRow[];
  legs: ExposureLeg[];
}

export interface MonitorExposures {
  env: string;
  strategy: string;
  account_id: string | null;
  date: string | null;
  expected_date: string;
  b_asof: string | null;
  b_age_days: number | null;
  benchmark_asof: string | null;
  target: MonitorTarget | null;
  fund: BookRisk | null;
  fund_note: string | null;
  mandates: ExposureMandate[];
  notices: string[];
  notes: Record<string, string>;
  note?: string;
}

export const fetchMonitorHoldings = (env = 'paper') =>
  get<MonitorHoldings>(`/api/v1/portfolio-monitor/${env}/holdings`);

export const fetchMonitorExposures = (env = 'paper') =>
  get<MonitorExposures>(`/api/v1/portfolio-monitor/${env}/exposures`);

export const holdingsCsvUrl = (env: string, f: { side?: string; mandate?: string; sector?: string }) => {
  const q = Object.entries(f).filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return `${API_BASE}/api/v1/portfolio-monitor/${env}/holdings.csv${q ? `?${q}` : ''}`;
};

/* ---------------------------------------------------------------------------- formatting ---- */

const MINUS = '−';

/** Dollars, no cents, a real minus sign. */
export function usd(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  const s = Math.round(Math.abs(v)).toLocaleString('en-US');
  return `${v < 0 ? MINUS : ''}$${s}`;
}

/** Signed dollars, for P&L and drift. */
export function usdSigned(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  if (Math.round(v) === 0) return '$0';
  return `${v < 0 ? MINUS : '+'}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`;
}

/** A weight as a percent (unsigned unless negative). */
export function pct(v: number | null | undefined, d = 2): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v < 0 ? MINUS : ''}${(Math.abs(v) * 100).toFixed(d)}%`;
}

/** A difference of two weights — percentage POINTS, always signed. */
export function pp(v: number | null | undefined, d = 2): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v < 0 ? MINUS : '+'}${(Math.abs(v) * 100).toFixed(d)}pp`;
}

/** A change in an exposure, in the exposure's own unit (pp for weights). */
export function change(v: number | null | undefined, unit: ExposureUnit): string {
  if (v == null || Number.isNaN(v)) return '—';
  const s = v < 0 ? MINUS : '+';
  const a = Math.abs(v);
  if (unit === 'sigma') return `${s}${a.toFixed(3)}σ`;
  if (unit === 'beta') return `${s}${a.toFixed(3)}`;
  return `${s}${(a * 100).toFixed(2)}pp`;
}

export function shares(v: number | null | undefined): string {
  if (v == null) return '—';
  const whole = Math.abs(v - Math.round(v)) < 1e-9;
  const t = Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: whole ? 0 : 3 });
  return v < 0 ? `${MINUS}${t}` : t;
}

export function dayLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${iso}`;
}

export const MANDATE_LABEL: Record<string, string> = {
  core: 'Core', sleeve: 'Sleeve', split: 'Split', unattributed: 'Unattributed',
};
