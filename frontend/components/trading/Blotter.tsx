'use client';

import { useEffect, useState } from 'react';
import { fetchBlotter, type Blotter, type BlotterRow } from '@/lib/trading';

// Polling, not streaming (IA §3.3 + Part 7: streaming quotes and live P&L are explicit non-goals —
// IBKR does that better and it costs market-data entitlements we do not need for a one-month
// horizon). Fast while a rebalance is in flight; STATIC once it is not — the interval is only ever
// armed for an IN_FLIGHT status, so a settled rebalance costs nothing no matter how low this goes.
//
// 3s, down from 10s (2026-08-07, watching the first real paper submission). A 460-name wave submits
// in well under a minute, so at 10s an operator saw three or four frames of a live execution. The
// endpoint is one indexed join over the rebalance's own rows and the page is single-operator, so
// the cost is negligible against being able to actually watch the thing you are responsible for.
const POLL_MS = 3_000;
const IN_FLIGHT = new Set(['approved', 'submitted']);

const fmt = (n: number | null | undefined, dp = 2) =>
  n == null ? '—' : Number(n).toLocaleString('en-US',
    { minimumFractionDigits: dp, maximumFractionDigits: dp });

function rowState(r: BlotterRow): 'rejected' | 'unfilled' | 'partial' | 'done' {
  if (r.status === 'rejected') return 'rejected';
  if (!r.filled) return 'unfilled';
  return Math.abs(r.filled) < Math.abs(r.planned) ? 'partial' : 'done';
}

const TONE: Record<string, string> = {
  rejected: 'text-[var(--neg)]',
  unfilled: 'text-[var(--amber)]',
  partial: 'text-[var(--amber)]',
  done: '',
};

// --- sorting ------------------------------------------------------------------------------------
// The columns worth sorting are the ones you scan for an exception: biggest residual, worst
// slippage, everything rejected. `null` is NOT a value here — an unfilled name has no average price
// and no slippage — so nulls always sink to the bottom whichever way the sort runs. Sorting them as
// zero would float a page of dashes above the rows you asked to see.
type SortKey = 'ticker' | 'side' | 'planned' | 'filled' | 'residual' | 'plan_price'
  | 'avg_price' | 'slip_bps' | 'commission' | 'status';
const NUMERIC: ReadonlySet<SortKey> = new Set<SortKey>(
  ['planned', 'filled', 'residual', 'plan_price', 'avg_price', 'slip_bps', 'commission']);

const COLS: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'ticker', label: 'Ticker', align: 'left' },
  { key: 'side', label: 'Side', align: 'left' },
  { key: 'planned', label: 'Planned', align: 'right' },
  { key: 'filled', label: 'Filled', align: 'right' },
  { key: 'residual', label: 'Residual', align: 'right' },
  { key: 'plan_price', label: 'Plan px', align: 'right' },
  { key: 'avg_price', label: 'Avg fill', align: 'right' },
  { key: 'slip_bps', label: 'Slip bps', align: 'right' },
  { key: 'commission', label: 'Comm', align: 'right' },
  { key: 'status', label: 'Status', align: 'left' },
];

function sortRows(rows: BlotterRow[], key: SortKey | null, dir: 1 | -1): BlotterRow[] {
  if (!key) return rows;
  const numeric = NUMERIC.has(key);
  // Sort a COPY: `data.rows` is the fetched object and the poll replaces it wholesale, so mutating
  // it would race a refresh mid-render.
  return [...rows].sort((a, b) => {
    const av = a[key] as number | string | null;
    const bv = b[key] as number | string | null;
    const aNull = av == null || av === '';
    const bNull = bv == null || bv === '';
    if (aNull || bNull) return aNull && bNull ? 0 : aNull ? 1 : -1;   // nulls last, both directions
    if (numeric) return ((av as number) - (bv as number)) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

export function BlotterSection({ env, id, status, emptyMessage }: {
  env: string; id: number; status: string;
  // Embedded on the rebalance page, a blotter with no orders is not worth a panel and renders
  // nothing. A page whose whole job IS the blotter must say why it is empty instead of going blank.
  emptyMessage?: string;
}) {
  const [data, setData] = useState<Blotter | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey | null; dir: 1 | -1 }>({ key: null, dir: 1 });

  useEffect(() => {
    let alive = true;
    const load = () => fetchBlotter(env, id)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(String(e)); });
    load();
    if (!IN_FLIGHT.has(status)) return () => { alive = false; };
    const t = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [env, id, status]);

  if (err) return emptyMessage
    ? <div className="panel p-4 text-[11px] text-[var(--tx-dim)]">{emptyMessage}</div>
    : null;                                   // a rebalance with no orders is not an error
  if (!data || data.rows.length === 0) return emptyMessage
    ? <div className="panel p-4 text-[11px] text-[var(--tx-dim)]">{emptyMessage}</div>
    : null;

  const R = data.rollup;
  const rows = sortRows(data.rows, sort.key, sort.dir);
  const onSort = (k: SortKey) => setSort((s) =>
    s.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: k === 'ticker' ? 1 : -1 });
  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
        <h2 className="text-sm font-semibold">
          Trade blotter <span className="font-normal text-[10px] text-[var(--tx-dim)]">
            — plan vs actual
          </span>
        </h2>
        {IN_FLIGHT.has(status) && (
          <span className="text-[10px] text-[var(--cyan)]">
            refreshing every {POLL_MS / 1000}s
          </span>
        )}
      </div>

      {/* Rollup: the six numbers that say whether the basket landed. */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] mb-3">
        <span><b>{R.planned}</b> planned</span>
        <span><b>{R.submitted}</b> submitted</span>
        <span className="text-[var(--pos)]"><b>{R.filled}</b> filled</span>
        {R.partial > 0 && <span className="text-[var(--amber)]"><b>{R.partial}</b> partial</span>}
        {R.unfilled > 0 && <span className="text-[var(--amber)]"><b>{R.unfilled}</b> unfilled</span>}
        {R.rejected > 0 && <span className="text-[var(--neg)]"><b>{R.rejected}</b> rejected</span>}
        <span className="text-[var(--tx-mut)]">commission ${fmt(R.commission)}</span>
        {R.avg_slip_bps != null && (
          <span className="text-[var(--tx-mut)]">
            avg slippage {R.avg_slip_bps > 0 ? '+' : ''}{fmt(R.avg_slip_bps, 1)} bps
          </span>
        )}
      </div>

      {/* The independent cross-check: capture_fills saying "0 new executions" is
          indistinguishable from a healthy no-op, so a broker-side fill we hold no execution row
          for has to be shouted about rather than inferred from silence. */}
      {data.unexplained_fills.length > 0 && (
        <div className="mb-3 p-2 rounded border border-[var(--neg)] text-[11px] text-[var(--neg)]">
          <b>{data.unexplained_fills.length} unexplained fill(s)</b> — the broker reports these
          filled or partial but we hold no execution rows:{' '}
          {data.unexplained_fills.map((u) => u.coid).join(', ')}. Run{' '}
          <code>jobs.capture_fills</code> before trusting the numbers above.
        </div>
      )}

      <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
        <table className="dtable w-full text-[11px]">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={`text-${c.align} cursor-pointer select-none whitespace-nowrap`}
                    onClick={() => onSort(c.key)}
                    title={`Sort by ${c.label}`}>
                  {c.label}
                  <span className="ml-1 text-[9px]"
                        style={{ color: sort.key === c.key ? 'var(--teal)' : 'var(--tx-dim)',
                                 opacity: sort.key === c.key ? 1 : 0.35 }}>
                    {sort.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}
                  </span>
                </th>
              ))}
              {/* cOID is an identifier, not a measure — nothing is learned by ordering on it. */}
              <th className="text-left">cOID</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = rowState(r);
              return (
                <tr key={r.conid} className={TONE[st]}>
                  <td>{r.ticker}</td>
                  <td className={r.side === 'BUY' ? 'text-[var(--pos)]' : 'text-[var(--neg)]'}>
                    {r.side}
                  </td>
                  <td className="text-right">{fmt(r.planned, 0)}</td>
                  <td className="text-right">{fmt(r.filled, 0)}</td>
                  <td className="text-right">{r.residual ? fmt(r.residual, 0) : '—'}</td>
                  <td className="text-right">{fmt(r.plan_price)}</td>
                  <td className="text-right">{fmt(r.avg_price)}</td>
                  {/* Positive is always worse for us, whichever side we were on. Blank where
                      nothing filled — there is no slippage on a trade that did not happen. */}
                  <td className={`text-right ${r.slip_bps == null ? 'text-[var(--tx-dim)]'
                    : r.slip_bps > 0 ? 'text-[var(--neg)]' : 'text-[var(--pos)]'}`}>
                    {r.slip_bps == null ? '—'
                      : `${r.slip_bps > 0 ? '+' : ''}${fmt(r.slip_bps, 1)}`}
                  </td>
                  <td className="text-right">{r.commission ? fmt(r.commission) : '—'}</td>
                  <td>{r.status ?? 'not sent'}</td>
                  <td className="font-mono text-[10px] text-[var(--tx-dim)]">{r.coid ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-[var(--tx-dim)] mt-2">
        Rejected and unfilled sort to the top — they are the rows that need a decision. Slippage is
        measured against the plan price (the reference the share count was derived from) and signed
        so <b>positive is always worse for us</b>. Feeds cost-model calibration [06-T7].
      </p>
    </div>
  );
}
