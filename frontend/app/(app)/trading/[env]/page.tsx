import { redirect } from 'next/navigation';

// The desk (S1) is a later phase. Until it exists, the environment root goes where the work is.
export default async function TradingHome({ params }: { params: Promise<{ env: string }> }) {
  const { env } = await params;
  redirect(`/trading/${env}/rebalance`);
}
