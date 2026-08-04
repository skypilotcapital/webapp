import { HaltControl } from '@/components/trading/HaltControl';
import { LedgerTable } from '@/components/trading/Ledger';
import { RebalanceList } from '@/components/trading/RebalanceList';

// S7 — the run ledger, with the archive beneath it. The front page shows whatever rebalance is
// OPEN; a rebalance moves to the archive when it reaches reconciled/closed. Archive on STATE, not
// on time (IA §3.7): a time rule would archive a rebalance that is still unreconciled — exactly
// the one you most need in front of you.
export default async function RebalanceLedgerPage({
  params,
}: { params: Promise<{ env: string }> }) {
  const { env } = await params;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Rebalance</h1>
      <HaltControl env={env} />
      <LedgerTable env={env} />
      <RebalanceList env={env} />
    </div>
  );
}
