// SHADING — one set of rules for every Portfolio Monitor table that tints a number (owner, 2026-10-31).
//
// A cell is tinted by its SIGN and SIZE only: blue = positive, orange = negative, deeper = larger. It is
// a heat map, never a verdict — no green/red on a bet, no thresholds, and nothing is coloured by drift or
// by distance to a band (the 2026-10-12 "no flags" rule stands; portfolio_monitor_IA.md decision table).
//
// The scale is per UNIT (a 5% sector weight and a 0.25σ style tilt are not comparable) and is the largest
// |value| among the cells the caller passes in, never below SCALE_FLOOR — so a group of near-zero numbers
// stays pale instead of stretching −0.000 to the deepest shade. A floor on the scale, not a threshold:
// nothing switches on or off at it.

import type { ExposureUnit } from '@/lib/exposureUnits';

export const TINT_MAX = 34; // % opacity of the deepest cell

const SCALE_FLOOR: Record<ExposureUnit, number> = { weight: 0.01, sigma: 0.10, beta: 0.05, raw: 0 };

/** Largest |value| per unit over the given cells — the top of that unit's shading scale. */
export function scaleOf(cells: { v: number | null | undefined; unit: ExposureUnit }[]): Map<ExposureUnit, number> {
  const m = new Map<ExposureUnit, number>(Object.entries(SCALE_FLOOR) as [ExposureUnit, number][]);
  for (const { v, unit } of cells) {
    if (v == null || Number.isNaN(v)) continue;
    m.set(unit, Math.max(m.get(unit) ?? 0, Math.abs(v)));
  }
  return m;
}

/** Background tint for one cell: hue from the sign, depth from |v| / the unit's scale. */
export function tint(v: number | null | undefined, unit: ExposureUnit, scale: Map<ExposureUnit, number>) {
  const top = scale.get(unit);
  if (v == null || Number.isNaN(v) || !top || unit === 'raw') return undefined;
  const pctOpacity = Math.round(TINT_MAX * Math.min(1, Math.abs(v) / top));
  if (pctOpacity < 2) return undefined;
  const hue = v >= 0 ? 'var(--cyan)' : 'var(--amber)';
  return { backgroundColor: `color-mix(in srgb, ${hue} ${pctOpacity}%, transparent)` };
}

export function ShadingKey({ scope = 'scaled within each table (Change on its own scale)' }: { scope?: string }) {
  const sw = (hue: string) => (
    <span className="inline-block w-3 h-3 rounded-sm align-[-2px] mr-1"
      style={{ backgroundColor: `color-mix(in srgb, ${hue} ${TINT_MAX}%, transparent)` }} />
  );
  return (
    <span className="text-[11px] text-[var(--tx-dim)]">
      {sw('var(--cyan)')}positive {sw('var(--amber)')}negative · deeper = larger, {scope}
    </span>
  );
}
