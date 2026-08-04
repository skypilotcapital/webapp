import { RebalanceReview } from '@/components/trading/RebalanceReview';

// S3 — rebalance review. Read-only in this phase: it shows the gate, it does not open it.
export default async function RebalanceDetailPage({
  params,
}: { params: Promise<{ env: string; rebalanceId: string }> }) {
  const { env, rebalanceId } = await params;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Rebalance review</h1>
      <RebalanceReview env={env} id={Number(rebalanceId)} />
    </div>
  );
}
