'use client';

import useSWR from 'swr';
import { fetchMacroBetaHealth } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { statusBadgeClass } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export function HealthSection() {
  const { data, error, isLoading } = useSWR('macro-beta-health', fetchMacroBetaHealth, { refreshInterval: 60_000 });

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">Macro Beta Data Health</h2>
        <p className="text-sm text-slate-500 mt-2">Compact freshness and run-status monitor for this model only.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && <p className="text-sm text-slate-500">Loading health…</p>}
        {error && <p className="text-sm text-red-500">Failed to load health.</p>}
        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {data.freshness.map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="font-bold text-slate-800">{item.label}</p>
                  <p className="text-slate-600 mt-1">{item.max_date ?? 'No data'}</p>
                  <p className="text-slate-500">Lag: {item.lag_days != null ? `${item.lag_days}d` : '—'}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-slate-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-500">
                    <th className="px-4 py-3">Step</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Started</th>
                    <th className="px-4 py-3 text-right">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.map((row) => (
                    <tr key={row.step} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-mono">{row.step}</td>
                      <td className="px-4 py-3"><Badge className={statusBadgeClass(row.status)}>{row.status}</Badge></td>
                      <td className="px-4 py-3">{new Date(row.started_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">{row.rows_affected ?? '—'}</td>
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
