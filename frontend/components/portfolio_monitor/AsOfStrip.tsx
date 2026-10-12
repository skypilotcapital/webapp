// Every source carries its own as-of, printed separately — never merged into one date (IA §2 R2).
// The notices are about the DATA's freshness and coverage, never a judgement on the book.

import type { MonitorTarget } from '@/lib/portfolioMonitor';

export function AsOfStrip({ items, target, notices }: {
  items: { label: string; value: React.ReactNode }[];
  target: MonitorTarget | null;
  notices: string[];
}) {
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--tx-mut)]">
        {items.map((i) => (
          <span key={i.label}>{i.label} <b className="text-[var(--tx)]">{i.value}</b></span>
        ))}
        <span>
          Target{' '}
          {target ? (
            <b className="text-[var(--tx)]">
              rebalance {target.rebalance_id} · signal {target.signal_date ?? '—'} · traded{' '}
              {target.trade_date ?? '—'}
            </b>
          ) : <b className="text-[var(--tx)]">none recorded for this date</b>}
        </span>
      </div>
      {notices.map((n) => (
        <div key={n} className="text-xs mt-1.5 text-[var(--tx)]">{n}</div>
      ))}
    </div>
  );
}

