// Model Monitor › Factors ([08-FMON]).
//
// Everything here READS precomputed rows (research.fmon_*, written monthly by the alpha chain step
// `fmon`). No statistic is computed in the browser: 12-month means, z-scores, percentiles and the
// per-family coupling fits all come from ONE implementation upstream. The page may format, order and
// pick rows — nothing more.
//
// Three different questions, never conflated:
//   RELIANCE      what the model leans on            share of the month's mean |SHAP|
//   FACTOR PAYOFF how each factor itself did         sign-aligned within-sector IC (P01)
//   CONTRIBUTION  what the model's USE of it earned  share of GROSS |Cov(SHAP, return)|
// Contribution can be WITHHELD (contribution_valid = false) — then every contribution field is null
// and contribution_note says why. Never fill it in from anything else.

const API_BASE = '/api-proxy';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export type Universe = 'sp500' | 'russell2500';

export interface MonitorSummary {
  model_id: string;
  universe: Universe;
  horizon_months: number;
  blend_label: string | null;
  blend_weight: number | null;
  blend_smooth: string | null;
  book_role: string | null;
  panel_first: string;
  panel_edge: string;
  payoff_edge: string;
  compared_asof: string;
  contribution_valid: boolean;
  contribution_note: string | null;
  env_value: number | null;
  env_pctile: number | null;
  skill_value: number | null;
  skill_pctile: number | null;
  align_value: number | null;
  align_pctile: number | null;
  tiles_asof: string | null;
  n_features: number;
  n_unmapped: number;
  unmapped: string | null;
  built_at: string;
}

export interface FamilyNow {
  family: string;
  asof: string | null;
  coupling: number | null;
  payoff_now: number | null;
  expected: number | null;
  actual: number | null;
  gap_pctile: number | null;
  expectation_trustworthy: boolean | null;
  reads_as: string | null;
  quadrant_asof: string;
  z_reliance_12m: number | null;
  z_contribution_12m: number | null;
  attention: number | null;
  n_features: number;
}

export interface FamilyPoint {
  date: string;
  family: string;
  reliance: number | null;
  contribution: number | null;
  payoff: number | null;
  reliance_12m: number | null;
  contribution_12m: number | null;
  payoff_12m: number | null;
  z_reliance_12m: number | null;
  z_contribution_12m: number | null;
  z_payoff_12m: number | null;
}

export interface Mover {
  feature: string;
  family: string;
  contribution_12m: number;
  reliance_12m: number | null;
  payoff_12m: number | null;
  reliance_rank: number;
}

export interface ModelView {
  summary: MonitorSummary;
  families: FamilyNow[];
  history: FamilyPoint[];
  movers: { asof: string | null; best: Mover[]; worst: Mover[] };
}

export interface FeaturePoint {
  date: string;
  feature: string;
  reliance: number | null;
  contribution: number | null;
  payoff: number | null;
  reliance_12m: number | null;
  contribution_12m: number | null;
  payoff_12m: number | null;
  reliance_rank: number;
}

export const fetchModels = () => get<MonitorSummary[]>('/api/v1/model-monitor/factors/models');
export const fetchModel = (id: string) =>
  get<ModelView>(`/api/v1/model-monitor/factors/${encodeURIComponent(id)}`);
export const fetchFamily = (id: string, family: string) =>
  get<FeaturePoint[]>(
    `/api/v1/model-monitor/factors/${encodeURIComponent(id)}/family/${encodeURIComponent(family)}`);

// ---------------------------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------------------------

// One fixed colour per family, so a family reads the same in every panel. Muted to sit on ivory.
export const FAMILY_COLOR: Record<string, string> = {
  Technical: '#0e7c6f',
  Momentum: '#1e40af',
  Quality: '#6d28d9',
  Growth: '#b45309',
  Valuation: '#9d174d',
  ShortSide: '#0369a1',
  Ownership: '#4d7c0f',
  Risk: '#b91c1c',
  Earnings: '#a16207',
  Control: '#8a7f6b',
};
export const familyColor = (f: string) => FAMILY_COLOR[f] ?? '#8a7f6b';

// 2024 onward is SPENT HOLDOUT: shaded on every time axis, never fitted to.
export const HOLDOUT_START = '2024-01-01';

export function monthLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export const pct = (v: number | null | undefined, digits = 1) =>
  v == null ? '—' : `${(v * 100).toFixed(digits)}%`;

export function signedPct(v: number | null | undefined, digits = 1): string {
  if (v == null) return '—';
  const s = (v * 100).toFixed(digits);
  if (Number(s) === 0) return `${(0).toFixed(digits)}%`;     // no "+0%" / "-0.0%"
  return `${v > 0 ? '+' : ''}${s}%`;
}

export function ordinal(n: number): string {
  const r = Math.round(n);
  const s = ['th', 'st', 'nd', 'rd'];
  const v = r % 100;
  return `${r}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export const pctileText = (p: number | null | undefined) => (p == null ? '—' : `${ordinal(p)} pct`);

// The family's component label for a tab: "N005 · 1M · 70% of N014".
export function componentLabel(s: MonitorSummary): string {
  const parts = [s.model_id, `${s.horizon_months}M`];
  if (s.blend_label && s.blend_weight != null) {
    parts.push(`${Math.round(s.blend_weight * 100)}% of ${s.blend_label}`);
  }
  return parts.join(' · ');
}
