'use client';

import { useEffect, useState } from 'react';
import { fetchExposures, type Exposures, type ExposureLeg } from '@/lib/trading';

// WHAT THE BOOK IS BETTING ON, per sleeve, before you approve it.
//
// The pre-trade checks ask whether the book is SOUND. This asks what it is EXPOSED to — the error
// no per-name check can catch, because every single trade looks reasonable while forty of them
// together drift a sector to 8% active.
//
// Bars, not numbers in a table. The question is "is anything unusually large, and in which
// direction" — a shape question, answered faster by length than by reading two decimal places.
// PER-GROUP SCALE. Styles run to ~15% and sectors to ~2%, so one shared axis rendered every sector
// bar as a sliver — the group you most need to scan became the one you could not read. Each group
// is now scaled to its own largest exposure AND LABELLED with that scale, because bars of equal
// length meaning different magnitudes is exactly the way a chart lies.
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

function Group({ title, rows }: { title: string; rows: Exposures['sleeves'][0]['factors'] }) {
  if (!rows.length) return null;
  const max = niceMax(Math.max(...rows.map((r) => Math.abs(r.active_exposure))));
  return (
    <div className="min-w-[248px]">
      <div className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)] mb-1">
        {title}
        <span className="ml-2 normal-case tracking-normal text-[var(--tx-dim)]">
          scale ±{(max * 100).toFixed(max < 0.02 ? 1 : 0)}%
        </span>
      </div>
      <ul className="space-y-0.5">
        {rows.map((f) => (
          <li key={f.factor} className="flex items-center gap-2 text-[11px]">
            <span className="w-[104px] shrink-0 truncate" title={f.factor}>
              {f.factor.replace(/^sec_/, '')}
            </span>
            <Bar v={f.active_exposure} max={max} />
            <span className={`w-[52px] text-right tabular-nums ${
              Math.abs(f.active_exposure) > 0.05 ? 'font-semibold' : 'text-[var(--tx-mut)]'}`}>
              {(f.active_exposure * 100).toFixed(1)}%
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
// PAIRED ROWS ON A SHARED SCALE, not two stacked lists. The question is "how does the short side
// differ from the long side", which is a comparison; putting the legs in separate blocks with
// separate orderings and separate axes makes the one question the panel exists to answer the one
// it cannot answer. Colour distinguishes the LEG; position about the centre line still carries the
// sign, as in the net view above.
function LegBar({ v, max, leg }: { v: number; max: number; leg: 'long' | 'short' }) {
  const pct = Math.min(Math.abs(v) / max, 1) * 50;
  const pos = v >= 0;
  return (
    <div className="relative h-3 w-[104px] bg-[var(--bg)] rounded-sm shrink-0">
      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--border-soft)]" />
      <div className={`absolute top-0 bottom-0 ${leg === 'long' ? 'bg-[var(--teal)]' : 'bg-[var(--amber)]'}`}
           style={pos ? { left: '50%', width: `${pct}%` }
                      : { right: '50%', width: `${pct}%` }} />
    </div>
  );
}

function LegGroup({ title, legs, net }: {
  title: string; legs: ExposureLeg[]; net: Map<string, number>;
}) {
  const byFactor = new Map<string, { long?: number; short?: number }>();
  for (const l of legs) {
    if (l.leg === 'benchmark') continue;          // stored for the reconciliation, not for reading
    const e = byFactor.get(l.factor) ?? {};
    e[l.leg] = l.active_exposure;
    byFactor.set(l.factor, e);
  }
  const rows = [...byFactor.entries()]
    .map(([factor, e]) => ({ factor, long: e.long ?? 0, short: e.short ?? 0 }))
    // Ordered by the LARGER leg, not by the net — a factor where the legs disagree violently is
    // exactly what this view is for, and ordering by the net would bury it.
    .sort((a, b) => Math.max(Math.abs(b.long), Math.abs(b.short))
                  - Math.max(Math.abs(a.long), Math.abs(a.short)));
  if (!rows.length) return null;
  // ONE scale across BOTH legs. Per-leg scales would render a +2% long bar and a −21% short bar
  // the same length — the comparison would be a lie told in the axis.
  const max = niceMax(Math.max(...rows.flatMap((r) => [Math.abs(r.long), Math.abs(r.short)])));
  return (
    <div className="min-w-[420px]">
      <div className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)] mb-1 flex gap-2">
        <span className="w-[104px] shrink-0">{title}</span>
        <span className="w-[104px] shrink-0 text-[var(--teal)]">long</span>
        <span className="w-[104px] shrink-0 text-[var(--amber)]">short of</span>
        <span className="normal-case tracking-normal">net · scale ±{(max * 100).toFixed(max < 0.02 ? 1 : 0)}%</span>
      </div>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.factor} className="flex items-center gap-2 text-[11px]">
            <span className="w-[104px] shrink-0 truncate" title={r.factor}>
              {r.factor.replace(/^sec_/, '')}
            </span>
            <LegBar v={r.long} max={max} leg="long" />
            <LegBar v={r.short} max={max} leg="short" />
            <span className="w-[46px] text-right tabular-nums text-[var(--tx-mut)]">
              {((net.get(r.factor) ?? 0) * 100).toFixed(1)}%
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

  useEffect(() => { fetchExposures(env, id).then(setD).catch(() => {}); }, [env, id]);
  if (!d || !d.sleeves.length) return null;

  return (
    <div className="panel p-4">
      <h2 className="text-sm font-semibold">
        Exposures
        <span className="ml-2 text-[11px] font-normal text-[var(--tx-mut)]">
          what this book is betting on, per sleeve
        </span>
      </h2>

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
                <LegGroup title="Style" legs={legs.filter((l) => l.kind === 'style')} net={net} />
                <LegGroup title="Sector" legs={legs.filter((l) => l.kind === 'sector')} net={net} />
              </div>
            ) : s.factors.length > 0 && (
              <div className="flex flex-wrap gap-x-8 gap-y-3 mt-2">
                <Group title="Style" rows={s.factors.filter((f) => f.kind === 'style')} />
                <Group title="Sector" rows={s.factors.filter((f) => f.kind === 'sector')} />
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
          in the last column. Style and sector are drawn on their own scales, shown above each
          group; within a group both legs share one scale.
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
    </div>
  );
}
