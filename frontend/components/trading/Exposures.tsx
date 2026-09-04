'use client';

import { useEffect, useState } from 'react';
import { fetchExposures, type Exposures, type ExposureLeg } from '@/lib/trading';
import { ExposureDiffColumn, useBookDiff, WithDiff } from './BookDiff';
import {
  fmtExposureByKind, fmtScale, isLargeTilt, orderFactors, styleGroupOf, unitForKind, UNIT_LABEL,
  type ExposureKind,
} from '@/lib/exposureUnits';

// FIXED ORDER, NOT SORTED BY SIZE (owner's call, 2026-09-04). Rows keep their position month to
// month and match the diff column and the held-book panel row for row — see `STYLE_GROUPS` /
// `SECTOR_ORDER` in lib/exposureUnits. Magnitude is carried by the bold highlight, not the order.
// A style row that starts a new group (value/yield, quality/growth) gets a little air above it.
const groupGap = (factor: string, i: number, rows: { factor: string }[]) =>
  i > 0 && styleGroupOf(factor) >= 0 && styleGroupOf(factor) !== styleGroupOf(rows[i - 1].factor)
    ? 'mt-1.5' : '';

// WHAT THE BOOK IS BETTING ON, per sleeve, before you approve it.
//
// The pre-trade checks ask whether the book is SOUND. This asks what it is EXPOSED to — the error
// no per-name check can catch, because every single trade looks reasonable while forty of them
// together drift a sector to 8% active.
//
// Bars, not numbers in a table. The question is "is anything unusually large, and in which
// direction" — a shape question, answered faster by length than by reading two decimal places.
// PER-GROUP SCALE. Styles run to ~0.15σ and sector weights to ~2%, so one shared axis rendered
// every sector bar as a sliver — the group you most need to scan became the one you could not
// read. Each group is now scaled to its own largest exposure AND LABELLED with that scale, because
// bars of equal length meaning different magnitudes is exactly the way a chart lies.
//
// ⚠️ THE TWO GROUPS ARE IN DIFFERENT UNITS, and until 2026-08-13 this file printed both as a
// percentage — so a style tilt of 0.13σ rendered as "13.0%" on the screen a book is approved
// from, an ~8x overstatement (the comment above used to say styles "run to ~15%", which is how
// plausible it looked). Formatting now comes from `lib/exposureUnits`, shared with the held-book
// panel, because two renderers of the same quantity is how one of them ends up wrong.
function niceMax(v: number): number {
  const m = Math.max(v, 0.005);
  const pow = Math.pow(10, Math.floor(Math.log10(m)));
  return Math.ceil(m / pow) * pow;
}

function Bar({ v, max }: { v: number; max: number }) {
  const pct = Math.min(Math.abs(v) / max, 1) * 50;
  const pos = v >= 0;
  return (
    <div className="relative h-3 w-[120px] bg-[var(--bg)] rounded-sm shrink-0">
      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--border-soft)]" />
      <div className={`absolute top-0 bottom-0 ${pos ? 'bg-[var(--pos)]' : 'bg-[var(--neg)]'}`}
           style={pos ? { left: '50%', width: `${pct}%` }
                      : { right: '50%', width: `${pct}%` }} />
    </div>
  );
}

function Group({ title, rows, kind }: {
  title: string; rows: Exposures['sleeves'][0]['factors']; kind: ExposureKind;
}) {
  if (!rows.length) return null;
  const unit = unitForKind[kind];
  const ordered = orderFactors(rows);
  const max = niceMax(Math.max(...rows.map((r) => Math.abs(r.active_exposure))));
  return (
    <div className="min-w-[248px]">
      <div className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)] mb-1">
        {title}
        <span className="ml-2 normal-case tracking-normal text-[var(--tx-dim)]">
          {UNIT_LABEL[unit]} · scale ±{fmtScale(max, unit)}
        </span>
      </div>
      <ul className="space-y-0.5">
        {ordered.map((f, i) => (
          <li key={f.factor} className={`flex items-center gap-2 text-[11px] ${groupGap(f.factor, i, ordered)}`}>
            <span className="w-[104px] shrink-0 truncate" title={f.factor}>
              {f.factor.replace(/^sec_/, '')}
            </span>
            <Bar v={f.active_exposure} max={max} />
            <span className={`w-[58px] text-right tabular-nums ${
              isLargeTilt(f.active_exposure, unit) ? 'font-semibold' : 'text-[var(--tx-mut)]'}`}>
              {fmtExposureByKind(f.active_exposure, f.kind ?? kind)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// THE LONG AND SHORT SIDES, SEPARATELY ([10-EXPO]).
//
// The net is a DIFFERENCE of two books, and a small difference does not imply small books: a net
// of +7% earnings_yield here is +2% long against −21% short. Worse, the reverse — a net near zero
// on beta, size and volatility — reads as "no bet" while both legs sit in the same corner of the
// universe. For a sleeve that is de-grossing, that is the wrong thing to be blind to.
//
// PAIRED ROWS, THE TWO LEGS STACKED ON ONE SHARED AXIS. The question is "how does the short side
// differ from the long side", which is a comparison — and a comparison is only as good as the
// scale it is made on. Side by side in two tracks, each leg has its own centre line, so reading
// them against each other means comparing lengths from two different origins: the weakest of the
// available encodings. Stacked, they share ONE axis and ONE zero, one directly above the other,
// which is the strongest. It also makes the finding this panel exists for — both legs leaning the
// SAME way behind a near-zero net — a single glance rather than a reconstruction.
//
// Freeing the second track buys the axis its width back (208px, was 104), which is what makes the
// group's shared scale survivable: `size` at −47% sets it, and at half this width every other
// factor was a sliver. Same honest scale, twice the resolution.
const AXIS_W = 208;   // px
const BAR_H = 8;      // px — thin on purpose: a pair must read as one object, not two rows

function LegFill({ v, max, leg, edge }: {
  v: number; max: number; leg: 'long' | 'short'; edge: 'top-0' | 'bottom-0';
}) {
  const pct = Math.min(Math.abs(v) / max, 1) * 50;
  const pos = v >= 0;
  return (
    <div className={`absolute ${edge} left-0 right-0 bg-[var(--bg)] rounded-sm`}
         style={{ height: BAR_H }}>
      <div className={`absolute top-0 bottom-0 ${leg === 'long' ? 'bg-[var(--teal)]' : 'bg-[var(--amber)]'}`}
           style={pos ? { left: '50%', width: `${pct}%` }
                      : { right: '50%', width: `${pct}%` }} />
    </div>
  );
}

// ⚠️ STACKING COSTS THE ONE CUE SIDE-BY-SIDE GAVE FOR FREE: which bar is which leg was POSITION,
// and is now colour alone. Colour alone is the weaker cue and the one that fails under colour-vision
// deficiency, so each bar carries an L/S tick as a redundant, hue-independent label.
function LegPair({ long, short, max }: { long: number; short: number; max: number }) {
  const h = BAR_H * 2 + 1;                        // 1px between the pair — see the ul's row gap
  return (
    <div className="flex items-stretch gap-1 shrink-0">
      <div className="flex flex-col justify-between text-[8px] leading-none text-[var(--tx-dim)]"
           style={{ height: h }} aria-hidden>
        <span>L</span><span>S</span>
      </div>
      <div className="relative" style={{ width: AXIS_W, height: h }}>
        <LegFill v={long} max={max} leg="long" edge="top-0" />
        <LegFill v={short} max={max} leg="short" edge="bottom-0" />
        {/* ONE continuous zero line spanning both bars — drawn last so it reads over the fills.
            It is the shared origin, and it should look like one axis rather than two. */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--tx-dim)] opacity-50" />
      </div>
    </div>
  );
}

function LegGroup({ title, legs, net, kind }: {
  title: string; legs: ExposureLeg[]; net: Map<string, number>; kind: ExposureKind;
}) {
  const unit = unitForKind[kind];
  const byFactor = new Map<string, { long?: number; short?: number }>();
  for (const l of legs) {
    if (l.leg === 'benchmark') continue;          // stored for the reconciliation, not for reading
    const e = byFactor.get(l.factor) ?? {};
    e[l.leg] = l.active_exposure;
    byFactor.set(l.factor, e);
  }
  // Fixed order (2026-09-04) — it used to sort by the larger leg so a violent disagreement rose to
  // the top; that now has to be seen by scanning, which the paired bars make cheap, and in exchange
  // every row sits where it sat last month and where it sits in the diff column.
  const rows = orderFactors([...byFactor.entries()]
    .map(([factor, e]) => ({ factor, long: e.long ?? 0, short: e.short ?? 0 })));
  if (!rows.length) return null;
  // ONE scale across BOTH legs. Per-leg scales would render a +2% long bar and a −21% short bar
  // the same length — the comparison would be a lie told in the axis.
  const max = niceMax(Math.max(...rows.flatMap((r) => [Math.abs(r.long), Math.abs(r.short)])));
  return (
    <div className="min-w-[380px]">
      {/* Stacking leaves one column, so the per-leg COLUMN HEADINGS have nowhere to sit and become
          a legend. `L`/`S` on the bars carry the identification; this carries the meaning. */}
      <div className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)] mb-1.5 flex items-baseline gap-2">
        <span className="w-[104px] shrink-0">{title}</span>
        <span className="flex items-center gap-1 normal-case tracking-normal">
          <i className="inline-block w-2 h-2 rounded-sm bg-[var(--teal)]" />
          <span className="text-[var(--tx-mut)]">long</span>
          <i className="inline-block w-2 h-2 rounded-sm bg-[var(--amber)] ml-1.5" />
          <span className="text-[var(--tx-mut)]">short of</span>
        </span>
        <span className="normal-case tracking-normal ml-auto">
          net · {UNIT_LABEL[unit]} · scale ±{fmtScale(max, unit)}
        </span>
      </div>
      {/* PROXIMITY IS DOING REAL WORK HERE: 1px inside a pair (in LegPair) against 7px between
          factors, so 24 bars read as 12 objects. Loosen this and the grouping collapses. */}
      <ul className="space-y-[7px]">
        {rows.map((r, i) => (
          <li key={r.factor} className={`flex items-center gap-2 text-[11px] ${groupGap(r.factor, i, rows)}`}>
            <span className="w-[104px] shrink-0 truncate" title={r.factor}>
              {r.factor.replace(/^sec_/, '')}
            </span>
            <LegPair long={r.long} short={r.short} max={max} />
            <span className="w-[56px] text-right tabular-nums text-[var(--tx-mut)]">
              {fmtExposureByKind(net.get(r.factor) ?? 0, kind)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SLEEVE_NAME: Record<string, string> = {
  core: 'LO core — S&P 500', sleeve: 'L/S sleeve — R2500',
};

export function ExposuresSection({ env, id }: { env: string; id: number }) {
  const [d, setD] = useState<Exposures | null>(null);
  // WHAT CHANGES — the right-hand column (BookDiff.tsx): factor deltas against the last frozen
  // book, in the same units and formatted by the same helper as the bars on the left.
  const diff = useBookDiff(env, id);

  useEffect(() => { fetchExposures(env, id).then(setD).catch(() => {}); }, [env, id]);
  if (!d || !d.sleeves.length) return null;

  return (
    <div className="panel p-4">
      <h2 className="text-sm font-semibold">
        Exposures
        <span className="ml-2 text-[11px] font-normal text-[var(--tx-mut)]">
          what this book is betting on, per sleeve
        </span>
        <span className="ml-3 text-[11px] font-normal text-[var(--tx-dim)]">
          · and what moved vs the last frozen book
        </span>
      </h2>
      <WithDiff right={diff ? <ExposureDiffColumn d={diff} /> : null} left={<>

      {d.sleeves.map((s) => {
        const legs = s.legs ?? [];
        const net = new Map(s.factors.map((f) => [f.factor, f.active_exposure]));
        const gross = (leg: 'long' | 'short') => legs.find((l) => l.leg === leg);
        const gl = gross('long'); const gs = gross('short');
        return (
          <div key={s.label} className="mt-3">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-[12px] font-semibold">{SLEEVE_NAME[s.sleeve] ?? s.sleeve}</span>
              {/* THE SCALE THE LEGS WERE DIVIDED BY. Each leg is normalised to its own gross so it
                  answers "what KIND of stock", which loses "how much" — so how much is stated here
                  rather than discarded. On a de-grossing book it is half the story. */}
              {gl && gs && (
                <span className="text-[10px] text-[var(--tx-mut)] tabular-nums">
                  gross <span className="text-[var(--teal)]">{((gl.leg_gross ?? 0) * 100).toFixed(1)}%
                  / {gl.n_names} long</span>
                  {' · '}
                  <span className="text-[var(--amber)]">{((gs.leg_gross ?? 0) * 100).toFixed(1)}%
                  / {gs.n_names} short</span>
                </span>
              )}
              {/* STALENESS IS PART OF THE READING. Attribution is a local job and can lag the
                  signal date; an exposure shown as current when it describes last quarter's book
                  would be worse than showing none. */}
              {s.as_of ? (
                <span className={`text-[10px] ${s.is_current
                  ? 'text-[var(--tx-dim)]' : 'text-[var(--amber)]'}`}>
                  as of {String(s.as_of)}
                  {!s.is_current && ` — NOT the ${d.signal_date} book; attribution has not been `
                    + 'computed for this month yet'}
                </span>
              ) : (
                <span className="text-[10px] text-[var(--amber)]">
                  no attribution computed for this book yet
                </span>
              )}
            </div>

            {/* A long-only book's net IS its position against the benchmark, so the net view is
                the whole truth for the core and nothing is gained by splitting it. Only a book
                with two legs gets the paired view — and it gets it INSTEAD of the net bars, not in
                addition, since the net is carried as a number in each row. */}
            {legs.length > 0 ? (
              <div className="flex flex-wrap gap-x-8 gap-y-3 mt-2">
                <LegGroup title="Style" kind="style"
                  legs={legs.filter((l) => l.kind === 'style')} net={net} />
                <LegGroup title="Sector" kind="sector"
                  legs={legs.filter((l) => l.kind === 'sector')} net={net} />
              </div>
            ) : s.factors.length > 0 && (
              <div className="flex flex-wrap gap-x-8 gap-y-3 mt-2">
                <Group title="Style" kind="style"
                  rows={s.factors.filter((f) => f.kind === 'style')} />
                <Group title="Sector" kind="sector"
                  rows={s.factors.filter((f) => f.kind === 'sector')} />
              </div>
            )}
          </div>
        );
      })}

      <div className="mt-3 space-y-1">
        <div className="text-[10px] text-[var(--tx-dim)]">
          <b>LO core</b> is measured against a cap-weighted S&amp;P 500 built from our own universe
          and market caps (not the published index). <b>L/S sleeve</b> is shown as its two legs:
          each is normalised to its own gross (stated above) and measured against the cap-weighted
          R2500, with the outright <b>net</b> — longs minus shorts, what the risk model constrains —
          in the last column. The two legs are stacked on <b>one axis sharing one zero</b>, so their
          lengths are directly comparable and two bars running the same way is a shared tilt. Style
          and sector are drawn on their own scales, shown above each group.
        </div>
        {/* The two groups are in different units and nothing in the factor names says so. */}
        <div className="text-[10px] text-[var(--tx-dim)]">
          <b>Units differ by group:</b> a <b>sector</b> reading is an active <b>weight</b> — the
          same quantity the optimizer bounds with its sector band. A <b>style</b> reading is in
          <b> standard deviations</b> of cross-sectional tilt, so <b>+0.13σ</b> is a modest lean,
          not 13%.
        </div>
        {/* THE SIGN WARNING IS PART OF THE DELIVERABLE, NOT DECORATION. The short leg stores a
            HOLDING (|w|, a positive book of what you are short of), because that is the convention
            under which the two legs reconcile to the net and sit on a comparable scale. Read as a
            preference it says the opposite of what it means, and short-side sign confusion is
            reliable enough to warrant the sentence every time. */}
        <div className="text-[10px] text-[var(--tx-dim)]">
          <b className="text-[var(--amber)]">Reading the short leg:</b> it shows what you are
          <b> short of</b>, not the bet. A positive profitability bar means the names you are short
          are profitable — which is a bet <i>against</i> profitability. Both legs pointing the same
          way is a shared tilt the net cancels out and therefore hides.
        </div>
        <div className="text-[10px] text-[var(--tx-dim)]">
          Return attribution is retrospective and lives in Portfolios: it needs the following
          month&apos;s factor returns, so it cannot exist for a book you have not traded.
        </div>
      </div>
      </>} />
    </div>
  );
}
