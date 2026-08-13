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
