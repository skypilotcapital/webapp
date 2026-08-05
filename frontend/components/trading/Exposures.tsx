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
const BAR_MAX = 0.12;   // exposures beyond ±12% pin the bar; the number is always shown too

function Bar({ v }: { v: number }) {
  const pct = Math.min(Math.abs(v) / BAR_MAX, 1) * 50;
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
  return (
    <div className="min-w-[248px]">
      <div className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)] mb-1">{title}</div>
      <ul className="space-y-0.5">
        {rows.map((f) => (
          <li key={f.factor} className="flex items-center gap-2 text-[11px]">
            <span className="w-[104px] shrink-0 truncate" title={f.factor}>
              {f.factor.replace(/^sec_/, '')}
            </span>
            <Bar v={f.active_exposure} />
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
  const [all, setAll] = useState(false);

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
        const shown = all ? s.factors : s.factors.slice(0, 8);
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
                <Group title="Style" rows={shown.filter((f) => f.kind === 'style')} />
                <Group title="Sector" rows={shown.filter((f) => f.kind === 'sector')} />
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-3 mt-3">
        <button className="chip-btn text-[10px]" onClick={() => setAll((v) => !v)}>
          {all ? 'Top 8 only' : 'Show every factor'}
        </button>
        <span className="text-[10px] text-[var(--tx-dim)]">
          Active exposure vs the sleeve&apos;s own benchmark (L/S is measured against cash, so its
          exposures are outright). Return attribution is retrospective and lives in Portfolios —
          it needs the following month&apos;s factor returns, so it cannot exist for a book you
          have not traded yet.
        </span>
      </div>
    </div>
  );
}
