'use client';

import { useEffect, useState } from 'react';
import { fetchExposures, type Exposures } from '@/lib/trading';

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
        return (
          <div key={s.label} className="mt-3">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-[12px] font-semibold">{SLEEVE_NAME[s.sleeve] ?? s.sleeve}</span>
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

            {s.factors.length > 0 && (
              <div className="flex flex-wrap gap-x-8 gap-y-3 mt-2">
                <Group title="Style" rows={s.factors.filter((f) => f.kind === 'style')} />
                <Group title="Sector" rows={s.factors.filter((f) => f.kind === 'sector')} />
              </div>
            )}
          </div>
        );
      })}

      <div className="mt-3">
        <span className="text-[10px] text-[var(--tx-dim)]">
          <b>LO core</b> is measured against a cap-weighted S&amp;P 500 built from our own universe
          and market caps (not the published index). <b>L/S sleeve</b> subtracts no benchmark at
          all — its numbers are the outright NET of longs minus shorts, so a small net can hide two
          large opposing legs. Style and sector are drawn on their own scales, shown above each
          group. Return attribution is retrospective and lives in Portfolios: it needs the
          following month&apos;s factor returns, so it cannot exist for a book you have not traded.
        </span>
      </div>
    </div>
  );
}
