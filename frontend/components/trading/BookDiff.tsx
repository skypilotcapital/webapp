'use client';

import { useEffect, useState } from 'react';
import { fetchBookDiff, type BookDiff, type DiffFactor } from '@/lib/trading';
import {
  fmtExposureByKind, fmtScale, orderFactors, styleGroupOf, unitForKind, UNIT_LABEL,
  type ExposureKind,
} from '@/lib/exposureUnits';

// WHAT CHANGES IF I APPROVE THIS — the right-hand column of the Gross exposure and Exposures
// panels ([10-GEXP] / §3.9, extended 2026-09-04).
//
// The left half of each panel describes the book as it IS. The decision a reviewer is making is
// about what the trade CHANGES, and a change is a difference against something. Owner's call: the
// comparator is the LAST FROZEN book of the same strategy — the book that was approved and traded
// last month — not the drifted holdings and never the modeled Track A book.
//
// THREE RULES, all from the week this was built:
//   1. The comparator is NAMED with its date in the column header. "Last month" is three different
//      books; the reader must not have to guess which.
//   2. Absence is said out loud. When last month's exposures were never computed, the column says
//      so — an empty diff reads as "no change", which is the one thing it must never imply.
//   3. Vintage guard. When the two books were frozen from different component labels, no delta is
//      drawn; the API says why.
//
// Numbers as last → now → Δ, so the level survives beside the change; bars for the factor deltas,
// because "what moved, and which way" is a shape question. Deltas are in the SAME units as the
// panel to the left (sectors in active weight, styles in σ), formatted by the same helper.

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

export function DiffHeader({ d }: { d: BookDiff }) {
  if (!d.comparator) {
    return (
      <div className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)] mb-2">
        vs last frozen book
        <span className="ml-2 normal-case tracking-normal text-[var(--amber)]">
          {d.note ?? 'none exists for this strategy'}
        </span>
      </div>
    );
  }
  const c = d.comparator;
  return (
    <div className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)] mb-2">
      vs last frozen book
      <span className="ml-2 normal-case tracking-normal">
        rebalance #{c.rebalance_id} · {c.signal_date} · {c.status}
      </span>
      <span className="ml-2 normal-case tracking-normal">→ this book · {d.signal_date}</span>
    </div>
  );
}

function Tri({ label, prev, now, fmt, emphasis, good }: {
  label: string; prev: number | null | undefined; now: number | null | undefined;
  fmt: (v: number) => string; emphasis?: boolean;
  /** which sign of Δ reads as the "up" colour; undefined = neutral (most rows: a change is a fact, not a verdict) */
  good?: 'up' | 'down';
}) {
  const delta = prev != null && now != null ? now - prev : null;
  const cls = delta == null || Math.abs(delta) < 1e-9 || !good ? 'text-[var(--tx-mut)]'
    : (delta > 0) === (good === 'up') ? 'text-[var(--pos)]' : 'text-[var(--neg)]';
  return (
    <li className={`grid grid-cols-[110px_64px_64px_72px] items-baseline gap-2 text-[11px] ${
      emphasis ? 'font-semibold' : ''}`}>
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
    <li className="grid grid-cols-[110px_64px_64px_72px] gap-2 text-[9px] uppercase tracking-wider text-[var(--tx-dim)]">
      <span /><span className="text-right">last</span><span className="text-right">now</span>
      <span className="text-right">Δ</span>
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// GROSS EXPOSURE — the size, per book and per mandate, and the cost of getting there.
// ---------------------------------------------------------------------------------------------
export function GrossDiffColumn({ d }: { d: BookDiff }) {
  if (!d.comparator || !d.books) return <DiffHeader d={d} />;
  const b = d.books;
  const mandates: Array<['composite' | 'core' | 'sleeve', string]> = [
    ['composite', 'Whole book'], ['core', 'LO core'], ['sleeve', 'L/S sleeve'],
  ];
  const p0 = (v: number) => pct(v, 0);
  const x2 = (v: number) => `${num(v, 2)}×`;
  const n0 = (v: number) => `${Math.round(v)}`;
  return (
    <div>
      <DiffHeader d={d} />
      {mandates.map(([m, name]) => {
        const bk = b[m];
        if (!bk?.now && !bk?.prev) return null;
        const t = bk.turnover;
        const isLS = m === 'sleeve';
        return (
          <div key={m} className={m === 'composite' ? '' : 'mt-3 pt-2 border-t border-[var(--border-soft)]'}>
            <div className="text-[12px] font-semibold">{name}</div>
            <ul className="mt-1 space-y-0.5">
              <ColHead />
              <Tri label="gross" prev={bk.prev?.gross} now={bk.now?.gross} fmt={x2} emphasis={m !== 'core'} />
              <Tri label="long" prev={bk.prev?.long_gross} now={bk.now?.long_gross} fmt={p0} />
              {(m !== 'core') && (
                <Tri label="short" prev={bk.prev?.short_gross} now={bk.now?.short_gross} fmt={p0} />
              )}
              {m === 'composite' && (
                <Tri label="net" prev={bk.prev?.net} now={bk.now?.net} fmt={p0} />
              )}
              <Tri label="names" prev={bk.prev?.n} now={bk.now?.n} fmt={n0} />
              {isLS && (
                <Tri label="short names" prev={bk.prev?.n_short} now={bk.now?.n_short} fmt={n0} />
              )}
            </ul>
            {/* THE COST OF GETTING THERE — the one thing the left-hand chain cannot show. One-way
                turnover is Σ|Δw|/2 of NAV across the two frozen books, i.e. what the trade list
                would have to move if last month's book were still held exactly. */}
            {t && (
              <div className="mt-1 text-[10px] text-[var(--tx-dim)] tabular-nums">
                to get there: {t.entered} in · {t.exited} out · {t.n_traded} names change ·{' '}
                one-way turnover <b className="text-[var(--tx-mut)]">{pct(t.one_way, 1)}</b> of NAV
              </div>
            )}
          </div>
        );
      })}

      {/* Per component book: the RISK CHAIN at both dates, so a change in size has a cause on the
          same screen. The budget line is the one that explains most gross moves (the W4 cap). */}
      {d.sleeves?.map((s) => {
        const r = s.risk;
        if (!r || (!r.now && !r.prev)) return null;
        const isLS = s.sleeve === 'sleeve';
        return (
          <div key={s.label} className="mt-3 pt-2 border-t border-[var(--border-soft)]">
            <div className="text-[11px] font-semibold text-[var(--tx-mut)]">
              {isLS ? 'L/S sleeve — risk chain' : 'LO core — risk chain'}
              {!(r.now_is_current && r.prev_is_current) && (
                <span className="ml-2 font-normal text-[var(--amber)]">
                  {!r.prev && 'no diagnostics for last month\'s book'}
                  {r.prev && !r.prev_is_current && `last = as of ${r.prev.date}`}
                  {r.now && !r.now_is_current && ` · now = as of ${r.now.date}`}
                </span>
              )}
            </div>
            <ul className="mt-1 space-y-0.5">
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
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// EXPOSURES — the factor deltas per book, and the sector net weights of the whole book.
// ---------------------------------------------------------------------------------------------
function niceMax(v: number): number {
  const m = Math.max(v, 0.005);
  const pow = Math.pow(10, Math.floor(Math.log10(m)));
  return Math.ceil(m / pow) * pow;
}

function DeltaBar({ v, max }: { v: number; max: number }) {
  const w = Math.min(Math.abs(v) / max, 1) * 50;
  const pos = v >= 0;
  return (
    <div className="relative h-2.5 w-[100px] bg-[var(--bg)] rounded-sm shrink-0">
      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--border-soft)]" />
      <div className={`absolute top-0 bottom-0 ${pos ? 'bg-[var(--pos)]' : 'bg-[var(--neg)]'}`}
           style={pos ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} />
    </div>
  );
}

// FIXED ORDER, every row (owner's call, 2026-09-04): the same sequence as the bars on the left, so
// the two halves read row for row — see STYLE_GROUPS / SECTOR_ORDER in lib/exposureUnits. The
// delta bars carry the magnitude; a style row that starts a new group gets a little air above.
const groupGap = (factor: string, i: number, rows: { factor: string }[]) =>
  i > 0 && styleGroupOf(factor) >= 0 && styleGroupOf(factor) !== styleGroupOf(rows[i - 1].factor)
    ? 'mt-1.5' : '';

function DeltaGroup({ title, rows, kind }: {
  title: string; rows: DiffFactor[]; kind: ExposureKind;
}) {
  if (!rows.length) return null;
  const unit = unitForKind[kind];
  const shown = orderFactors(rows);
  const max = niceMax(Math.max(...shown.map((r) => Math.abs(r.delta))));
  const f = (v: number) => fmtExposureByKind(v, kind);
  return (
    <div className="min-w-[300px]">
      <div className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)] mb-1">
        {title} · Δ
        <span className="ml-2 normal-case tracking-normal">
          {UNIT_LABEL[unit]} · scale ±{fmtScale(max, unit)}
        </span>
      </div>
      <ul className="space-y-0.5">
        <li className="grid grid-cols-[92px_100px_52px_52px_58px] gap-2 text-[9px] uppercase tracking-wider text-[var(--tx-dim)]">
          <span /><span /><span className="text-right">last</span><span className="text-right">now</span>
          <span className="text-right">Δ</span>
        </li>
        {shown.map((r, i) => (
          <li key={r.factor} className={`grid grid-cols-[92px_100px_52px_52px_58px] items-center gap-2 text-[11px] ${groupGap(r.factor, i, shown)}`}>
            <span className="truncate" title={r.factor}>{r.factor.replace(/^sec_/, '')}</span>
            <DeltaBar v={r.delta} max={max} />
            <span className="text-right tabular-nums text-[var(--tx-dim)]">{f(r.prev)}</span>
            <span className="text-right tabular-nums">{f(r.now)}</span>
            <span className={`text-right tabular-nums ${Math.abs(r.delta) >= max * 0.5 ? 'font-semibold' : 'text-[var(--tx-mut)]'}`}>
              {sgn(r.delta, f)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExposureDiffColumn({ d }: { d: BookDiff }) {
  if (!d.comparator) return <DiffHeader d={d} />;
  if (!d.comparator.comparable) {
    return (
      <div>
        <DiffHeader d={d} />
        <div className="text-[11px] text-[var(--amber)]">{d.comparator.note}</div>
      </div>
    );
  }
  const secRows: DiffFactor[] = (d.sectors ?? []).map((s) => ({
    factor: s.sector, kind: 'sector', now: s.now, prev: s.prev, delta: s.delta,
  }));
  return (
    <div>
      <DiffHeader d={d} />
      {d.sleeves?.map((s) => {
        const e = s.exposures;
        const isLS = s.sleeve === 'sleeve';
        return (
          <div key={s.label} className="mt-2 first:mt-0">
            <div className="text-[12px] font-semibold flex items-baseline gap-2 flex-wrap">
              {isLS ? 'L/S sleeve — R2500' : 'LO core — S&P 500'}
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
              <div className="mt-1">
                <DeltaGroup title="Style" kind="style" rows={e.factors.filter((f) => f.kind === 'style')} />
                <div className="mt-2">
                  <DeltaGroup title="Sector (net, vs benchmark)" kind="sector"
                              rows={e.factors.filter((f) => f.kind === 'sector')} />
                </div>
              </div>
            )}
          </div>
        );
      })}
      {/* The whole book's sector NET WEIGHT — not an active exposure, the raw weight of the frozen
          composite by sector, from the frozen rows. Different quantity from the per-sleeve bars
          above (those are vs each sleeve's benchmark); it answers "where did the dollars move". */}
      {secRows.length > 0 && (
        <div className="mt-3 pt-2 border-t border-[var(--border-soft)]">
          <DeltaGroup title="Whole book · sector net weight" kind="sector" rows={secRows} />
        </div>
      )}
    </div>
  );
}

/** Two-column frame: the existing panel body on the left, a thin rule, the diff on the right.
 *  Stacks on narrow screens. */
export function WithDiff({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_1px_minmax(320px,0.75fr)] gap-x-5 gap-y-4">
      <div className="min-w-0">{left}</div>
      <div className="hidden xl:block bg-[var(--border-soft)]" />
      <div className="min-w-0 xl:pl-1">{right}</div>
    </div>
  );
}
