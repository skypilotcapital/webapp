'use client';

import { useMemo, useState } from 'react';
import type { PlanResponse, PlanRow } from '@/lib/trading';

// The pre-trade working surface. It arrives sorted by size because that is what a PM checks first,
// but every column sorts: "which names am I selling", "what is the biggest short", "is anything
// priced off a stale close" are all real questions and each is a different sort.
type Key = 'ticker' | 'company' | 'sector' | 'sleeve' | 'weight' | 'target_qty'
         | 'delta' | 'side' | 'price' | 'est_notional';

const COLS: { key: Key; label: string; num?: boolean }[] = [
  { key: 'ticker', label: 'Ticker' },
  { key: 'company', label: 'Company' },
  { key: 'sector', label: 'Sector' },
  { key: 'sleeve', label: 'Sleeve' },
  { key: 'weight', label: 'Weight', num: true },
  { key: 'target_qty', label: 'Target', num: true },
  { key: 'delta', label: 'Delta', num: true },
  { key: 'side', label: 'Side' },
  { key: 'price', label: 'Price', num: true },
  { key: 'est_notional', label: 'Notional', num: true },
];

const SLEEVE_LABEL: Record<string, string> = {
  core: 'LO core', sleeve: 'L/S sleeve', unknown: 'unknown',
};

export function TradePlanTable({ plan }: { plan: PlanResponse }) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'est_notional', dir: -1 });
  const [only, setOnly] = useState<'all' | 'core' | 'sleeve'>('all');

  const rows = useMemo(() => {
    const f = only === 'all' ? plan.plan : plan.plan.filter((r) => r.sleeve === only);
    const v = (r: PlanRow) => {
      const x = r[sort.key as keyof PlanRow];
      return typeof x === 'number' ? x : String(x ?? '').toLowerCase();
    };
    return [...f].sort((a, b) => {
      const av = v(a), bv = v(b);
      if (av === bv) return 0;
      return (av > bv ? 1 : -1) * sort.dir;
    });
  }, [plan.plan, sort, only]);

  // Numbers are interesting largest-first, names A-Z. Defaulting both to ascending would make half
  // the columns need two clicks before they say anything.
  const click = (k: Key) =>
    setSort((s) => (s.key === k
      ? { key: k, dir: (s.dir * -1) as 1 | -1 }
      : { key: k, dir: COLS.find((c) => c.key === k)?.num ? -1 : 1 }));

  // Counts describe WHAT IS ON SCREEN, not the whole plan. With a sleeve selected, plan-level
  // totals are a different book from the rows below them, and the reader has no way to tell.
  const shown = useMemo(() => {
    const traded = rows.filter((r) => r.side && !r.dust_filtered);
    return {
      n: rows.length,
      buy: traded.filter((r) => r.side === 'BUY').length,
      sell: traded.filter((r) => r.side === 'SELL').length,
      dust: rows.filter((r) => r.dust_filtered).length,
      gross: traded.reduce((a, r) => a + Number(r.est_notional ?? 0), 0),
    };
  }, [rows]);

  const bySleeve = plan.summary.by_sleeve ?? {};

  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold">
          Trade plan
          <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded bg-[var(--bg)] text-[var(--tx-mut)]">
            PREVIEW — recomputed at submission
          </span>
        </h2>
      </div>

      {/* Always open. This is the working surface — hiding it behind a toggle put a click between
          the reviewer and the only place the actual trades are visible, and the toggle's label
          ("Show 186 rows") could not follow the sleeve filter below it, so it contradicted the
          selection. */}
      <p className="text-[11px] text-[var(--tx-mut)] mt-1">
        {shown.buy + shown.sell} trades — {shown.buy} buys, {shown.sell} sells,
        {' '}{shown.dust} dust-filtered · est. gross ${Math.round(shown.gross).toLocaleString()}
        {only !== 'all' && (
          <span className="text-[var(--tx-dim)]"> · {SLEEVE_LABEL[only]} only</span>
        )}
      </p>

      {/* THE TWO MANDATES, side by side. There is one account and one order per name — the broker
          nets them — but the book is built by two engines and the PM reviews them as two separate
          decisions. Filtering is honest here only because the universes are disjoint. */}
      {Object.keys(bySleeve).length > 1 && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {(['all', 'core', 'sleeve'] as const).map((t) => {
            const st = t === 'all' ? null : bySleeve[t];
            if (t !== 'all' && !st) return null;
            return (
              <button key={t} onClick={() => setOnly(t)}
                      className={`px-2 py-1 rounded text-[11px] border ${only === t
                        ? 'border-[var(--teal)] text-[var(--teal)] font-semibold'
                        : 'border-[var(--border-soft)] text-[var(--tx-mut)]'}`}>
                {t === 'all'
                  ? `All ${plan.summary.n_trades}`
                  : `${SLEEVE_LABEL[t]} · ${st!.n} names · $${Math.round(st!.gross_notional).toLocaleString()}`}
              </button>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto mt-3 max-h-[560px] overflow-y-auto">
          <table className="dtable w-full text-[11px]">
            <thead className="sticky top-0 bg-[var(--panel)]">
              <tr>
                {COLS.map((c) => (
                  <th key={c.key} onClick={() => click(c.key)}
                      className={`cursor-pointer select-none ${c.num ? 'text-right' : 'text-left'}`}
                      title="sort by this column">
                    {c.label}
                    {sort.key === c.key && (
                      <span className="ml-1 text-[var(--teal)]">{sort.dir === 1 ? '▲' : '▼'}</span>
                    )}
                  </th>
                ))}
                <th className="text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.conid}>
                  <td className="font-medium">{r.ticker}</td>
                  <td className="max-w-[190px] truncate" title={r.company ?? ''}>
                    {r.company ?? '—'}
                  </td>
                  <td className="max-w-[120px] truncate" title={r.industry ?? ''}>
                    {r.sector ?? '—'}
                  </td>
                  <td className="text-[var(--tx-mut)]">{SLEEVE_LABEL[r.sleeve] ?? r.sleeve}</td>
                  <td className="text-right">{(Number(r.weight) * 100).toFixed(2)}%</td>
                  <td className="text-right">{r.target_qty ?? '—'}</td>
                  <td className="text-right">{r.delta ?? '—'}</td>
                  <td className={r.side === 'BUY' ? 'text-[var(--pos)]' : 'text-[var(--neg)]'}>
                    {r.side ?? ''}
                  </td>
                  <td className="text-right">{r.price ?? '—'}</td>
                  <td className="text-right">
                    ${Math.round(Number(r.est_notional ?? 0)).toLocaleString()}
                  </td>
                  <td className="text-[10px] text-[var(--tx-dim)] max-w-[160px] truncate"
                      title={r.note ?? ''}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>
    </div>
  );
}
