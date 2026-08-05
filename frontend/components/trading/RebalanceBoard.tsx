'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchLedger, fetchReview, type Ledger, type Review } from '@/lib/trading';
import { HaltControl } from './HaltControl';
import { LedgerTable } from './Ledger';
import { NextAction } from './NextAction';
import { ReadinessPanel } from './Readiness';
import { RebalanceList } from './RebalanceList';

// THE READING ORDER IS THE POINT. A PM opening this at 11:30 on trade day should get, in order:
//   1. what do I do now            (NextAction — one sentence and a route to the evidence)
//   2. can I stop it               (HALT, compact until something is in flight)
//   3. is the data behind it sound (upstream readiness — quiet on a clean month)
//   4. where exactly are we        (the ledger, nine steps)
//   5. what happened before        (open + archive)
//
// Previously the page opened with a red HALT block and a nine-row table, which answers 4 first and
// 1 never. The information was all there; the order made you assemble the answer yourself.
export function RebalanceBoard({ env }: { env: string }) {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [review, setReview] = useState<Review | null>(null);

  const load = useCallback(() => {
    fetchLedger(env).then((d) => {
      setLedger(d);
      if (d.rebalance) {
        fetchReview(env, d.rebalance.rebalance_id)
          .then((r) => setReview(r.review)).catch(() => {});
      }
    }).catch(() => {});
  }, [env]);

  useEffect(() => { load(); }, [load]);

  const executing = ledger?.steps.some(
    (s) => s.step === 'execution' && s.state === 'running') ?? false;

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Rebalance</h1>
      {ledger && <NextAction ledger={ledger} review={review} />}
      <HaltControl env={env} rebalanceId={ledger?.rebalance?.rebalance_id} active={executing} />
      <ReadinessPanel env={env} />
      <LedgerTable env={env} />
      <RebalanceList env={env} />
    </div>
  );
}
