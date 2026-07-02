import { redirect } from 'next/navigation';

// Retired in the Research-Hub overhaul — the Layer-2 backtests now live under Research ▸ Portfolios.
export default function BacktestsPage() {
  redirect('/research/portfolios');
}
