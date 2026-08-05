'use client';

import Link from 'next/link';
import type { Ledger, Review } from '@/lib/trading';

// THE ANSWER TO "WHAT DO I DO NOW?", which is the only question a PM has at 11:30 on trade day.
//
// The ledger below is a nine-row table of equal-weight rows: complete, accurate, and it makes you
// READ to find out you are the blocker. On the one day this page matters most, that is the wrong
// shape. So the state of the cycle is resolved to a single sentence and, where a human is the next
// move, a route straight to the evidence.
//
// It deliberately links rather than acting. Approval lives beside the pre-trade checks and nowhere
// else — an approve button on a summary card is exactly the "unexamined approval that feels
// examined" §3.1 is written against. The card gets you to the checks in one click; the decision
// happens where the evidence is.
export function NextAction({ ledger, review }: { ledger: Ledger; review?: Review | null }) {
  const r = ledger.rebalance;
  if (!r) {
    return (
      <div className="panel p-4">
        <p className="text-[13px] text-[var(--tx-mut)]">
          <b>Nothing open.</b> The next rebalance appears here once its book is frozen.
        </p>
      </div>
    );
  }

  const href = `/trading/${ledger.env}/rebalance/${r.rebalance_id}`;
  const failed = ledger.steps.filter((s) => s.state === 'failed');
  const executing = ledger.steps.find((s) => s.step === 'execution' && s.state === 'running');

  let tone = 'border-[var(--border-soft)]';
  let headline = '';
  let body: React.ReactNode = null;
  let cta: { label: string; href: string } | null = null;

  if (failed.length) {
    tone = 'border-2 border-[var(--neg)]';
    headline = `${failed[0].label} failed`;
    body = <>{failed[0].detail}</>;
    cta = { label: 'Open the rebalance', href };
  } else if (executing) {
    tone = 'border-2 border-[var(--amber)]';
    headline = 'Executing now';
    body = <>Orders are going out in waves. <b>HALT is above</b> and stops it between any two.</>;
    cta = { label: 'Watch the blotter', href };
  } else if (r.status === 'proposed') {
    tone = 'border-2 border-[var(--cyan)]';
    headline = 'Awaiting your approval';
    body = review
      ? <>You are approving <b>{r.strategy}</b> for signal {r.signal_date} —{' '}
          <b>{review.n_trades} trades</b>, ~${Math.round(Number(review.gross_notional ?? 0)).toLocaleString()} gross
          {review.pct_margin != null && <>, {(Number(review.pct_margin) * 100).toFixed(0)}% projected margin</>}.
          {' '}Pre-trade checks: <b className={review.worst_state === 'ok' ? 'text-[var(--pos)]'
            : review.worst_state === 'warn' ? 'text-[var(--amber)]' : 'text-[var(--neg)]'}>
            {review.worst_state === 'ok' ? 'all passed'
              : review.worst_state === 'warn' ? 'passed with warnings' : 'ONE FAILED'}
          </b>.</>
      : <>No pre-trade review has been computed yet — run the dry run first, then review it.</>;
    cta = { label: 'Review the trade intent, then approve', href };
  } else if (r.status === 'approved') {
    tone = 'border-2 border-[var(--neg)]';
    headline = 'Approved — ready to execute';
    body = <>The book is approved and nothing has been sent. Execution submits real orders to the
      paper account.</>;
    cta = { label: 'Open and execute', href };
  } else if (r.status === 'submitted') {
    headline = 'Submitted — capture fills next';
    body = <>Orders are in. Capture the fills, then reconcile.</>;
    cta = { label: 'Open the blotter', href };
  } else {
    headline = `Rebalance ${r.status}`;
    body = <>Nothing is waiting on you.</>;
    cta = { label: 'Open the rebalance', href };
  }

  return (
    <div className={`panel p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)]">Next action</div>
          <h2 className="text-base font-semibold mt-0.5">{headline}</h2>
          <p className="text-[12px] text-[var(--tx-mut)] mt-1 max-w-[70ch]">{body}</p>
        </div>
        {cta && (
          <Link href={cta.href}
                className="shrink-0 px-3 py-2 rounded text-[12px] font-semibold bg-[var(--teal)] text-[#fffdf9]">
            {cta.label} →
          </Link>
        )}
      </div>
      <div className="text-[10px] text-[var(--tx-dim)] mt-2">
        #{r.rebalance_id} · {r.strategy} · signal {r.signal_date} · {r.status}
      </div>
    </div>
  );
}
