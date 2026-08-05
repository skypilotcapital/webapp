import { RebalanceBoard } from '@/components/trading/RebalanceBoard';

// S7 — the run ledger. Archive on STATE, not on time (IA §3.7): a time rule would archive a
// rebalance that is still unreconciled, which is exactly the one you most need in front of you.
export default async function RebalanceLedgerPage({
  params,
}: { params: Promise<{ env: string }> }) {
  const { env } = await params;
  return <RebalanceBoard env={env} />;
}
