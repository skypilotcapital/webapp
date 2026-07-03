// Client-side helpers for the Portfolios (Layer-2) hub: formatting, sweep grouping, and
// auto-generated per-sweep takeaways (derived from backtest_summary deltas — no hand-curation).

import type { PortfolioBacktest, PortfolioMonthlyPoint } from '@/types/api';

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

// --------------------------------------------------------------- Model comparison
// A config (optimizer settings) shared by >=2 of the carried-forward models, so the models can be
// held to the SAME settings and compared apples-to-apples (sweep = fix model, vary params; compare
// = fix params, vary model).
export interface CompareConfig {
  key: string;
  label: string;
  variant: string | null;
  strategy: string | null;
  te: number | null;
  sec: number | null;
  to: number | null;
  rows: PortfolioBacktest[]; // one per model, sorted by model id
}

const cfgKey = (r: PortfolioBacktest) =>
  [r.variant, r.strategy, r.te_target, r.sector_tol, r.turnover_cap].join('|');

// Group the (already universe-scoped, non-legacy) rows into configs run by >=2 distinct models.
export function buildCompareConfigs(rows: PortfolioBacktest[]): CompareConfig[] {
  const groups = new Map<string, PortfolioBacktest[]>();
  for (const r of rows) {
    const k = cfgKey(r);
    const arr = groups.get(k);
    if (arr) arr.push(r); else groups.set(k, [r]);
  }
  // priority when the same model+config appears under several experiment tags — keep the best-labelled one
  const expRank = (r: PortfolioBacktest) => r.is_production ? -1 :
    (({ prod: 0, sweep: 1, sector: 2, te: 3, phase5: 4 } as Record<string, number>)[r.experiment ?? ''] ?? 5);
  const out: CompareConfig[] = [];
  for (const [key, grp] of groups) {
    // collapse to ONE row per model (identical params can appear under sweep/sector/te experiments)
    const byModel = new Map<string, PortfolioBacktest>();
    for (const r of grp) {
      const id = r.signal_model_id ?? r.model_label;
      const cur = byModel.get(id);
      if (!cur || expRank(r) < expRank(cur)) byModel.set(id, r);
    }
    if (byModel.size < 2) continue;
    const modelRows = [...byModel.values()].sort((a, b) => (a.signal_model_id ?? '').localeCompare(b.signal_model_id ?? ''));
    const r0 = modelRows[0];
    const label = [
      r0.variant ?? '—',
      r0.strategy === 'long_short' ? 'L/S' : 'LO',
      r0.te_target != null ? `TE ${(r0.te_target * 100).toFixed(0)}%` : 'no-TE',
      r0.sector_tol != null ? `sec ±${(r0.sector_tol * 100).toFixed(0)}%` : 'sec off',
      `turn ${fmtTurn(r0.turnover_cap)}`,
    ].join(' · ');
    out.push({
      key, label, variant: r0.variant, strategy: r0.strategy,
      te: r0.te_target, sec: r0.sector_tol, to: r0.turnover_cap, rows: modelRows,
    });
  }
  const rank = (v: string | null) => (v === 'hard' ? 0 : v === 'base' ? 1 : 2);
  out.sort((a, b) =>
    rank(a.variant) - rank(b.variant) || b.rows.length - a.rows.length || (a.to ?? 9) - (b.to ?? 9));
  return out;
}

// Default config to land on: prefer hard + long-only + the most models, turnover near the universe's
// production pick (SP500 ~30%, R2500 ~60%).
export function defaultCompareConfig(configs: CompareConfig[], universe: string): string {
  if (!configs.length) return '';
  const target = universe === 'sp500' ? 0.3 : 0.6;
  const pref = configs.filter((c) => c.variant === 'hard' && c.strategy === 'long_only');
  const pool = pref.length ? pref : configs;
  const maxLen = Math.max(...pool.map((c) => c.rows.length));
  const top = pool.filter((c) => c.rows.length === maxLen);
  return top.reduce((a, b) =>
    Math.abs((b.to ?? 9) - target) < Math.abs((a.to ?? 9) - target) ? b : a).key;
}

// --------------------------------------------------------------- rolling series (from monthly active returns)
// active_return[i] = portfolio_net - benchmark for month i. Windows require a FULL window of non-nulls.
function fullWindow(a: (number | null)[], i: number, w: number): number[] | null {
  if (i < w - 1) return null;
  const s = a.slice(i - w + 1, i + 1).filter((v): v is number => v != null);
  return s.length === w ? s : null;
}

// Trailing-window annualized information ratio: mean(active)/std(active) * sqrt(12).
export function rollingIR(active: (number | null)[], w = 12): (number | null)[] {
  return active.map((_, i) => {
    const s = fullWindow(active, i, w);
    if (!s) return null;
    const m = s.reduce((x, y) => x + y, 0) / w;
    const sd = Math.sqrt(s.reduce((x, y) => x + (y - m) * (y - m), 0) / (w - 1));
    return sd > 1e-9 ? (m / sd) * Math.sqrt(12) : null;
  });
}

// Trailing-window batting average: share of months with active_return > 0.
export function rollingBatting(active: (number | null)[], w = 12): (number | null)[] {
  return active.map((_, i) => {
    const s = fullWindow(active, i, w);
    return s ? s.filter((v) => v > 0).length / w : null;
  });
}

// Trailing-window annualized excess (active) return, compounded.
export function rollingExcess(active: (number | null)[], w = 12): (number | null)[] {
  return active.map((_, i) => {
    const s = fullWindow(active, i, w);
    if (!s) return null;
    return s.reduce((prod, r) => prod * (1 + r), 1) ** (12 / w) - 1;
  });
}

// Trailing-window annualized tracking error (std of active return × √12).
export function rollingVol(active: (number | null)[], w = 12): (number | null)[] {
  return active.map((_, i) => {
    const s = fullWindow(active, i, w);
    if (!s) return null;
    const m = s.reduce((x, y) => x + y, 0) / w;
    return Math.sqrt(s.reduce((x, y) => x + (y - m) ** 2, 0) / (w - 1)) * Math.sqrt(12);
  });
}

// --------------------------------------------------------------- report-page analytics (monthly series)
export interface AnnualRow { year: number; active: number; portfolio: number; benchmark: number; }
export function buildAnnualTable(monthly: PortfolioMonthlyPoint[]): AnnualRow[] {
  const byYear = new Map<number, { p: number; b: number }>();
  for (const m of monthly) {
    const y = +m.date.slice(0, 4);
    const cur = byYear.get(y) ?? { p: 1, b: 1 };
    cur.p *= 1 + (m.portfolio_net ?? 0);
    cur.b *= 1 + (m.benchmark ?? 0);
    byYear.set(y, cur);
  }
  return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, v]) => ({
    year, portfolio: v.p - 1, benchmark: v.b - 1, active: (v.p - 1) - (v.b - 1),
  }));
}

export interface DrawdownRow { depth: number; peak: string; trough: string; recovery: string | null; }
export function buildDrawdownTable(monthly: PortfolioMonthlyPoint[], topN = 5): DrawdownRow[] {
  const pts = monthly.filter((m) => m.portfolio_net != null);
  let cum = 1, peak = 1, peakDate = pts[0]?.date ?? '', inDD = false, troughVal = 1, troughDate = '';
  const dds: DrawdownRow[] = [];
  for (const m of pts) {
    cum *= 1 + (m.portfolio_net ?? 0);
    if (cum >= peak) {
      if (inDD) { dds.push({ depth: troughVal / peak - 1, peak: peakDate, trough: troughDate, recovery: m.date }); inDD = false; }
      peak = cum; peakDate = m.date;
    } else {
      if (!inDD) { inDD = true; troughVal = cum; troughDate = m.date; }
      if (cum < troughVal) { troughVal = cum; troughDate = m.date; }
    }
  }
  if (inDD) dds.push({ depth: troughVal / peak - 1, peak: peakDate, trough: troughDate, recovery: null });
  return dds.sort((a, b) => a.depth - b.depth).slice(0, topN);
}

// up/down capture: avg portfolio return in up- (down-) benchmark months ÷ avg benchmark return there.
export function captureRatios(monthly: PortfolioMonthlyPoint[]): { up: number | null; down: number | null } {
  let upP = 0, upB = 0, dnP = 0, dnB = 0;
  for (const m of monthly) {
    const p = m.portfolio_net, b = m.benchmark;
    if (p == null || b == null) continue;
    if (b > 0) { upP += p; upB += b; } else if (b < 0) { dnP += p; dnB += b; }
  }
  return { up: upB !== 0 ? upP / upB : null, down: dnB !== 0 ? dnP / dnB : null };
}

export function activeStats(monthly: PortfolioMonthlyPoint[]): { best: number; worst: number; hit: number; n: number } | null {
  const a = monthly.map((m) => m.active_return).filter((v): v is number => v != null);
  if (!a.length) return null;
  return { best: Math.max(...a), worst: Math.min(...a), hit: a.filter((v) => v > 0).length / a.length, n: a.length };
}

// equal-width histogram bins (for the monthly active-return distribution).
export function histogram(vals: number[], nBins = 21): { x: number; count: number }[] {
  if (!vals.length) return [];
  const mn = Math.min(...vals), mx = Math.max(...vals), w = (mx - mn) / nBins || 1;
  const bins = Array.from({ length: nBins }, (_, i) => ({ x: mn + (i + 0.5) * w, count: 0 }));
  for (const v of vals) bins[Math.min(nBins - 1, Math.max(0, Math.floor((v - mn) / w)))].count++;
  return bins;
}
