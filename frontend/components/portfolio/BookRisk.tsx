'use client';

// WHAT THE BOOK WE HOLD IS DOING, BETWEEN REBALANCES — per mandate ([10-LEXPU]).
//
// ONE PANEL, TWO TENANTS (contract, 2026-08-13). Exposure says what the held book is BETTING ON;
// tracking error says HOW FAR IT WILL WANDER. Both are "what the book is doing between rebalances,
// per mandate, versus what we built", they share an as-of date, a mandate split and a coverage
// figure, and split across two surfaces a reader has to join them up themselves. So the block is
// laid out as three labelled rows — RISK · TILTS · BANDS — and the RISK row is rendered whether or
// not it has numbers. `[10-LTE]` fills `mandate.risk`; it does not design a surface, and this file
// does not build an exposure-only layout that a three-number risk line has to be wedged into.
//
// WHY THIS IS NOT THE PRE-TRADE PANEL (`components/trading/Exposures.tsx`). That one reads
// `portfolio.attribution` and describes the TARGET at freeze — one snapshot, and then nothing looks
// again until the next rebalance. This reads the book we actually own, measured nightly, so it
// moves with price drift, a monthly re-estimated `B` and unfilled orders. Same question, different
// book, and the constraint story only exists on this one: the bands are enforced ONCE, at
// construction, so between rebalances an excursion otherwise leaves no trace.
//
// PER-MANDATE IS NOT A PREFERENCE. The core is measured RELATIVE to the S&P 500 and the sleeve is
// market-neutral and measured ABSOLUTE, so their EXPOSURES cannot be blended into one row — a
// sector overweight against an index and one against nothing are not the same quantity.
//
// ⚠️ THAT ARGUMENT DOES NOT EXTEND TO TRACKING ERROR, and I originally thought it did (corrected
// 2026-08-15, user). Once the fund's benchmark is fixed as the S&P 500 — which it is — a
// market-neutral sleeve's whole volatility becomes active risk against that index, so the two
// mandates' risk DOES combine. Hence the fund line above the blocks: one number for the whole
// netted book, measured through the same Σ. Its "target" is IMPLIED by the components and labelled
// as such, because a blend runs no optimizer and nobody set it.

import useSWR from 'swr';
import {
  fetchPaperExposures,
  type BookExposureFactor, type BookExposureLeg, type BookExposureMandate, type BookRisk,
} from '@/lib/paper';
// ⚠️ THE UNIT COMES FROM THE ROW, NEVER FROM THE FACTOR NAME — and the formatting lives in ONE
// module, shared with the pre-trade panel. Two renderers of the same quantity is how one of them
// ends up printing 0.13σ as "13%", which is what the pre-trade panel did until 2026-08-13.
import {
  fmtExposure, fmtScale, UNIT_LABEL, unitForKind, type ExposureUnit,
} from '@/lib/exposureUnits';

/* ------------------------------------------------------------------------ formatting ---- */
// Headroom is a DIFFERENCE of two weights, so it is percentage POINTS. Calling it "%" beside an
// exposure also written "%" invites the reader to treat the gap as a relative one.
const ppts = (v: number | null | undefined, d = 2) =>
  v == null ? '—' : `${(v * 100).toFixed(d)}pp`;
const pct0 = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`);
const pct1 = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

const MANDATE_NAME: Record<string, string> = {
  core: 'LO core', sleeve: 'L/S sleeve',
};

/* ----------------------------------------------------------------------------- bars ---- */
// PER-GROUP SCALE, LABELLED. Styles run to ~0.15σ and sector weights to ~0.03; on one shared axis
// every sector bar became a sliver — the group you most need to scan is the one you could not read.
// Bars of equal length meaning different magnitudes is how a chart lies, so each group states the
// scale it was drawn on.
function niceMax(v: number): number {
  const m = Math.max(v, 0.005);
  const pow = Math.pow(10, Math.floor(Math.log10(m)));
  return Math.ceil(m / pow) * pow;
}

function Bar({ v, max, band, breach }: {
  v: number; max: number; band?: number | null; breach?: boolean | null;
}) {
  const w = Math.min(Math.abs(v) / max, 1) * 50;
  const pos = v >= 0;
  // THE BAND IS DRAWN, not just stated. "2bp of headroom" is a sentence you have to decode; a bar
  // nearly touching its limit is the same fact at a glance, which is the whole reason this series
  // is stored daily rather than checked once at construction.
  const bandPct = band != null ? Math.min(band / max, 1) * 50 : null;
  return (
    <div className="relative h-3 w-[120px] rounded-sm shrink-0" style={{ background: 'var(--bg)' }}>
      <div className="absolute top-0 bottom-0 left-1/2 w-px" style={{ background: 'var(--border-soft)' }} />
      {bandPct != null && (
        <>
          <div className="absolute top-0 bottom-0 w-px opacity-70"
            style={{ left: `calc(50% + ${bandPct}%)`, background: 'var(--tx-dim)' }} />
          <div className="absolute top-0 bottom-0 w-px opacity-70"
            style={{ left: `calc(50% - ${bandPct}%)`, background: 'var(--tx-dim)' }} />
        </>
      )}
      <div className="absolute top-0 bottom-0"
        style={{
          background: breach ? 'var(--neg)' : pos ? 'var(--pos)' : 'var(--neg)',
          opacity: breach ? 1 : 0.85,
          ...(pos ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }),
        }} />
    </div>
  );
}

function Group({ title, rows, showBand }: {
  title: string; rows: BookExposureFactor[]; showBand?: boolean;
}) {
  if (!rows.length) return null;
  const unit = rows[0].unit;
  const max = niceMax(Math.max(...rows.map((r) => Math.abs(r.exposure ?? 0))));
  return (
    <div className="min-w-[260px]">
      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--tx-dim)' }}>
        {title}
        {/* The unit sits in the group heading as well as on every value, because the group is
            what a reader scans and a bare column of numbers acquires whatever unit its neighbour
            has. */}
        <span className="ml-2 normal-case tracking-normal">
          {UNIT_LABEL[unit]} · scale ±{fmtScale(max, unit)}
        </span>
      </div>
      <ul className="space-y-0.5">
        {rows.map((f) => (
          <li key={f.factor} className="flex items-center gap-2 text-[11px]">
            <span className="w-[124px] shrink-0 truncate" title={f.factor}>
              {f.factor.replace(/^sec_/, '').replace(/_/g, ' ')}
            </span>
            <Bar v={f.exposure ?? 0} max={max} band={showBand ? f.band : null} breach={f.breach} />
            <span className="w-[58px] text-right tabular-nums"
              style={{ color: f.breach ? 'var(--neg)' : 'var(--tx)',
                       fontWeight: f.breach ? 700 : 400 }}>
              {fmtExposure(f.exposure, f.unit)}
            </span>
            {showBand && f.headroom != null && (
              <span className="w-[62px] text-right tabular-nums text-[10px]"
                style={{ color: f.headroom < 0 ? 'var(--neg)' : 'var(--tx-dim)' }}>
                {f.headroom < 0 ? 'over by ' : ''}{ppts(Math.abs(f.headroom))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------------- leg split ---- */
// THE NET IS A DIFFERENCE OF TWO BOOKS, and a small difference does not imply small books. The
// sleeve's size and resid_vol nets are near zero because BOTH legs sit in the same small, volatile
// corner of the R2500 — cancellation, not absence. Stacked on ONE axis sharing ONE zero, because
// side by side each leg has its own centre line and comparing them means comparing lengths from
// two different origins.
const AXIS_W = 190;
const BAR_H = 8;

function LegFill({ v, max, leg, edge }: {
  v: number; max: number; leg: 'long' | 'short'; edge: 'top' | 'bottom';
}) {
  const w = Math.min(Math.abs(v) / max, 1) * 50;
  const pos = v >= 0;
  return (
    <div className="absolute left-0 right-0 rounded-sm"
      style={{ [edge]: 0, height: BAR_H, background: 'var(--bg)' }}>
      <div className="absolute top-0 bottom-0"
        style={{
          background: leg === 'long' ? 'var(--teal)' : 'var(--amber)',
          ...(pos ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }),
        }} />
    </div>
  );
}

function LegGroup({ title, legs, net }: {
  title: string; legs: BookExposureLeg[]; net: Map<string, BookExposureFactor>;
}) {
  const by = new Map<string, { long?: number; short?: number; unit: ExposureUnit }>();
  for (const l of legs) {
    // The `benchmark` leg is stored so the decomposition can be re-checked without the risk model.
    // It is not a bet and is not drawn.
    if (l.leg === 'benchmark') continue;
    for (const f of l.factors) {
      const e = by.get(f.factor) ?? { unit: f.unit };
      e[l.leg as 'long' | 'short'] = f.exposure ?? 0;
      by.set(f.factor, e);
    }
  }
  const rows = [...by.entries()]
    .map(([factor, e]) => ({ factor, long: e.long ?? 0, short: e.short ?? 0, unit: e.unit }))
    // Ordered by the LARGER leg, not by the net: a factor whose legs disagree violently is exactly
    // what this view exists for, and ordering by the net would bury it.
    .sort((a, b) => Math.max(Math.abs(b.long), Math.abs(b.short))
                  - Math.max(Math.abs(a.long), Math.abs(a.short)));
  if (!rows.length) return null;
  // ONE scale across BOTH legs — per-leg scales would draw a +0.02 long and a −0.21 short the same
  // length, and the comparison would be a lie told in the axis.
  const max = niceMax(Math.max(...rows.flatMap((r) => [Math.abs(r.long), Math.abs(r.short)])));
  const h = BAR_H * 2 + 1;
  return (
    <div className="min-w-[400px]">
      <div className="text-[10px] uppercase tracking-wider mb-1.5 flex items-baseline gap-2"
        style={{ color: 'var(--tx-dim)' }}>
        <span className="w-[124px] shrink-0">{title}</span>
        <span className="flex items-center gap-1 normal-case tracking-normal">
          <i className="inline-block w-2 h-2 rounded-sm" style={{ background: 'var(--teal)' }} />
          <span style={{ color: 'var(--tx-mut)' }}>long</span>
          <i className="inline-block w-2 h-2 rounded-sm ml-1.5" style={{ background: 'var(--amber)' }} />
          <span style={{ color: 'var(--tx-mut)' }}>short of</span>
        </span>
        <span className="normal-case tracking-normal ml-auto">
          net · {UNIT_LABEL[rows[0].unit]} · scale ±{fmtScale(max, rows[0].unit)}
        </span>
      </div>
      {/* Proximity is doing real work: 1px inside a pair against 7px between factors, so 24 bars
          read as 12 objects. */}
      <ul className="space-y-[7px]">
        {rows.map((r) => (
          <li key={r.factor} className="flex items-center gap-2 text-[11px]">
            <span className="w-[124px] shrink-0 truncate" title={r.factor}>
              {r.factor.replace(/^sec_/, '').replace(/_/g, ' ')}
            </span>
            <div className="flex items-stretch gap-1 shrink-0">
              {/* Stacking replaces position-as-identifier with colour alone — the weaker cue, and
                  the one that fails under colour-vision deficiency. The L/S tick is redundant and
                  hue-independent. */}
              <div className="flex flex-col justify-between text-[8px] leading-none"
                style={{ height: h, color: 'var(--tx-dim)' }} aria-hidden>
                <span>L</span><span>S</span>
              </div>
              <div className="relative" style={{ width: AXIS_W, height: h }}>
                <LegFill v={r.long} max={max} leg="long" edge="top" />
                <LegFill v={r.short} max={max} leg="short" edge="bottom" />
                <div className="absolute inset-y-0 left-1/2 w-px opacity-50"
                  style={{ background: 'var(--tx-dim)' }} />
              </div>
            </div>
            <span className="w-[58px] text-right tabular-nums" style={{ color: 'var(--tx-mut)' }}>
              {fmtExposure(net.get(r.factor)?.exposure ?? null, r.unit)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------------- the three rows ---- */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2" style={{ borderTop: '1px solid var(--border-soft)' }}>
      <div className="w-[46px] shrink-0 text-[9px] font-bold tracking-[1.2px] pt-0.5"
        style={{ color: 'var(--tx-dim)' }}>
        {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ⚠️ RENDERED WHETHER OR NOT IT HAS NUMBERS. An absent row is indistinguishable from a row with
// nothing to report, which is how every silent degradation in this project survived (F-006 →
// F-008) — and the panel contract reserves this slot precisely so `[10-LTE]` adds a line rather
// than renegotiating a layout.
function RiskRow({ m }: { m: BookExposureMandate }) {
  if (!m.risk) {
    return (
      <Row label="RISK">
        <div className="text-[11px]" style={{ color: 'var(--tx-mut)' }}>
          Tracking error is not measured on the held book yet
          <span className="ml-1.5 font-mono text-[10.5px]" style={{ color: 'var(--teal)' }}>[10-LTE]</span>
          <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--tx-dim)' }}>
            Exposure says what the book is betting on; tracking error says how far it will wander.
            It will read <b>target · expected · realized</b> here, on this same as-of date — the
            risk model under-predicts by ~70% consistently, so the correction is baked into
            &ldquo;expected&rdquo; rather than published as a factor to multiply by.
          </div>
        </div>
      </Row>
    );
  }
  const r = m.risk;
  // The W4 dial is only worth showing where it is doing something. On the core it is 1.0 and
  // static, so "budget 3.0%" beside "target 3.0%" would be noise.
  const capped = r.cap_calibration != null && Math.abs(r.cap_calibration - 1) > 1e-9;
  return (
    <Row label="RISK">
      <div className="flex gap-x-7 gap-y-1 flex-wrap items-baseline text-[11.5px]"
        style={{ color: 'var(--tx)' }}>
        <span>
          <b>Target</b> {pct1(r.te_target)}
          {capped && (
            <span style={{ color: 'var(--tx-mut)' }}> · budget {pct1(r.te_budget)}</span>
          )}
        </span>
        <span>
          <b>Expected</b>{' '}
          <span style={{
            // Off-target by more than the estimate's own uncertainty is the finding this row
            // exists for; inside it, the difference is not distinguishable from noise.
            color: (r.te_expected != null && r.te_target != null
                    && Math.abs(r.te_expected - (capped ? r.te_budget ?? r.te_target : r.te_target))
                       > (r.te_expected_se ?? 0)) ? 'var(--amber)' : 'var(--tx)',
            fontWeight: 600,
          }}>
            {pct1(r.te_expected)}
          </span>
          {r.te_expected_se != null && (
            <span style={{ color: 'var(--tx-mut)' }}> ± {pct1(r.te_expected_se)}</span>
          )}
        </span>
        <span>
          <b>Realized</b>{' '}
          {r.publishable && r.te_realized != null ? (
            <>
              {pct1(r.te_realized)}
              {r.te_realized_rel_se != null && (
                <span style={{ color: 'var(--tx-mut)' }}>
                  {' '}± {(r.te_realized_rel_se * 100).toFixed(0)}% rel
                </span>
              )}
              <span style={{ color: 'var(--tx-dim)' }}> (N={r.n_obs})</span>
            </>
          ) : (
            // NOT a blank and NOT a zero. "Too short to quote" is a different state from "nothing
            // measured", and the second is what a missing row would imply.
            <span style={{ color: 'var(--tx-mut)' }}>
              insufficient history (N={r.n_obs})
            </span>
          )}
        </span>
      </div>
      <div className="text-[10.5px] mt-1" style={{ color: 'var(--tx-dim)' }}>
        <b>Expected</b> is what tonight&rsquo;s holdings should realize on the risk model{' '}
        <b>corrected for its known bias</b>
        {r.bias != null && <> (×{r.bias.toFixed(2)} on a predicted {pct1(r.pred_te)}</>}
        {r.bias != null && r.bias_source && !m.mandate.startsWith(r.bias_source.slice(0, 4))
          ? <>, measured on <span className="font-mono">{r.bias_source.slice(0, 28)}</span>)</>
          : r.bias != null ? <>)</> : null}
        . The model under-predicts consistently, so the correction is baked in rather than left as a
        factor to multiply by — and it carries its own ±20%, which is where Expected&rsquo;s error
        bar comes from. Realized is a <b>trailing</b> window: it is the audit, not the drift signal.
        {capped && (
          <> The <b>budget</b> is what the optimiser actually spent — the vol cap&rsquo;s dial sat
          at {r.cap_calibration?.toFixed(2)} — against a nominal target of {pct1(r.te_target)}.</>
        )}
      </div>
    </Row>
  );
}

function BandsRow({ m, historyDays, historyStart }: {
  m: BookExposureMandate; historyDays: number; historyStart: string | null;
}) {
  const current = m.breaches.filter((b) => b.current);
  const past = m.breaches.filter((b) => !b.current);
  const hardKind = m.band_kind === 'hard';
  return (
    <Row label="BANDS">
      {current.length === 0 ? (
        <div className="text-[11px]" style={{ color: 'var(--tx)' }}>
          Inside every band, on all {historyDays} measured day{historyDays === 1 ? '' : 's'}
          {historyStart && <> since {historyStart}</>}
          {past.length > 0 && (
            <span style={{ color: 'var(--tx-mut)' }}>
              {' '}— but {past.map((b) => `${b.factor.replace(/^sec_/, '')} (${b.breach_days}d)`).join(', ')}
              {' '}was outside earlier in the window
            </span>
          )}
          .
        </div>
      ) : (
        <div className="space-y-1">
          {current.map((b) => (
            <div key={b.factor} className="text-[11px]"
              style={{ color: b.band_kind === 'hard' ? 'var(--neg)' : 'var(--tx)' }}>
              <b>{b.band_kind === 'hard' ? '⚠ HARD' : 'soft'}</b>{' '}
              {b.factor.replace(/^sec_/, '').replace(/_/g, ' ')} at{' '}
              {fmtExposure(b.exposure, 'weight')} against ±{pct1(b.band)} — over by{' '}
              {ppts(Math.abs(b.headroom ?? 0))}, {b.run_days} measured day
              {b.run_days === 1 ? '' : 's'}{b.since && <> running (since {b.since})</>}.
              <div className="text-[10.5px]" style={{ color: 'var(--tx-dim)' }}>
                {b.band_kind === 'hard'
                  ? 'The optimiser could NOT have done this at construction — this is drift.'
                  : 'A soft band is a hinge penalty the optimiser may deliberately pay — context, not a fault.'}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="text-[10.5px] mt-1" style={{ color: 'var(--tx-dim)' }}>
        ±{pct1(m.band)} {hardKind ? 'HARD' : 'soft'} sector band, read from the LOCKED config the
        book was built from. Enforced <b>once, at construction</b> — between rebalances price drift,
        a monthly re-estimated <span className="font-mono">B</span> and unfilled orders move the
        exposure, which is what this row watches. Legs carry no band: each is re-normalised to its
        own gross, so a limit set on the net does not apply to it.
      </div>
    </Row>
  );
}

/* --------------------------------------------------------------------- the fund line ---- */
// ⚠️ "IMPLIED", NEVER "TARGET". The blend runs no optimizer, so 4.3% is what the two component
// targets imply once you fix the S&P 500 as the benchmark — core 1.0×3% combined in VARIANCE with
// sleeve 0.5×6% — not a limit anyone enforced. The word is the whole safeguard: put this number
// under a column headed "target" and within a month someone will treat it as a breach when it moves.
function FundLine({ r }: { r: BookRisk }) {
  const implied = r.target_source === 'implied';
  // Off the implied level by more than the estimate's own uncertainty is a finding; inside it, the
  // gap is not distinguishable from noise. Same rule as the per-mandate row.
  const off = r.te_expected != null && r.te_target != null
    && Math.abs(r.te_expected - r.te_target) > (r.te_expected_se ?? 0);
  return (
    <div className="mt-3 mb-1 p-3 rounded"
      style={{ background: 'var(--bg)', border: '1px solid var(--border-soft)' }}>
      <div className="flex items-baseline gap-x-7 gap-y-1 flex-wrap text-[11.5px]"
        style={{ color: 'var(--tx)' }}>
        <span className="text-[10px] font-bold tracking-[1.2px]" style={{ color: 'var(--tx-dim)' }}>
          WHOLE FUND
        </span>
        <span style={{ color: 'var(--tx-mut)' }}>vs S&amp;P 500</span>
        <span>
          <b>{implied ? 'Implied' : 'Target'}</b> {pct1(r.te_target)}
          {implied && <span style={{ color: 'var(--tx-dim)' }}> (not set)</span>}
        </span>
        <span>
          <b>Expected</b>{' '}
          <span style={{ color: off ? 'var(--amber)' : 'var(--tx)', fontWeight: 600 }}>
            {pct1(r.te_expected)}
          </span>
          {r.te_expected_se != null && (
            <span style={{ color: 'var(--tx-mut)' }}> ± {pct1(r.te_expected_se)}</span>
          )}
        </span>
        <span style={{ color: 'var(--tx-dim)' }}>{r.n_obs > 0 ? '' : 'realized: not yet'}</span>
      </div>
      <div className="text-[10.5px] mt-1" style={{ color: 'var(--tx-dim)' }}>
        The whole netted book against the index it is benchmarked to. <b>Expected is measured</b> —
        active weights through the same risk model — so it assumes nothing about how the two
        mandates interact. <b>Implied is derived</b>: the core&rsquo;s {' '}
        3.0% and the sleeve&rsquo;s 6.0% at half weight, combined in variance
        {implied && <>, which <b>no optimizer was given</b> — a blend runs none, so this is what the
        design implies rather than a limit anything enforces</>}. It assumes the two are
        uncorrelated, which is why it is the secondary number.
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- the panel ---- */
export function BookRisk({ strategy }: { strategy?: string }) {
  const { data } = useSWR(['paper-exposures', strategy],
    () => fetchPaperExposures('paper', strategy), { revalidateOnFocus: false });

  if (!data) return null;
  if (!data.mandates.length) {
    return (
      <div className="panel p-4 mb-3">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>
          Risk &amp; Exposure
        </h2>
        <div className="text-[11.5px] mt-1" style={{ color: 'var(--tx-mut)' }}>
          {data.note ?? 'no exposure has been measured yet'}
        </div>
      </div>
    );
  }
  const hist = data.history ?? { start: null, n_days: 0 };

  return (
    <div className="panel p-4 mb-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>
          Risk &amp; Exposure
        </h2>
        <span className="text-[11px]" style={{ color: 'var(--tx-mut)' }}>
          what the book we hold is betting on, between rebalances
        </span>
        <span className="ml-auto text-[10.5px] font-mono" style={{ color: 'var(--tx-dim)' }}>
          {data.date}
          {/* B IS PART OF THE READING. An exposure computed against a two-month-old matrix and
              presented as current describes a book nobody holds. */}
          {data.b_asof && ` · risk model B ${data.b_asof} (${data.b_age_days}d)`}
        </span>
      </div>

      {/* THE FUND FIRST, because it is the number an investor asks for and the one level above the
          mandate blocks. It is deliberately NOT a third mandate block: the fund has no sector band
          and no exposure bars of its own, and giving it one would imply constraints it does not
          have. */}
      {data.fund && <FundLine r={data.fund} />}

      {!!data.degradations.length && (
        <div className="mt-2 p-2 rounded" style={{ background: 'rgba(180,83,9,0.10)' }}>
          {data.degradations.map((d) => (
            <div key={d} className="text-[11px]" style={{ color: 'var(--amber)' }}>· {d}</div>
          ))}
        </div>
      )}

      {data.mandates.map((m) => {
        const net = new Map(m.factors.map((f) => [f.factor, f]));
        const market = m.factors.find((f) => f.kind === 'market');
        const legs = m.legs.filter((l) => l.leg !== 'benchmark');
        const long = m.legs.find((l) => l.leg === 'long');
        const short = m.legs.find((l) => l.leg === 'short');
        // ⚠️ Styles and sectors are NEVER merged into one magnitude-ranked list. Styles are order
        // 0.1 and sector weights order 0.02, so one combined list sorted by size is always all
        // styles — the industry half of the book simply never appears.
        const styles = m.factors.filter((f) => f.kind === 'style').slice(0, 8);
        const sectors = m.factors.filter((f) => f.kind === 'sector').slice(0, 8);

        return (
          <div key={m.mandate} className="mt-4">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-[12.5px] font-bold" style={{ color: 'var(--tx)' }}>
                {MANDATE_NAME[m.mandate] ?? m.mandate}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--tx-mut)' }}>
                {/* A dollar-neutral sleeve has NO benchmark rather than having cash as one —
                    calling it "vs cash" invites a relative reading of an outright bet. */}
                {m.benchmark ? `vs ${m.benchmark.toUpperCase()}` : 'absolute (market-neutral)'}
              </span>
              <span className="text-[10.5px] tabular-nums" style={{ color: 'var(--tx-dim)' }}>
                native gross {pct1(m.gross)} · {m.n_names} names · coverage{' '}
                <b style={{ color: (m.coverage_weight ?? 1) < 0.95 ? 'var(--amber)' : 'var(--tx-dim)' }}>
                  {pct0(m.coverage_weight)}
                </b>
                {market && <> · market {fmtExposure(market.exposure, 'beta')}</>}
              </span>
            </div>

            <RiskRow m={m} />

            <Row label="TILTS">
              {m.tightest && (
                <div className="text-[11.5px] mb-2" style={{ color: 'var(--tx)' }}>
                  Tightest band:{' '}
                  <b>{m.tightest.factor.replace(/^sec_/, '').replace(/_/g, ' ')}</b>{' '}
                  {fmtExposure(m.tightest.exposure, m.tightest.unit)} against ±{pct1(m.tightest.band)}{' '}
                  <span style={{ color: (m.tightest.headroom ?? 1) < 0 ? 'var(--neg)' : 'var(--tx-mut)' }}>
                    — {(m.tightest.headroom ?? 0) < 0 ? 'OVER by ' : ''}
                    {ppts(Math.abs(m.tightest.headroom ?? 0))}
                    {(m.tightest.headroom ?? 0) >= 0 ? ' of headroom' : ''}
                  </span>
                </div>
              )}
              {/* A long-only book's net IS its position against the benchmark, so the net view is
                  the whole truth for the core. Only a two-legged book gets the paired view — and
                  it gets it INSTEAD of the net bars, with the net carried as a number per row. */}
              {legs.length > 0 ? (
                <>
                  <div className="text-[10.5px] mb-1.5" style={{ color: 'var(--tx-dim)' }}>
                    legs: <span style={{ color: 'var(--teal)' }}>{pct1(long?.leg_gross)} / {long?.n_names} long</span>
                    {' · '}
                    <span style={{ color: 'var(--amber)' }}>{pct1(short?.leg_gross)} / {short?.n_names} short</span>
                    {' — each normalised to its own gross and measured against '}
                    {(long?.benchmark ?? 'the universe').toUpperCase()}
                  </div>
                  <div className="flex flex-wrap gap-x-8 gap-y-3">
                    <LegGroup title="Style"
                      legs={legs.map((l) => ({ ...l, factors: l.factors.filter((f) => f.kind === 'style') }))}
                      net={net} />
                    <LegGroup title="Sector"
                      legs={legs.map((l) => ({ ...l, factors: l.factors.filter((f) => f.kind === 'sector') }))}
                      net={net} />
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap gap-x-8 gap-y-3">
                  <Group title="Style" rows={styles} />
                  <Group title="Sector" rows={sectors} showBand />
                </div>
              )}
            </Row>

            <BandsRow m={m} historyDays={hist.n_days} historyStart={hist.start} />
          </div>
        );
      })}

      <div className="mt-3 pt-3 space-y-1" style={{ borderTop: '1px solid var(--border-soft)' }}>
        {/* THE UNIT SENTENCE IS PART OF THE DELIVERABLE. The two quantities on this panel are
            printed in different units and the difference is not visible in the factor names. */}
        <div className="text-[10.5px]" style={{ color: 'var(--tx-dim)' }}>
          <b>Reading the numbers:</b> a <b>sector</b> exposure is an active <b>weight</b> —
          &ldquo;we are 2.79% overweight Consumer Defensive&rdquo;, and the same quantity the
          optimizer bounds. A <b>style</b> exposure is in <b>standard deviations</b> of
          cross-sectional tilt, so <span className="font-mono">+0.13σ</span> is a modest lean, not
          13%. Both are on each mandate&rsquo;s <b>native</b> book — its own weights, not its
          contribution to the blend — because that is the basis the bands were written on.
        </div>
        {/* Short-side sign confusion is reliable enough to warrant the sentence every time. */}
        <div className="text-[10.5px]" style={{ color: 'var(--tx-dim)' }}>
          <b style={{ color: 'var(--amber)' }}>Reading the short leg:</b> it shows what we are
          <b> short of</b>, not the bet. A positive profitability bar means the names we are short
          are profitable — a bet <i>against</i> profitability. Both legs pointing the same way is a
          shared tilt the net cancels out and therefore hides.
        </div>
        <div className="text-[10.5px]" style={{ color: 'var(--tx-dim)' }}>
          Measured nightly beside the book build and stored, so an excursion between rebalances
          leaves a trace. Breach counts are in <b>measured days</b> over a{' '}
          {hist.n_days}-day series{hist.start && <> beginning {hist.start}</>} — &ldquo;none&rdquo;
          means none since we started looking. Nothing on this panel gates anything; a hard breach
          alerts a human. <span className="font-mono">[10-LEXP]</span>
        </div>
      </div>
    </div>
  );
}
