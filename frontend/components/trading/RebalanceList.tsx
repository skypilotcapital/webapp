'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchRebalances, type RebalanceRow } from '@/lib/trading';

const STATUS_TONE: Record<string, string> = {
  draft: 'text-[var(--tx-dim)]',
  proposed: 'text-[var(--cyan)]',
  approved: 'text-[var(--teal)]',
  submitted: 'text-[var(--amber)]',
  filled: 'text-[var(--pos)]',
  reconciled: 'text-[var(--pos)]',
  closed: 'text-[var(--tx-mut)]',
  cancelled: 'text-[var(--tx-dim)] line-through',
};

function day(ts: string | null) {
  return ts ? new Date(ts).toLocaleDateString('en-GB',
    { day: '2-digit', month: 'short', timeZone: 'UTC' }) : '—';
}

export function RebalanceList({ env }: { env: string }) {
  const [rows, setRows] = useState<RebalanceRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchRebalances(env).then((d) => setRows(d.rebalances)).catch((e) => setErr(String(e)));
  }, [env]);

  if (err) return <div className="panel p-4 text-[var(--neg)] text-sm">Unavailable: {err}</div>;
  if (!rows) return <div className="panel p-4 text-sm text-[var(--tx-dim)]">Loading…</div>;

  const open = rows.filter((r) => r.is_open);
  const archive = rows.filter((r) => !r.is_open);

  const Table = ({ data }: { data: RebalanceRow[] }) => (
    <table className="dtable w-full text-[12px]">
      <thead>
        <tr>
          <th className="text-left">#</th>
          <th className="text-left">Strategy</th>
          <th className="text-left">Signal</th>
          <th className="text-right">Names</th>
          <th className="text-right">Equity</th>
          <th className="text-left">Status</th>
          <th className="text-left">Approved</th>
          <th className="text-left">Frozen</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r) => (
          <tr key={r.rebalance_id}>
            <td>
              <Link href={`/trading/${env}/rebalance/${r.rebalance_id}`}
                    className="underline decoration-dotted underline-offset-2">
                {r.rebalance_id}
              </Link>
            </td>
            <td className="whitespace-nowrap">{r.strategy}</td>
            <td className="whitespace-nowrap">{r.signal_date}</td>
            <td className="text-right">{r.n_names || '—'}</td>
            <td className="text-right">
              {r.sized_equity ? `$${(Number(r.sized_equity) / 1e6).toFixed(1)}M` : '—'}
            </td>
            <td className={`whitespace-nowrap font-medium ${STATUS_TONE[r.status] ?? ''}`}>
              {r.status}
            </td>
            {/* "claimed" is not pedantry: the site is behind ONE shared passcode, so approved_by
                is a typed name and not an authenticated identity. Q1 requires the UI say so
                rather than let a paper-era record later read as an audited one. */}
            <td className="whitespace-nowrap text-[var(--tx-mut)]">
              {r.approved_by
                ? <span title="claimed, not authenticated">{r.approved_by}<span className="text-[var(--tx-dim)]"> (claimed)</span></span>
                : '—'}
            </td>
            <td className="whitespace-nowrap text-[var(--tx-mut)]">{day(r.proposed_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="panel p-4">
      <h2 className="text-sm font-semibold mb-2">Open</h2>
      {open.length ? <Table data={open} />
        : <p className="text-[11px] text-[var(--tx-dim)]">Nothing open.</p>}

      <details className="mt-4">
        <summary className="text-sm font-semibold cursor-pointer">
          Archive <span className="font-normal text-[10px] text-[var(--tx-dim)]">
            — {archive.length} reconciled, closed or cancelled
          </span>
        </summary>
        <div className="mt-2">
          {archive.length ? <Table data={archive} />
            : <p className="text-[11px] text-[var(--tx-dim)]">Empty.</p>}
        </div>
      </details>
    </div>
  );
}
