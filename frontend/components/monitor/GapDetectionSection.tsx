'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetchGapDetection } from '@/lib/api';
import { secondsAgo } from '@/lib/utils';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

export function GapDetectionSection() {
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const { data, error, isLoading } = useSWR(
    'gap-detection',
    fetchGapDetection,
    { refreshInterval: 300_000, onSuccess: () => setUpdatedAt(new Date()) }
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between pb-3 border-b border-black/5/[0.03] mb-4">
          <h2 className="text-lg font-semibold text-[#0F172A] tracking-tight">Gap Detection</h2>
          {updatedAt && (
            <span className="text-xs text-xs text-[#0F172A]/80 uppercase tracking-[0.1em] tracking-[0.2em] font-black font-medium">Updated {secondsAgo(updatedAt)}</span>
          )}
        </div>
        <p className="text-sm text-slate-600 mb-6">
          Daily tables missing trading days present in raw.prices (last 90 days)
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && <p className="text-sm text-slate-600 px-6 py-4">Loading…</p>}
        {error     && <p className="text-sm text-red-500 px-6 py-4">Failed to load</p>}
        {data && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5/[0.03] text-left text-xs text-slate-600 font-medium tracking-wide">
                <th className="px-6 py-4">Table</th>
                <th className="px-6 py-4">Missing Dates</th>
                <th className="px-6 py-4 text-right">Count</th>
              </tr>
            </thead>
            {['raw', 'clean', 'factor'].map((layer) => {
              const layerData = data.filter((row) => row.schema_name === layer);
              if (layerData.length === 0) return null;
              
              return (
                <tbody key={layer} className="divide-y divide-slate-100/50">
                  <tr>
                    <td colSpan={3} className="px-6 pt-6 pb-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-slate-50/30">
                      {layer} Layer
                    </td>
                  </tr>
                  {layerData.map((row) => (
                    <tr key={`${row.schema_name}.${row.table_name}`} className="hover:bg-white/60 backdrop-blur-xl/[0.02] transition-colors">
                      <td className="px-6 py-4 font-mono text-[#0F172A] text-xs">
                        {row.table_name}
                      </td>
                      <td className="px-6 py-3">
                        {row.gap_count === 0 ? (
                          <span className="text-emerald-600 font-semibold text-xs">✓ No gaps</span>
                        ) : (
                          <span className="text-rose-600 font-bold text-xs">✗ {row.gap_count} gap{row.gap_count > 1 ? 's' : ''}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-slate-600 text-xs font-mono text-right">
                        {row.gap_count === 0
                          ? '—'
                          : row.missing_dates.slice(0, 3).join(', ') + (row.missing_dates.length > 3 ? ` +${row.missing_dates.length - 3} more` : '')
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        )}
      </CardContent>
    </Card>
  );
}
