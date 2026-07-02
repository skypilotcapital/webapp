// Client-side helpers for the Portfolios (Layer-2) hub: formatting, sweep grouping, and
// auto-generated per-sweep takeaways (derived from backtest_summary deltas — no hand-curation).

import type { PortfolioBacktest } from '@/types/api';

export const pct = (v: number | null | undefined, d = 1) =>
  v == null || isNaN(v) ? '—' : `${(v * 100).toFixed(d)}%`;
export const pctSign = (v: number | null | undefined, d = 1) =>
  v == null || isNaN(v) ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`;
export const num = (v: number | null | undefined, d = 2) =>
  v == null || isNaN(v) ? '—' : v.toFixed(d);

export const PRIMARY_MODEL: Record<string, string> = { sp500: 'N014', r2500: 'NR002' };

export function fmtSector(v: number | null): string {
  return v == null ? 'off' : `±${(v * 100).toFixed(0)}%`;
}
export function fmtTurn(v: number | null): string {
  return v == null ? 'none' : `${(v * 100).toFixed(0)}%`;
}

// A single point on a parameter frontier.
export interface SweepPoint {
  model_label: string;
  x: number;         // numeric x for plotting
  xLabel: string;    // display label
  ir: number | null;
  realized_te: number | null;
  turnover: number | null;
  sharpe: number | null;
  is_production: boolean;
}
export interface Sweep {
  key: string;
  title: string;
  xTitle: string;
  points: SweepPoint[];
  takeaway: string;
}

function mk(rows: PortfolioBacktest[], x: (r: PortfolioBacktest) => number, xLabel: (r: PortfolioBacktest) => string): SweepPoint[] {
  return rows
    .map((r) => ({
      model_label: r.model_label, x: x(r), xLabel: xLabel(r), ir: r.ir,
      realized_te: r.realized_te, turnover: r.avg_turnover, sharpe: r.sharpe_net,
      is_production: !!r.is_production,
    }))
    .sort((a, b) => a.x - b.x);
}

function takeaway(prefix: string, pts: SweepPoint[]): string {
  const valid = pts.filter((p) => p.ir != null);
  if (valid.length < 2) return prefix;
  const first = valid[0], last = valid[valid.length - 1];
  const best = valid.reduce((a, b) => ((b.ir ?? -9) > (a.ir ?? -9) ? b : a));
  const dir = (last.ir ?? 0) > (first.ir ?? 0) ? 'rises' : (last.ir ?? 0) < (first.ir ?? 0) ? 'falls' : 'is flat';
  return `${prefix} IR ${dir} ${first.ir!.toFixed(2)}→${last.ir!.toFixed(2)} across ${first.xLabel}–${last.xLabel}; best <b>${best.ir!.toFixed(2)} at ${best.xLabel}</b>.`;
}

// Build the parameter-sweep tiles for a universe from the full (non-legacy) backtest list.
export function buildSweeps(rows: PortfolioBacktest[], universe: string): Sweep[] {
  const hard = rows.filter((r) => r.variant === 'hard');
  const lo = hard.filter((r) => r.strategy === 'long_only');
  const primary = PRIMARY_MODEL[universe];
  const out: Sweep[] = [];

  const te = lo.filter((r) => r.experiment === 'te');
  if (te.length) {
    const p = mk(te, (r) => r.te_target ?? 0, (r) => pct(r.te_target, 0));
    out.push({ key: 'te', title: 'Tracking-Error target', xTitle: 'IR vs TE target', points: p,
      takeaway: takeaway('Tighter TE →', p) });
  }

  const turn = lo.filter((r) => r.experiment === 'sweep' && r.signal_model_id === primary);
  if (turn.length) {
    const p = mk(turn, (r) => r.turnover_cap ?? 2, (r) => fmtTurn(r.turnover_cap));
    out.push({ key: 'turnover', title: `Turnover cap · ${primary}`, xTitle: 'IR vs turnover cap', points: p,
      takeaway: takeaway('Looser turnover →', p) });
  }

  const sec = lo.filter((r) => r.experiment === 'sector');
  if (sec.length) {
    const p = mk(sec, (r) => r.sector_tol ?? 0.99, (r) => fmtSector(r.sector_tol));
    out.push({ key: 'sector', title: 'Sector constraint', xTitle: 'IR vs sector tolerance', points: p,
      takeaway: takeaway('Looser sector band →', p) });
  }

  const lam = lo.filter((r) => r.experiment === 'phase5');
  if (lam.length) {
    const p = mk(lam, (r) => r.lambda_risk ?? 0, (r) => `λ${r.lambda_risk}`);
    out.push({ key: 'lambda', title: 'Risk aversion λ', xTitle: 'IR vs λ', points: p,
      takeaway: takeaway('Higher λ →', p) });
  }

  return out;
}

// Base-vs-hard A/B pairs (the solver-honesty story): pair each hard config with its base twin.
export interface ABPair {
  label: string; model: string; experiment: string;
  base_ir: number | null; hard_ir: number | null;
  base_opt: number | null; hard_opt: number | null;
}
export function buildABPairs(rows: PortfolioBacktest[]): ABPair[] {
  const byLabel = new Map(rows.map((r) => [r.model_label, r]));
  const pairs: ABPair[] = [];
  for (const r of rows) {
    if (r.variant !== 'hard' || !r.ab_twin) continue;
    const base = byLabel.get(r.ab_twin);
    if (!base) continue;
    pairs.push({
      label: r.model_label, model: r.signal_model_id ?? '', experiment: r.experiment ?? '',
      base_ir: base.ir, hard_ir: r.ir, base_opt: base.opt_pct, hard_opt: r.opt_pct,
    });
  }
  return pairs;
}
