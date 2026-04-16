'use client';

import useSWR from 'swr';
import { fetchMacroBetaRegimeStats, fetchMacroBetaRegimes } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function RegimeAnalyticsSection() {
  const { data: stats } = useSWR('macro-beta-regime-stats', fetchMacroBetaRegimeStats, { refreshInterval: 300_000 });
  const { data: regimes, error, isLoading } = useSWR('macro-beta-regimes', fetchMacroBetaRegimes, { refreshInterval: 300_000 });

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">Regime Analytics</h2>
        <p className="text-sm text-slate-500 mt-2">Persisted contiguous beta regimes and S&P 500 returns during each state.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stats.map((row) => (
              <div key={row.final_beta_target} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="font-bold text-slate-800">{row.final_beta_target}</p>
                <p className="text-slate-600 mt-1">Regimes: {row.regime_count}</p>
                <p className="text-slate-600">Avg length: {row.avg_trading_days?.toFixed(1) ?? '—'} days</p>
                <p className="text-slate-600">Avg annualized return: {row.avg_annualized_return != null ? `${(row.avg_annualized_return * 100).toFixed(2)}%` : '—'}</p>
              </div>
            ))}
          </div>
        )}
        {isLoading && <p className="text-sm text-slate-500">Loading regimes…</p>}
        {error && <p className="text-sm text-red-500">Failed to load regimes.</p>}
        {regimes && (
          <div className="max-h-80 overflow-auto rounded-2xl border border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-500">
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Start</th>
                  <th className="px-4 py-3">End</th>
                  <th className="px-4 py-3 text-right">Days</th>
                  <th className="px-4 py-3 text-right">Total Return</th>
                  <th className="px-4 py-3 text-right">Annualized</th>
                </tr>
              </thead>
              <tbody>
                {regimes.map((row) => (
                  <tr key={`${row.start_date}-${row.end_date}`} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold">{row.final_beta_target}</td>
                    <td className="px-4 py-3">{row.start_date}</td>
                    <td className="px-4 py-3">{row.end_date}</td>
                    <td className="px-4 py-3 text-right">{row.trading_days}</td>
                    <td className="px-4 py-3 text-right">{row.sp500_total_return != null ? `${(row.sp500_total_return * 100).toFixed(2)}%` : '—'}</td>
                    <td className="px-4 py-3 text-right">{row.sp500_annualized_return != null ? `${(row.sp500_annualized_return * 100).toFixed(2)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
