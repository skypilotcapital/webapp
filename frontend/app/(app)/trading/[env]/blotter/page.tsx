'use client';

/**
 * Standalone order blotter — the execution surface on its own page.
 *
 * The blotter already lives on the rebalance page, but that page is the APPROVAL surface: to watch
 * a submission you had to scroll past the pre-trade checks, the approval panel and the gross-
 * exposure chain to reach it. During the first real paper submission (2026-08-07) that was the
 * wrong shape — while orders are going out, plan-vs-actual is the only thing you want on screen.
 *
 * It defaults to the most recent rebalance that HAS orders, not simply the most recent rebalance:
 * cancelled and superseded books are the common case here (rebalance 13 was the fourth freeze of
 * the same signal date), and landing on an empty blotter for a book that never traded is a worse
 * default than landing on the last one that did.
 */

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetchRebalances, type RebalanceRow } from '@/lib/trading';
import { BlotterSection } from '@/components/trading/Blotter';

// A book only ever reaches the broker from these states, so anything else cannot have orders.
const MAY_HAVE_ORDERS = new Set(['approved', 'submitted', 'closed', 'cancelled']);
const IN_FLIGHT = new Set(['approved', 'submitted']);

export default function BlotterPage({ params }: { params: Promise<{ env: string }> }) {
  const { env } = use(params);
  const [picked, setPicked] = useState<number | null>(null);

  // Refresh the LIST too, slowly: a rebalance frozen and approved in another tab should appear here
  // without a reload, but the list is not the thing being watched — the blotter polls itself.
  const { data, error } = useSWR(['tr-rebalances', env], () => fetchRebalances(env),
    { refreshInterval: 30_000, revalidateOnFocus: true });

  const candidates: RebalanceRow[] = useMemo(
    () => (data?.rebalances ?? []).filter((r) => MAY_HAVE_ORDERS.has(r.status)),
    [data]);
  const current = picked != null
    ? candidates.find((r) => r.rebalance_id === picked) ?? null
    : candidates[0] ?? null;      // the API returns newest-first

  return (
    <div className="animate-in flex flex-col min-h-0">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
        <h1 className="text-lg font-bold tracking-tight" style={{ color: 'var(--tx)' }}>
          Order blotter
          <span className="ml-2 font-normal text-[11px]" style={{ color: 'var(--tx-dim)' }}>
            what we meant to trade, beside what happened
          </span>
        </h1>
        {current && (
          <Link href={`/trading/${env}/rebalance/${current.rebalance_id}`}
                className="text-[11px] font-semibold" style={{ color: 'var(--teal)' }}>
            open rebalance #{current.rebalance_id} →
          </Link>
        )}
      </div>

      {error && (
        <div className="panel p-6 text-sm" style={{ color: 'var(--neg)' }}>
          Failed to load rebalances.
        </div>
      )}
      {!data && !error && <div className="panel p-10 text-center muted text-sm">Loading…</div>}

      {data && candidates.length === 0 && (
        <div className="panel p-6 text-[12px]" style={{ color: 'var(--tx-mut)' }}>
          No rebalance has reached the broker yet. The blotter appears once a book is approved and
          orders are submitted.
        </div>
      )}

      {candidates.length > 0 && (
        <>
          {/* A picker, not a list of pages: the blotter is one view over whichever book you mean,
              and past books are read constantly (a fill question is usually about last month). */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-[10px] font-bold tracking-[1.5px]" style={{ color: 'var(--tx-dim)' }}>
              REBALANCE
            </span>
            {candidates.slice(0, 8).map((r) => {
              const active = current?.rebalance_id === r.rebalance_id;
              return (
                <button
                  key={r.rebalance_id}
                  onClick={() => setPicked(r.rebalance_id)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors"
                  style={active
                    ? { background: 'var(--teal)', color: '#fffdf9' }
                    : { background: 'var(--panel2)', color: 'var(--tx-mut)' }}
                  title={`${r.strategy} · signal ${r.signal_date} · ${r.status}`}
                >
                  #{r.rebalance_id}
                  <span className="ml-1.5 font-normal opacity-80">{r.status}</span>
                  {IN_FLIGHT.has(r.status) && (
                    <span className="ml-1.5" style={{ color: active ? '#fffdf9' : 'var(--cyan)' }}>●</span>
                  )}
                </button>
              );
            })}
          </div>

          {current && (
            <div className="text-[11px] mb-2" style={{ color: 'var(--tx-mut)' }}>
              {current.strategy} · signal {current.signal_date} · {current.n_names} names
              {current.approved_by && <> · approved by <b>{current.approved_by}</b></>}
            </div>
          )}

          {current && (
            <BlotterSection
              env={env}
              id={current.rebalance_id}
              status={current.status}
              emptyMessage={`Rebalance #${current.rebalance_id} is ${current.status} and has no orders on record. `
                + 'Nothing was submitted to the broker for this book.'}
            />
          )}
        </>
      )}
    </div>
  );
}
