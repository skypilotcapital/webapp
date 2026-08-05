import { RebalanceReview } from '@/components/trading/RebalanceReview';

// The frozen book, in detail, for the purpose of reviewing and approving it for trading.
//
// NAMING MATTERS HERE. This was "Rebalance review" reached by a button called "Open and execute",
// which framed a review surface by its last step — as though the point were to launch something
// rather than to decide whether it should be launched. What this page actually shows is ONE FROZEN
// TARGET PORTFOLIO: what produced it, what is in it, whether it is sound, and the two deliberate
// actions (approve, then execute) that can follow.
export default async function RebalanceDetailPage({
  params,
}: { params: Promise<{ env: string; rebalanceId: string }> }) {
  const { env, rebalanceId } = await params;
  return <RebalanceReview env={env} id={Number(rebalanceId)} />;
}
