// The Exposures page's tables ([08-PMON]). The band is a column, and how close a number sits to it
// is for the reader to see, not for the page to say — so nothing is coloured by band distance.
//
// SHADING (owner, 2026-10-31, for readability): each bet cell is tinted by its SIGN and SIZE only —
// blue = positive, orange = negative, deeper = larger. It is a heat map, not a verdict: no green/red,
// no thresholds. The scale is per UNIT within one table (a 5% sector weight and a 0.25σ style tilt
// are not comparable), and Change gets its own scale because it is an order of magnitude smaller.
// The benchmark's own level and the band stay unshaded. The rules live in `lib/shading.tsx`.
//
// Units come from the ROW (`unit`), never from the factor name, and are formatted by the shared
// module — sector rows are weights, style rows are standard deviations of tilt, market is a beta.

import {
  fmtExposure, orderFactors, SECTOR_ORDER, type ExposureUnit,
} from '@/lib/exposureUnits';
import { change, type ExposureLeg, type ExposureRow } from '@/lib/portfolioMonitor';
import { scaleOf, tint } from '@/lib/shading';

export { ShadingKey } from '@/lib/shading';

const SECTOR_NAME = new Map(SECTOR_ORDER.map((s) => [s.id, s.name]));
const STYLE_NAME: Record<string, string> = {
  market: 'Market (β)',
  beta: 'Beta',
  size: 'Size',
  resid_vol: 'Residual volatility',
  momentum: 'Momentum',
  liquidity: 'Liquidity',
  value: 'Value',
  earnings_yield: 'Earnings yield',
  dividend_yield: 'Dividend yield',
  profitability: 'Profitability',
  earnings_qual: 'Earnings quality',
  leverage: 'Leverage',
  growth: 'Growth',
};

export const factorName = (f: string) =>
  SECTOR_NAME.get(f) ?? STYLE_NAME[f] ?? f.replace(/^sec_/, '').replace(/_/g, ' ');

/** The benchmark's own exposure is an absolute level, so it carries no '+'. */
function absolute(v: number | null | undefined, unit: ExposureUnit): string {
  return fmtExposure(v, unit).replace('+', '');
}

function band(r: ExposureRow): string {
  if (r.band == null) return '—';
  return `±${(r.band * 100).toFixed(1)}% ${r.band_kind ?? ''}`.trim();
}

/** Market first, then the fixed order shared with every other exposure panel. */
export function ordered(rows: ExposureRow[]): ExposureRow[] {
  const mk = rows.filter((r) => r.kind === 'market');
  return [...mk, ...orderFactors(rows.filter((r) => r.kind !== 'market'))];
}

export function ExposureTable({ title, rows, benchmarkLabel, valueLabel, showBand = false, footnote }: {
  title: string;
  rows: ExposureRow[];
  benchmarkLabel: string;
  valueLabel: string;
  showBand?: boolean;
  footnote?: string;
}) {
  const level = scaleOf(rows.flatMap((r) => [{ v: r.target, unit: r.unit }, { v: r.today, unit: r.unit }]));
  const delta = scaleOf(rows.map((r) => ({ v: r.change, unit: r.unit })));
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <h3 className="text-sm font-bold text-[var(--tx)]">{title}</h3>
        <span className="text-[11px] text-[var(--tx-dim)]">Target and Today are {valueLabel}</span>
      </div>
      <table className="dtable w-full text-xs tabular-nums">
        <thead>
          <tr>
            <th className="text-left">Factor</th>
            <th className="text-right" title="The benchmark's own exposure, at the month-end">
              Benchmark<span className="block font-normal text-[10px] text-[var(--tx-dim)]">{benchmarkLabel}</span>
            </th>
            <th className="text-right" title="The frozen live target, on today's risk-model data">Target</th>
            <th className="text-right">Today</th>
            <th className="text-right" title="Today − Target">Change</th>
            {showBand && <th className="text-right" title="The limit the book was built inside, from its LOCKED config">Band</th>}
          </tr>
        </thead>
        <tbody>
          {ordered(rows).map((r) => (
            <tr key={r.factor}>
              <td>{factorName(r.factor)}</td>
              <td className="text-right">{absolute(r.benchmark, r.unit)}</td>
              <td className="text-right" style={tint(r.target, r.unit, level)}>{fmtExposure(r.target, r.unit)}</td>
              <td className="text-right" style={tint(r.today, r.unit, level)}>{fmtExposure(r.today, r.unit)}</td>
              <td className="text-right" style={tint(r.change, r.unit, delta)}>{change(r.change, r.unit)}</td>
              {showBand && <td className="text-right">{band(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {footnote && <div className="text-[11px] text-[var(--tx-dim)] mt-1 leading-snug">{footnote}</div>}
    </div>
  );
}

export function LegTable({ legs }: { legs: ExposureLeg[] }) {
  const long = legs.find((l) => l.leg === 'long');
  const short = legs.find((l) => l.leg === 'short');
  if (!long || !short) return null;
  const byF = (l: ExposureLeg) => new Map(l.factors.map((f) => [f.factor, f]));
  const L = byF(long), S = byF(short);
  // Styles (market first), then sectors — never one merged order: the shared ranks restart at zero
  // for each group, so a single sort interleaves Beta with Energy.
  const rows = [...ordered(long.factors.filter((f) => f.kind !== 'sector')),
                ...ordered(long.factors.filter((f) => f.kind === 'sector'))];
  const level = scaleOf(rows.flatMap((r) => {
    const l = L.get(r.factor), s = S.get(r.factor);
    return [l?.target, l?.today, s?.target, s?.today].map((v) => ({ v, unit: r.unit }));
  }));
  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
        <h3 className="text-sm font-bold text-[var(--tx)]">Legs</h3>
        <span className="text-[11px] text-[var(--tx-dim)]">
          each leg on its own gross, against the Russell 2500 band · long {long.n_names} names (target{' '}
          {long.target_n_names ?? '—'}) · short {short.n_names} names (target {short.target_n_names ?? '—'})
        </span>
      </div>
      <table className="dtable w-full text-xs tabular-nums">
        <thead>
          <tr>
            <th className="text-left">Factor</th>
            <th className="text-right">Benchmark<span className="block font-normal text-[10px] text-[var(--tx-dim)]">R2500 band</span></th>
            <th className="text-right">Long · target</th>
            <th className="text-right">Long · today</th>
            <th className="text-right">Short of · target</th>
            <th className="text-right">Short of · today</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const l = L.get(r.factor), s = S.get(r.factor);
            return (
              <tr key={r.factor}>
                <td>{factorName(r.factor)}</td>
                <td className="text-right">{absolute(l?.benchmark, r.unit)}</td>
                <td className="text-right" style={tint(l?.target, r.unit, level)}>{fmtExposure(l?.target, r.unit)}</td>
                <td className="text-right" style={tint(l?.today, r.unit, level)}>{fmtExposure(l?.today, r.unit)}</td>
                <td className="text-right" style={tint(s?.target, r.unit, level)}>{fmtExposure(s?.target, r.unit)}</td>
                <td className="text-right" style={tint(s?.today, r.unit, level)}>{fmtExposure(s?.today, r.unit)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="text-[11px] text-[var(--tx-dim)] mt-1 leading-snug">
        Each leg is active against the Russell 2500 band and carries no band of its own. The short leg
        is the book of what we are <b>short of</b>: a positive reading there is a bet <b>against</b> that
        factor.
      </div>
    </div>
  );
}
