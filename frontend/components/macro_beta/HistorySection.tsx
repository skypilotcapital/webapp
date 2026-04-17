'use client';

import useSWR from 'swr';
import { fetchMacroBetaHistory } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

const COLORS: Record<string, string> = {
  low_beta: '#c76a6a',
  market_beta: '#d1a85b',
  high_beta: '#6ea47c',
};

function stateLabel(state: string) {
  return state.replace('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export function HistorySection() {
  const { data, error, isLoading } = useSWR('macro-beta-history', fetchMacroBetaHistory, { refreshInterval: 120_000 });

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">Signal History</h2>
        <p className="text-sm text-slate-500 mt-2">Recent daily state history with spot S&amp;P 500 and BBB spread context.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-slate-500">Loading history...</p>}
        {error && <p className="text-sm text-red-500">Failed to load history.</p>}
        {data && (
          <>
            <div className="flex h-5 rounded-full overflow-hidden border border-slate-100">
              {data.map((point) => (
                <div
                  key={point.signal_date}
                  style={{ width: `${100 / data.length}%`, backgroundColor: COLORS[point.final_beta_target] ?? '#94a3b8' }}
                  title={`${point.signal_date}: ${stateLabel(point.final_beta_target)}`}
                />
              ))}
            </div>
            <div className="max-h-80 overflow-auto rounded-2xl border border-slate-100">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-500">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">State</th>
                    <th className="px-4 py-3 text-right">S&amp;P 500 Index</th>
                    <th className="px-4 py-3 text-right">BBB Spread</th>
                    <th className="px-4 py-3 text-right">50/200 Spread %</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data].reverse().slice(0, 40).map((point) => (
                    <tr key={point.signal_date} className="border-t border-slate-100">
                      <td className="px-4 py-3">{point.signal_date}</td>
                      <td className="px-4 py-3 font-semibold">{stateLabel(point.final_beta_target)}</td>
                      <td className="px-4 py-3 text-right">{point.sp500_spot_level?.toFixed(2) ?? '-'}</td>
                      <td className="px-4 py-3 text-right">{point.bbb_oas_bps != null ? `${point.bbb_oas_bps.toFixed(0)} bps` : '-'}</td>
                      <td className="px-4 py-3 text-right">
                        {point.sp500_50_200_spread_pct != null ? `${(point.sp500_50_200_spread_pct * 100).toFixed(2)}%` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
