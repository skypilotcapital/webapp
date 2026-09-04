'use client';

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { fetchBookDiff, type BookDiff, type DiffFactor } from '@/lib/trading';
import {
  fmtExposureByKind, fmtScale, orderFactors, styleGroupOf, unitForKind, UNIT_LABEL,
  type ExposureKind,
} from '@/lib/exposureUnits';

// WHAT CHANGES IF I APPROVE THIS — the comparison columns of the Gross exposure and Exposures
// panels ([10-GEXP] / §3.9, extended 2026-09-04).
//
// The left column of each panel describes the PROPOSED book as it is. The decision a reviewer is
// making is about what the trade CHANGES, and a change is a difference against something. Owner's
// call: the comparator is the LAST FROZEN book of the same strategy — the book approved and traded
// last month — not the drifted holdings and never the modeled Track A book.
//
// LAYOUT (owner, 2026-09-04): three columns. Proposed on the left; on the right ONE tinted block,
// headed by the comparator's name and date, holding one column per mandate (LO core, L/S sleeve)
// and a footer for whole-book quantities that belong to neither. The tint and the single header
// are what say "this half is one comparison", so a reader does not take the three columns for
// three books.
//
// THREE RULES, all from the week this was built:
//   1. The comparator is NAMED with its date. "Last month" is three different books.
//   2. Absence is said out loud. When last month's exposures were never computed, the column says
//      so — an empty diff reads as "no change", which is the one thing it must never imply.
//   3. Vintage guard. When the two books were frozen from different component labels, no delta is
//      drawn; the API says why.
//
// Rows are in the SAME FIXED ORDER as the bars on the left (lib/exposureUnits), so the halves read
// row for row. Numbers as last → now → Δ; bars for the deltas.

const pct = (v: number | null | undefined, d = 1) =>
  v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`;
const num = (v: number | null | undefined, d = 3) =>
  v == null || !isFinite(v) ? '—' : v.toFixed(d);
const sgn = (v: number, f: (x: number) => string) => (v > 0 ? '+' : '') + f(v);

export function useBookDiff(env: string, id: number) {
  const [d, setD] = useState<BookDiff | null>(null);
  useEffect(() => { fetchBookDiff(env, id).then(setD).catch(() => {}); }, [env, id]);
  return d;
}

// ---------------------------------------------------------------------------------------------
// FRAME — proposed | vs-last-frozen (LO core · L/S sleeve · whole-book footer)
// ---------------------------------------------------------------------------------------------
function Eyebrow({ tone, children }: { tone: 'proposed' | 'last'; children: ReactNode }) {
  const color = tone === 'proposed' ? 'var(--teal)' : 'var(--amber)';
  return (
    <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold mb-2 px-1.5 py-0.5 rounded"
         style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
      {children}
    </div>
  );
}

/** The three-column frame. `left` is the panel's own body (the proposed book); `core` / `sleeve`
 *  are the per-mandate comparison columns; `foot` spans both for whole-book rows. Stacks below xl. */
export function ProposedVsLast({ d, left, core, sleeve, foot }: {
  d: BookDiff | null; left: ReactNode; core?: ReactNode; sleeve?: ReactNode; foot?: ReactNode;
}) {
  const cmp = d?.comparator;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.15fr)] gap-x-5 gap-y-4 mt-2">
      <div className="min-w-0">
        {d && <Eyebrow tone="proposed">Proposed · rebalance #{d.rebalance_id} · {d.signal_date}</Eyebrow>}
        {left}
      </div>
      <div className="min-w-0 rounded-md px-3 pt-2 pb-3 border-l-2"
           style={{ background: 'color-mix(in srgb, var(--amber) 4%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--amber) 45%, transparent)' }}>
        {!d ? (
          <Eyebrow tone="last">vs last frozen book · loading…</Eyebrow>
        ) : !cmp ? (
          <Eyebrow tone="last">vs last frozen book · {d.note ?? 'none exists for this strategy'}</Eyebrow>
        ) : (
          <Eyebrow tone="last">
            vs last frozen book · rebalance #{cmp.rebalance_id} · {cmp.signal_date} · {cmp.status}
          </Eyebrow>
        )}
        {cmp && !cmp.comparable && (
          <div className="text-[11px] text-[var(--amber)] mb-2">{cmp.note}</div>
        )}
        {cmp?.comparable && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-5 gap-y-3">
            <div className="min-w-0">{core}</div>
            <div className="min-w-0">{sleeve}</div>
            {foot && (
              <div className="min-w-0 lg:col-span-2 pt-2 border-t border-[var(--border-soft)]">{foot}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// last → now → Δ rows
// ---------------------------------------------------------------------------------------------
const COLS = 'grid-cols-[minmax(84px,1fr)_60px_60px_66px]';

function Tri({ label, prev, now, fmt, emphasis, good }: {
  label: string; prev: number | null | undefined; now: number | null | undefined;
  fmt: (v: number) => string; emphasis?: boolean;
  /** which sign of Δ reads as the "up" colour; undefined = neutral (a change is a fact, not a verdict) */
  good?: 'up' | 'down';
}) {
  const delta = prev != null && now != null ? now - prev : null;
  const cls = delta == null || Math.abs(delta) < 1e-9 || !good ? 'text-[var(--tx-mut)]'
    : (delta > 0) === (good === 'up') ? 'text-[var(--pos)]' : 'text-[var(--neg)]';
  return (
    <li className={`grid ${COLS} items-baseline gap-2 text-[11px] ${emphasis ? 'font-semibold' : ''}`}>
      <span className="text-[var(--tx-mut)] truncate">{label}</span>
      <span className="text-right tabular-nums text-[var(--tx-dim)]">{prev == null ? '—' : fmt(prev)}</span>
      <span className="text-right tabular-nums">{now == null ? '—' : fmt(now)}</span>
      <span className={`text-right tabular-nums ${cls}`}>
        {delta == null ? '—' : sgn(delta, fmt)}
      </span>
    </li>
  );
}

function ColHead() {
  return (
    <li className={`grid ${COLS} gap-2 text-[9px] uppercase tracking-wider text-[var(--tx-dim)]`}>
      <span /><span className="text-right">last</span><span className="text-right">now</span>
      <span className="text-right">Δ</span>
    </li>
  );
}

const SLEEVE_TITLE: Record<string, string> = { core: 'LO core — S&P 500', sleeve: 'L/S sleeve — R2500' };

// ---------------------------------------------------------------------------------------------
// GROSS EXPOSURE — per mandate: size rows + the risk chain at both dates; footer: whole book.
// ---------------------------------------------------------------------------------------------
export function GrossDiffSleeve({ d, sleeve }: { d: BookDiff; sleeve: 'core' | 'sleeve' }) {
  const bk = d.books?.[sleeve];
  const s = d.sleeves?.find((x) => x.sleeve === sleeve);
  const r = s?.risk;
  const isLS = sleeve === 'sleeve';
  const p0 = (v: number) => pct(v, 0);
  const x2 = (v: number) => `${num(v, 2)}×`;
  const n0 = (v: number) => `${Math.round(v)}`;
  if (!bk && !r) return null;
  return (
    <div>
      <div className="text-[12px] font-semibold">{SLEEVE_TITLE[sleeve]}</div>
      {bk && (bk.now || bk.prev) && (
        <>
          <ul className="mt-1 space-y-0.5">
            <ColHead />
            <Tri label="gross" prev={bk.prev?.gross} now={bk.now?.gross} fmt={x2} emphasis={isLS} />
            <Tri label="long" prev={bk.prev?.long_gross} now={bk.now?.long_gross} fmt={p0} />
            {isLS && <Tri label="short" prev={bk.prev?.short_gross} now={bk.now?.short_gross} fmt={p0} />}
            <Tri label="names" prev={bk.prev?.n} now={bk.now?.n} fmt={n0} />
            {isLS && <Tri label="short names" prev={bk.prev?.n_short} now={bk.now?.n_short} fmt={n0} />}
          </ul>
          {/* THE COST OF GETTING THERE — the one thing the left-hand chain cannot show. One-way
              turnover is Σ|Δw|/2 of NAV between the two frozen books. */}
          {bk.turnover && (
            <div className="mt-1 text-[10px] text-[var(--tx-dim)] tabular-nums">
              to get there: {bk.turnover.entered} in · {bk.turnover.exited} out ·{' '}
              one-way turnover <b className="text-[var(--tx-mut)]">{pct(bk.turnover.one_way, 1)}</b> of NAV
            </div>
          )}
        </>
      )}
      {r && (r.now || r.prev) && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)]">
            risk chain
            {!(r.now_is_current && r.prev_is_current) && (
              <span className="ml-2 normal-case tracking-normal text-[var(--amber)]">
                {!r.prev && 'no diagnostics for last month\'s book'}
                {r.prev && !r.prev_is_current && `last = as of ${r.prev.date}`}
                {r.now && !r.now_is_current && ` · now = as of ${r.now.date}`}
              </span>
            )}
          </div>
          <ul className="mt-0.5 space-y-0.5">
            <ColHead />
            {isLS && <Tri label="cap" prev={r.prev?.cap_calibration} now={r.now?.cap_calibration} fmt={(v) => num(v, 3)} />}
            <Tri label={isLS ? 'vol budget' : 'TE budget'} prev={r.prev?.vol_budget} now={r.now?.vol_budget} fmt={(v) => pct(v, 2)} />
            <Tri label="risk spent" prev={r.prev?.pred_vol} now={r.now?.pred_vol} fmt={(v) => pct(v, 2)} />
            {isLS && <Tri label="σ per gross" prev={r.prev?.sigma_eff} now={r.now?.sigma_eff} fmt={(v) => pct(v, 2)} />}
            {isLS
              ? <Tri label="gross" prev={r.prev?.gross} now={r.now?.gross} fmt={x2} emphasis />
              : <Tri label="active share" prev={r.prev?.active_share} now={r.now?.active_share} fmt={(v) => pct(v, 1)} emphasis />}
            <Tri label="names" prev={r.prev?.n_names} now={r.now?.n_names} fmt={n0} />
            <Tri label="at the floor" prev={r.prev?.n_at_floor} now={r.now?.n_at_floor} fmt={n0} />
          </ul>
        </div>
      )}
    </div>
  );
}

export function GrossDiffFoot({ d }: { d: BookDiff }) {
  const bk = d.books?.composite;
  if (!bk || (!bk.now && !bk.prev)) return null;
  const p0 = (v: number) => pct(v, 0);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-5 items-start">
      <div>
        <div className="text-[12px] font-semibold">Whole book</div>
        <ul className="mt-1 space-y-0.5">
          <ColHead />
          <Tri label="gross" prev={bk.prev?.gross} now={bk.now?.gross} fmt={(v) => `${num(v, 2)}×`} emphasis />
          <Tri label="long" prev={bk.prev?.long_gross} now={bk.now?.long_gross} fmt={p0} />
          <Tri label="short" prev={bk.prev?.short_gross} now={bk.now?.short_gross} fmt={p0} />
          <Tri label="net" prev={bk.prev?.net} now={bk.now?.net} fmt={p0} />
          <Tri label="names" prev={bk.prev?.n} now={bk.now?.n} fmt={(v) => `${Math.round(v)}`} />
        </ul>
      </div>
      {bk.turnover && (
        <div className="text-[10px] text-[var(--tx-dim)] tabular-nums lg:pt-5">
          <b className="text-[var(--tx-mut)]">To get there:</b> {bk.turnover.entered} names in ·{' '}
          {bk.turnover.exited} out · {bk.turnover.n_traded} change ·{' '}
          one-way turnover <b className="text-[var(--tx-mut)]">{pct(bk.turnover.one_way, 1)}</b> of NAV
          (Σ|Δw|/2 between the two frozen books — what the trade list moves if last month&apos;s
          book were still held exactly; drift and the dust filter make the real list differ a little).
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// EXPOSURES — per mandate: factor deltas; footer: the whole book's sector net weights.
// ---------------------------------------------------------------------------------------------
function niceMax(v: number): number {
  const m = Math.max(v, 0.005);
  const pow = Math.pow(10, Math.floor(Math.log10(m)));
  return Math.ceil(m / pow) * pow;
}

const BAR_W = 84;

function DeltaBar({ v, max }: { v: number; max: number }) {
  const w = Math.min(Math.abs(v) / max, 1) * 50;
  const pos = v >= 0;
  return (
    <div className="relative h-2.5 bg-[var(--bg)] rounded-sm shrink-0" style={{ width: BAR_W }}>
      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--border-soft)]" />
      <div className={`absolute top-0 bottom-0 ${pos ? 'bg-[var(--pos)]' : 'bg-[var(--neg)]'}`}
           style={pos ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} />
    </div>
  );
}

/** A faint dashed rule where a style group starts (the three groups in lib/exposureUnits). */
export function GroupRule({ factor, i, rows }: { factor: string; i: number; rows: { factor: string }[] }) {
  if (!(i > 0 && styleGroupOf(factor) >= 0 && styleGroupOf(factor) !== styleGroupOf(rows[i - 1].factor))) return null;
  return <li aria-hidden className="border-t border-dashed border-[var(--border-soft)] my-1" />;
}

// ⚠️ INLINE STYLE, NOT A COMPOSED TAILWIND CLASS. The first version built
// `grid-cols-[minmax(76px,1fr)_${BAR_W}px_…]` from a template string; Tailwind generates only the
// class strings it can read verbatim in the source, so that one never existed and every row
// stacked vertically on the live page (2026-09-04). A computed template belongs in `style`.
const DGRID = { display: 'grid', gridTemplateColumns: `minmax(76px,1fr) ${BAR_W}px 50px 50px 56px` } as const;

// The formatter already carries the sign (and a true minus); a zero delta reads as a plain 0.
const fmtDelta = (v: number, kind: ExposureKind) =>
  Math.abs(v) < 5e-5 ? fmtExposureByKind(0, kind).replace(/^[+−]/, '') : fmtExposureByKind(v, kind);

function DeltaGroup({ title, rows, kind }: { title: string; rows: DiffFactor[]; kind: ExposureKind }) {
  if (!rows.length) return null;
  const unit = unitForKind[kind];
  const shown = orderFactors(rows);
  const max = niceMax(Math.max(...shown.map((r) => Math.abs(r.delta))));
  const f = (v: number) => fmtExposureByKind(v, kind);
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)] mb-1">
        {title} · Δ
        <span className="ml-2 normal-case tracking-normal">
          {UNIT_LABEL[unit]} · scale ±{fmtScale(max, unit)}
        </span>
      </div>
      <ul className="space-y-0.5">
        <li style={DGRID} className="gap-2 text-[9px] uppercase tracking-wider text-[var(--tx-dim)]">
          <span /><span /><span className="text-right">last</span><span className="text-right">now</span>
          <span className="text-right">Δ</span>
        </li>
        {shown.map((r, i) => (
          <Fragment key={r.factor}>
            <GroupRule factor={r.factor} i={i} rows={shown} />
            <li style={DGRID} className="items-center gap-2 text-[11px]">
              <span className="truncate" title={r.factor}>{r.factor.replace(/^sec_/, '').replace(/_/g, ' ')}</span>
              <DeltaBar v={r.delta} max={max} />
              <span className="text-right tabular-nums text-[var(--tx-dim)]">{f(r.prev)}</span>
              <span className="text-right tabular-nums">{f(r.now)}</span>
              <span className={`text-right tabular-nums ${Math.abs(r.delta) >= max * 0.5 ? 'font-semibold' : 'text-[var(--tx-mut)]'}`}>
                {fmtDelta(r.delta, kind)}
              </span>
            </li>
          </Fragment>
        ))}
      </ul>
    </div>
  );
}

export function ExposureDiffSleeve({ d, sleeve }: { d: BookDiff; sleeve: 'core' | 'sleeve' }) {
  const s = d.sleeves?.find((x) => x.sleeve === sleeve);
  if (!s) return null;
  const e = s.exposures;
  const isLS = sleeve === 'sleeve';
  return (
    <div>
      <div className="text-[12px] font-semibold flex items-baseline gap-2 flex-wrap">
        {SLEEVE_TITLE[sleeve]}
        {e ? (
          <span className="text-[10px] font-normal text-[var(--tx-dim)] tabular-nums">
            predicted {isLS ? 'vol' : 'TE'} {pct(e.pred_vol_prev, 2)} → {pct(e.pred_vol_now, 2)}
            {e.specific_share_now != null && e.specific_share_prev != null &&
              ` · specific ${pct(e.specific_share_prev, 0)} → ${pct(e.specific_share_now, 0)}`}
            {!(e.now_is_current && e.prev_is_current) && (
              <span className="text-[var(--amber)]">
                {' '}· as of {String(e.prev_as_of)} → {String(e.now_as_of)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-[10px] font-normal text-[var(--amber)]">
            {s.exposures_note ?? 'exposures not computed for one of the two books'}
          </span>
        )}
      </div>
      {e && (
        <div className="mt-1 space-y-2">
          <DeltaGroup title="Style" kind="style" rows={e.factors.filter((f) => f.kind === 'style')} />
          <DeltaGroup title="Sector (net, vs benchmark)" kind="sector"
                      rows={e.factors.filter((f) => f.kind === 'sector')} />
        </div>
      )}
    </div>
  );
}

/** The whole book's sector NET WEIGHT — the raw weight of the frozen composite by sector, not an
 *  active exposure. A different quantity from the per-sleeve bars (those are vs each sleeve's
 *  benchmark); it answers "where did the dollars move". */
export function ExposureDiffFoot({ d }: { d: BookDiff }) {
  const rows: DiffFactor[] = (d.sectors ?? []).map((s) => ({
    factor: s.sector, kind: 'sector', now: s.now, prev: s.prev, delta: s.delta,
  }));
  if (!rows.length) return null;
  return (
    <div className="lg:w-1/2 lg:pr-2.5">
      <DeltaGroup title="Whole book · sector net weight" kind="sector" rows={rows} />
    </div>
  );
}
