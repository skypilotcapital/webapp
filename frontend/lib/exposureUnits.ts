// HOW AN EXPOSURE IS WRITTEN DOWN — one definition, because there was briefly more than one.
//
// `Bᵀ(w − b)` produces numbers in two different units and the difference is invisible in the
// factor name:
//
//   * SECTOR columns of `B` are 0/1 dummies, so their exposure is an active WEIGHT — literally
//     "we are 2.79% overweight Consumer Defensive", and the same quantity `optimize.py` bounds
//     with `sector_tol`. That is what makes a band check a direct comparison rather than an
//     approximation of one.
//   * STYLE columns are cross-sectionally standardised, so theirs are in STANDARD DEVIATIONS of
//     tilt. `+0.13σ` is a modest lean.
//   * MARKET is a beta difference — dimensionless, and neither of the above.
//
// ⚠️ WHY THIS FILE EXISTS. The pre-trade panel printed every exposure as a percentage, so a
// profitability tilt of 0.13σ rendered as "13.0%" on the screen a human approves a book from —
// an ~8x overstatement that reads perfectly plausibly, and whose own source comment described
// styles as "running to ~15%". It was found on 2026-08-13 while building the held-book panel
// ([10-LEXPU]), which the task notes had explicitly warned to get right. Two renderers formatting
// the same quantity is how one of them ends up wrong, so both now import from here.
//
// Conventions: `live_book_exposure.md` §6.3, `risk_model_build.md` §12–13.

export type ExposureKind = 'sector' | 'style' | 'market';
export type ExposureUnit = 'weight' | 'sigma' | 'beta' | 'raw';

export const unitForKind: Record<ExposureKind, ExposureUnit> = {
  sector: 'weight', style: 'sigma', market: 'beta',
};

/** What the group heading says the column is measured in. */
export const UNIT_LABEL: Record<ExposureUnit, string> = {
  weight: 'active weight',
  sigma: 'standard deviations of tilt',
  beta: 'beta, active',
  raw: '',
};

/** A minus sign (U+2212), not a hyphen — it aligns in tabular-nums and reads as arithmetic. */
export function fmtExposure(v: number | null | undefined, unit: ExposureUnit, d?: number): string {
  if (v == null || Number.isNaN(v)) return '—';
  const s = v >= 0 ? '+' : '−';
  const a = Math.abs(v);
  if (unit === 'sigma') return `${s}${a.toFixed(d ?? 2)}σ`;
  if (unit === 'beta') return `${s}${a.toFixed(d ?? 3)}`;
  return `${s}${(a * 100).toFixed(d ?? 2)}%`;
}

export const fmtExposureByKind = (v: number | null | undefined, kind: ExposureKind, d?: number) =>
  fmtExposure(v, unitForKind[kind] ?? 'raw', d);

/** Unlabelled magnitude, for an axis-scale caption where the sign would be noise. */
export const fmtScale = (v: number, unit: ExposureUnit) =>
  fmtExposure(v, unit).replace('+', '');

// ⚠️ "BIG" IS PER-UNIT TOO. A single 0.05 threshold across both units calls a 5% sector bet
// notable (right) and a 0.05σ style lean notable (wrong — nearly every row would qualify, and a
// highlight that fires on everything highlights nothing).
const LARGE: Record<ExposureUnit, number> = { weight: 0.05, sigma: 0.25, beta: 0.05, raw: Infinity };

export const isLargeTilt = (v: number | null | undefined, unit: ExposureUnit) =>
  v != null && Math.abs(v) > LARGE[unit];

// ---------------------------------------------------------------------------------------------
// ONE FIXED ORDER FOR EVERY PANEL THAT DRAWS THESE BARS (owner's call, 2026-09-04).
//
// Until now each panel sorted its rows by magnitude. That answers "what is the biggest tilt right
// now" — once — and breaks everything else: a reader compares by POSITION, so rows that reorder
// each month read as changes when only a neighbour moved, and a diff column cannot share rows with
// a sorted left-hand side at all. Magnitude is still signalled (bold on a large tilt); the order
// no longer carries it.
//
// STYLES: the vendor convention (Barra USE4 / MSCI GEMLT / Axioma all do a version of it) runs from
// how the stock TRADES to what you OWN. Three groups, in this sequence:
//   risk / technical   beta · size · resid_vol · momentum · liquidity
//   value / yield      value · earnings_yield · dividend_yield
//   quality / growth   profitability · earnings_qual · leverage · growth
//
// SECTORS: GICS code order — the sequence S&P, MSCI and Bloomberg factsheets print — mapped onto
// our Morningstar names one-to-one. Not benchmark-weight order, which reshuffles as the index does.
// ---------------------------------------------------------------------------------------------
export const STYLE_GROUPS: { title: string; factors: string[] }[] = [
  { title: 'risk / technical', factors: ['beta', 'size', 'resid_vol', 'momentum', 'liquidity'] },
  { title: 'value / yield', factors: ['value', 'earnings_yield', 'dividend_yield'] },
  { title: 'quality / growth', factors: ['profitability', 'earnings_qual', 'leverage', 'growth'] },
];
export const STYLE_ORDER: string[] = STYLE_GROUPS.flatMap((g) => g.factors);

/** GICS order; each entry is the Morningstar name and the `sec_` factor id it appears under. */
export const SECTOR_ORDER: { name: string; id: string }[] = [
  { name: 'Energy', id: 'sec_energy' },
  { name: 'Basic Materials', id: 'sec_basic_materials' },
  { name: 'Industrials', id: 'sec_industrials' },
  { name: 'Consumer Cyclical', id: 'sec_consumer_cyclical' },
  { name: 'Consumer Defensive', id: 'sec_consumer_defensive' },
  { name: 'Healthcare', id: 'sec_healthcare' },
  { name: 'Financial Services', id: 'sec_financial_services' },
  { name: 'Technology', id: 'sec_technology' },
  { name: 'Communication Services', id: 'sec_communication_services' },
  { name: 'Utilities', id: 'sec_utilities' },
  { name: 'Real Estate', id: 'sec_real_estate' },
];

const RANK = new Map<string, number>();
STYLE_ORDER.forEach((f, i) => RANK.set(f, i));
SECTOR_ORDER.forEach((s, i) => { RANK.set(s.id, i); RANK.set(s.name, i); });

/** Position of a factor in the fixed order; unknown factors sort last, alphabetically. */
export const factorRank = (factor: string): number => RANK.get(factor) ?? 1_000;

/** Stable fixed-order sort. Works on any row shape carrying `factor`. */
export function orderFactors<T extends { factor: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    (factorRank(a.factor) - factorRank(b.factor)) || a.factor.localeCompare(b.factor));
}

/** Index of the style group a factor belongs to (−1 for a non-style), for drawing the group rule. */
export const styleGroupOf = (factor: string): number =>
  STYLE_GROUPS.findIndex((g) => g.factors.includes(factor));
