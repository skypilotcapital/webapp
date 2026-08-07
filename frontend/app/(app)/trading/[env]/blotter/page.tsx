'use client';

/**
 * Standalone TRADE BLOTTER — the execution record, on its own page.
 *
 * The blotter also lives on the rebalance page, but that page is the APPROVAL surface: watching a
 * submission meant scrolling past the pre-trade checks, the approval panel and the gross-exposure
 * chain to reach it. During the first real paper submission (2026-08-07) that was the wrong shape.
 *
 * TWO THINGS, deliberately on one page. The SESSION INDEX is the history — one row per month, which
 * after a year is the execution-quality record — and the blotter below it is the per-name detail
 * for whichever session is selected. Splitting them would mean navigating away to answer "was that
 * slippage normal?", which is the question the index exists to answer at a glance.
 *
 * Sessions default to the most recent one that TRADED, not the most recent rebalance: cancelled and
 * superseded books are the common case (today's traded book was the fourth freeze of one signal
 * date), and landing on an empty blotter is a worse default than landing on the last real one.
 */

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import useSWR from 'swr';
import { blotterCsvHref, fetchSessions, type SessionRow } from '@/lib/trading';
import { BlotterSection } from '@/components/trading/Blotter';

const IN_FLIGHT = new Set(['approved', 'submitted']);

const money = (n: number | null | undefined, dp = 0) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US',
    { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

// Sessions are identified by their TRADE DATE. The id stays visible as provenance, but "7 Aug 2026"
// is how a fill gets asked about, and at a monthly cadence the date is the natural handle.
const sessionDate = (r: SessionRow) =>
  r.submitted_at
    ? new Date(r.submitted_at).toLocaleDateString('en-GB',
        { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : `signal ${r.signal_date}`;

export default function BlotterPage({ params }: { params: Promise<{ env: string }> }) {
  const { env } = use(params);
  const [picked, setPicked] = useState<number | null>(null);

  // The index refreshes slowly — it is history, not a live view. The blotter polls itself while a
  // session is in flight.
  const { data, error } = useSWR(['tr-sessions', env], () => fetchSessions(env),
    { refreshInterval: 60_000, revalidateOnFocus: true });

  const sessions: SessionRow[] = useMemo(() => data?.sessions ?? [], [data]);
  const current = picked != null
    ? sessions.find((r) => r.rebalance_id === picked) ?? null
    : sessions[0] ?? null;     // newest first

  return (
    <div className="animate-in flex flex-col min-h-0">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
        <h1 className="text-lg font-bold tracking-tight" style={{ color: 'var(--tx)' }}>
          Trade blotter
          <span className="ml-2 font-normal text-[11px]" style={{ color: 'var(--tx-dim)' }}>
            what we meant to trade, beside what happened
          </span>
        </h1>
        {current && (
          <div className="flex items-center gap-3 text-[11px] font-semibold">
            <a href={blotterCsvHref(env, current.rebalance_id)}
               className="hover:underline" style={{ color: 'var(--teal)' }}>
              download CSV ↓
            </a>
            <Link href={`/trading/${env}/rebalance/${current.rebalance_id}`}
                  style={{ color: 'var(--teal)' }}>
              open rebalance #{current.rebalance_id} →
            </Link>
          </div>
        )}
      </div>

      {error && (
        <div className="panel p-6 text-sm" style={{ color: 'var(--neg)' }}>Failed to load sessions.</div>
      )}
      {!data && !error && <div className="panel p-10 text-center muted text-sm">Loading…</div>}

      {data && sessions.length === 0 && (
        <div className="panel p-6 text-[12px]" style={{ color: 'var(--tx-mut)' }}>
          No rebalance has reached the broker yet. A trading session appears here once a book is
          approved and its orders are submitted; sessions are kept permanently.
        </div>
      )}

      {sessions.length > 0 && (
        <>
          {/* ---- the session index: one row per month ---- */}
          <div className="panel p-4 mb-4">
            <div className="panel-head">Sessions <span className="muted" style={{ fontWeight: 400 }}>
              · click a row to load its blotter</span></div>
            <div className="overflow-x-auto">
              <table className="dtable w-full text-[11px]">
                <thead>
                  <tr>
                    <th className="text-left">Traded</th><th className="text-left">Strategy</th>
                    <th className="text-left">Signal</th>
                    <th className="text-right">Planned</th><th className="text-right">Filled</th>
                    <th className="text-right">Unfilled</th>
                    <th className="text-right">Gross traded</th><th className="text-right">Comm</th>
                    <th className="text-right">Avg slip</th>
                    <th className="text-left">Status</th><th className="text-right">CSV</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((r) => {
                    const active = current?.rebalance_id === r.rebalance_id;
                    return (
                      <tr key={r.rebalance_id}
                          onClick={() => setPicked(r.rebalance_id)}
                          className="cursor-pointer"
                          style={active ? { background: 'rgba(14,124,111,0.10)' } : undefined}>
                        <td className="font-semibold">
                          {sessionDate(r)}
                          <span className="ml-1.5 font-normal text-[9px]"
                                style={{ color: 'var(--tx-dim)' }}>#{r.rebalance_id}</span>
                          {IN_FLIGHT.has(r.status) && (
                            <span className="ml-1.5" style={{ color: 'var(--cyan)' }}>●</span>
                          )}
                        </td>
                        <td>{r.strategy}</td>
                        <td>{r.signal_date}</td>
                        <td className="text-right">{r.planned}</td>
                        <td className="text-right" style={{ color: 'var(--pos)' }}>{r.filled}</td>
                        <td className="text-right"
                            style={{ color: r.unfilled ? 'var(--amber)' : undefined }}>
                          {r.unfilled || '—'}
                        </td>
                        <td className="text-right">{money(r.gross_traded)}</td>
                        <td className="text-right">{money(r.commission, 2)}</td>
                        {/* Notional-weighted, and signed so positive is worse for us — the same
                            convention as the per-name column below. */}
                        <td className="text-right" style={{
                          color: r.avg_slip_bps == null ? 'var(--tx-dim)'
                            : r.avg_slip_bps > 0 ? 'var(--neg)' : 'var(--pos)' }}>
                          {r.avg_slip_bps == null ? '—'
                            : `${r.avg_slip_bps > 0 ? '+' : ''}${r.avg_slip_bps.toFixed(1)}`}
                        </td>
                        <td>{r.status}</td>
                        <td className="text-right">
                          <a href={blotterCsvHref(env, r.rebalance_id)}
                             onClick={(e) => e.stopPropagation()}
                             className="hover:underline" style={{ color: 'var(--teal)' }}>↓</a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] mt-2" style={{ color: 'var(--tx-dim)' }}>
              A session is a rebalance that reached the broker. Sessions are permanent — the frozen
              book, orders and executions are immutable and kept indefinitely; the CSV is generated
              from them on demand rather than stored, so it can never disagree with this page.
            </p>
          </div>

          {current && (
            <div className="text-[11px] mb-2" style={{ color: 'var(--tx-mut)' }}>
              Showing <b>{sessionDate(current)}</b> · {current.strategy} · signal{' '}
              {current.signal_date} · sized {money(current.sized_equity)}
              {current.approved_by && <> · approved by <b>{current.approved_by}</b></>}
            </div>
          )}

          {current && (
            <BlotterSection
              env={env}
              id={current.rebalance_id}
              status={current.status}
              emptyMessage={`Session #${current.rebalance_id} has no orders on record.`}
            />
          )}
        </>
      )}
    </div>
  );
}
