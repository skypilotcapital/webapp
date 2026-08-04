'use client';

import { useEffect, useState } from 'react';
import { fetchReadiness, type Readiness } from '@/lib/trading';

// §3.9 — "a late factor build is knowable on the 2nd, not discovered on the 5th."
//
// This panel is about TIME, not status. The ledger below it already says whether each build ran;
// this says whether the data the next rebalance needs has LANDED, while there is still room to do
// something about it. On a clean month it collapses to one quiet line, because a readiness panel
// that shouts every day is one nobody reads on the day it matters.
const VERDICT: Record<string, { cls: string; label: string }> = {
  ready:    { cls: 'text-[var(--pos)]',   label: 'ready' },
  building: { cls: 'text-[var(--cyan)]',  label: 'still building' },
  at_risk:  { cls: 'text-[var(--amber)]', label: 'AT RISK' },
  late:     { cls: 'text-[var(--neg)]',   label: 'LATE' },
  unknown:  { cls: 'text-[var(--tx-mut)]', label: 'cannot tell' },
};

export function ReadinessPanel({ env }: { env: string }) {
  const [d, setD] = useState<Readiness | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => { fetchReadiness(env).then(setD).catch(() => {}); }, [env]);
  if (!d) return null;

  const v = VERDICT[d.verdict] ?? VERDICT.unknown;
  const clean = d.verdict === 'ready';

  return (
    <div className={`panel p-3 ${d.verdict === 'late' ? 'border-2 border-[var(--neg)]'
      : d.verdict === 'at_risk' ? 'border border-[var(--amber)]' : ''}`}>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-sm font-semibold">Upstream data</span>
        <span className={`text-[12px] font-semibold ${v.cls}`}>{v.label}</span>
        <span className="text-[11px] text-[var(--tx-mut)]">
          for signal {d.signal_date} · {d.weekdays_since_month_end} weekday
          {d.weekdays_since_month_end === 1 ? '' : 's'} since month-end
          {d.n_missing > 0 && <b className="text-[var(--neg)]"> · {d.n_missing} missing</b>}
          {d.n_unknown > 0 && <span className="text-[var(--tx-dim)]"> · {d.n_unknown} uncheckable</span>}
        </span>
        <button className="chip-btn text-[10px] ml-auto" onClick={() => setOpen((o) => !o)}>
          {open ? 'hide' : 'detail'}
        </button>
      </div>

      {/* A clean month gets one line. Detail is a click away, not the default — the panel earns
          attention by being quiet when there is nothing to attend to. */}
      {(open || !clean) && (
        <ul className="mt-2 space-y-1">
          {d.checks.map((c) => (
            <li key={c.name} className="text-[11px] flex gap-2">
              <span className={c.present === null ? 'text-[var(--tx-dim)]'
                : c.present ? 'text-[var(--pos)]' : 'text-[var(--neg)]'}>
                {c.present === null ? '?' : c.present ? '●' : '■'}
              </span>
              <span className="w-[250px] shrink-0 font-mono text-[10px]">{c.name}</span>
              <span className="text-[var(--tx-mut)]">
                {c.error ? c.error
                  : c.present ? `${(c.rows ?? 0).toLocaleString()} rows`
                  : 'NOT PRESENT'}
              </span>
              {!c.present && (
                <span className="text-[var(--tx-dim)]">— {c.why}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {!clean && (
        <p className="text-[10px] text-[var(--tx-dim)] mt-2">{d.note}</p>
      )}
    </div>
  );
}
