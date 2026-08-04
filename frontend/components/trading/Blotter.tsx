'use client';

import { useEffect, useState } from 'react';
import { fetchBlotter, type Blotter, type BlotterRow } from '@/lib/trading';

// Polling, not streaming (IA §3.3 + Part 7: streaming quotes and live P&L are explicit non-goals —
// IBKR does that better and it costs market-data entitlements we do not need for a one-month
// horizon). ~10s while a rebalance is in flight; static once it is not.
const POLL_MS = 10_000;
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

export function BlotterSection({ env, id, status }: { env: string; id: number; status: string }) {
  const [data, setData] = useState<Blotter | null>(null);
  const [err, setErr] = useState<string | null>(null);

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

  if (err) return null;                       // a rebalance with no orders is not an error
  if (!data || data.rows.length === 0) return null;

  const R = data.rollup;
  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
        <h2 className="text-sm font-semibold">
          Order blotter <span className="font-normal text-[10px] text-[var(--tx-dim)]">
            — plan vs actual
          </span>
        </h2>
        {IN_FLIGHT.has(status) && (
          <span className="text-[10px] text-[var(--cyan)]">refreshing every 10s</span>
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
              <th className="text-left">Ticker</th><th className="text-left">Side</th>
              <th className="text-right">Planned</th><th className="text-right">Filled</th>
              <th className="text-right">Residual</th>
              <th className="text-right">Plan px</th><th className="text-right">Avg fill</th>
              <th className="text-right">Slip bps</th><th className="text-right">Comm</th>
              <th className="text-left">Status</th><th className="text-left">cOID</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
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
